import {
  type CellNodeBatch,
  type CellNodeClient,
  type GroupedPartitionPersistence,
  StaleCellRouteEpochError,
} from "./cell-node";
import type { EnqueueInboxDeliveryOutput } from "./colonnade-types";
import type { CellRoute } from "./placement";

export type HttpCellNodeClientOptions = {
  readonly token: string;
  readonly fetch?: CellNodeFetch;
};

export type CellNodeFetch = (url: string, init: RequestInit) => Promise<Response>;

export class HttpCellNodeClient implements CellNodeClient {
  private readonly fetch: CellNodeFetch;

  constructor(private readonly opts: HttpCellNodeClientOptions) {
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
  }

  async enqueueMany(
    route: CellRoute,
    batch: CellNodeBatch,
  ): Promise<readonly EnqueueInboxDeliveryOutput[]> {
    const response = await this.fetch(
      `${route.endpoint.replace(/\/$/, "")}/v1/cell-node/inbox-deliveries`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.token}`,
          "content-type": "application/json",
        },
        body: stringifyWire(batch),
      },
    );
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Cell node HTTP ${response.status}: non-JSON response`);
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(`Cell node HTTP ${response.status}: invalid response`);
    }
    const body = parsed as {
      outputs?: EnqueueInboxDeliveryOutput[];
      error?: string;
      expectedEpoch?: number;
      actualEpoch?: number;
    };
    if (response.status === 409 && body.error === "stale_epoch") {
      throw new StaleCellRouteEpochError(body.expectedEpoch ?? batch.epoch, body.actualEpoch ?? -1);
    }
    if (!response.ok || body.outputs === undefined) {
      throw new Error(body.error ?? `Cell node HTTP ${response.status}`);
    }
    return body.outputs;
  }
}

export type CellNodeHttpHandlerOptions = {
  readonly token: string;
  readonly resolvePartition: (partitionId: string) => GroupedPartitionPersistence | undefined;
};

export function createCellNodeHttpHandler(
  opts: CellNodeHttpHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/cell-node/inbox-deliveries") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (request.headers.get("authorization") !== `Bearer ${opts.token}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    let parsed: unknown;
    try {
      parsed = parseWire(await request.text());
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("partitionId" in parsed) ||
      typeof parsed.partitionId !== "string" ||
      !("epoch" in parsed) ||
      typeof parsed.epoch !== "number" ||
      !("deliveries" in parsed) ||
      !Array.isArray(parsed.deliveries) ||
      parsed.deliveries.length > 512
    ) {
      return Response.json({ error: "invalid_batch" }, { status: 400 });
    }
    const batch = parsed as CellNodeBatch;
    const partition = opts.resolvePartition(batch.partitionId);
    if (partition === undefined) {
      return Response.json({ error: "unknown_partition" }, { status: 404 });
    }
    try {
      return Response.json({ outputs: await partition.enqueueMany(batch) });
    } catch (error) {
      if (error instanceof StaleCellRouteEpochError) {
        return Response.json(
          {
            error: "stale_epoch",
            expectedEpoch: error.expectedEpoch,
            actualEpoch: error.actualEpoch,
          },
          { status: 409 },
        );
      }
      return Response.json(
        { error: error instanceof Error ? error.message : "cell_node_error" },
        { status: 500 },
      );
    }
  };
}

function stringifyWire(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Uint8Array ? { $bytes: Buffer.from(item).toString("base64") } : item,
  );
}

function parseWire(value: string): unknown {
  return JSON.parse(value, (_key, item: unknown) => {
    if (
      typeof item === "object" &&
      item !== null &&
      "$bytes" in item &&
      typeof (item as { $bytes?: unknown }).$bytes === "string"
    ) {
      return new Uint8Array(Buffer.from((item as { $bytes: string }).$bytes, "base64"));
    }
    return item;
  });
}
