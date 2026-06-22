import type {
  CompleteInterviewTurnRequest,
  InterviewMemoryHitWire,
  InterviewMemorySearchRequest,
  InterviewRagContextRequest,
  InterviewTurnContextWire,
} from "../../../shared/interview-turn-internal.ts";
import type { InterviewTurnWorkflowParams } from "../../../shared/interview-turn-workflow.ts";
import type { TurnEventWire } from "../../../shared/jobs.ts";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

function baseUrl(): string {
  return requireEnv("EXEDRA_INTERNAL_URL").replace(/\/$/, "");
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${requireEnv("EXEDRA_INTERNAL_TOKEN")}`,
    "Content-Type": "application/json",
  };
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      if (text.length > 0) message = text;
    }
    throw new Error(message);
  }
  return JSON.parse(text) as T;
}

export async function fetchTurnContext(turnId: string): Promise<InterviewTurnContextWire> {
  const res = await fetch(
    `${baseUrl()}/internal/interview/turns/${encodeURIComponent(turnId)}/context`,
    {
      headers: authHeaders(),
    },
  );
  return readJson<InterviewTurnContextWire>(res);
}

export async function fetchRagContext(body: InterviewRagContextRequest): Promise<string | null> {
  const res = await fetch(`${baseUrl()}/internal/interview/memory/rag-context`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await readJson<{ memoryContext: string | null }>(res);
  return data.memoryContext;
}

export async function searchOrgMemories(
  body: InterviewMemorySearchRequest,
): Promise<InterviewMemoryHitWire[]> {
  const res = await fetch(`${baseUrl()}/internal/interview/memory/search-org`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await readJson<{ hits: InterviewMemoryHitWire[] }>(res);
  return data.hits;
}

export async function searchPersonalMemories(
  body: InterviewMemorySearchRequest,
): Promise<InterviewMemoryHitWire[]> {
  const res = await fetch(`${baseUrl()}/internal/interview/memory/search-personal`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await readJson<{ hits: InterviewMemoryHitWire[] }>(res);
  return data.hits;
}

type InternalDocumentWire = {
  id: string;
  fileName: string;
  mimeType: string;
};

export async function loadDocumentAttachment(
  documentId: string,
): Promise<{ documentId: string; fileName: string; mimeType: string; bytes: Uint8Array }> {
  const metaRes = await fetch(`${baseUrl()}/internal/documents/${encodeURIComponent(documentId)}`, {
    headers: authHeaders(),
  });
  const meta = await readJson<{ document: InternalDocumentWire }>(metaRes);
  const bytesRes = await fetch(
    `${baseUrl()}/internal/documents/${encodeURIComponent(documentId)}/bytes`,
    { headers: authHeaders() },
  );
  if (!bytesRes.ok) {
    let detail = `HTTP ${bytesRes.status}`;
    try {
      const data = (await bytesRes.clone().json()) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) detail = data.error;
    } catch {
      // ignore
    }
    throw new Error(`Failed to load document bytes (${detail})`);
  }
  const bytes = new Uint8Array(await bytesRes.arrayBuffer());
  return {
    documentId,
    fileName: meta.document.fileName,
    mimeType: meta.document.mimeType,
    bytes,
  };
}

export async function appendTurnEvents(turnId: string, events: TurnEventWire[]): Promise<void> {
  if (events.length === 0) return;
  const res = await fetch(
    `${baseUrl()}/internal/interview/turns/${encodeURIComponent(turnId)}/events`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ events }),
    },
  );
  await readJson<{ ok: boolean }>(res);
}

export async function completeTurn(
  turnId: string,
  body: CompleteInterviewTurnRequest,
): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/internal/interview/turns/${encodeURIComponent(turnId)}/complete`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    },
  );
  await readJson<{ ok: boolean }>(res);
}

export async function failTurn(turnId: string, error: string): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/internal/interview/turns/${encodeURIComponent(turnId)}/fail`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ error }),
    },
  );
  await readJson<{ ok: boolean }>(res);
}

const BATCH_MS = 50;
const BATCH_CHAR_LIMIT = 256;

type TurnEventWireInput =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool_error"; toolCallId: string; toolName: string; errorText: string }
  | { type: "belief_flag"; belief: string; sourceMessageId: string };

export class TurnEventBatcher {
  private turnId: string;
  private deltaBuffer = "";
  private pending: TurnEventWire[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushChain: Promise<void> = Promise.resolve();

  constructor(turnId: string) {
    this.turnId = turnId;
  }

  private withTurnId(event: TurnEventWireInput): TurnEventWire {
    return { ...event, turnId: this.turnId };
  }

  push(event: TurnEventWireInput): void {
    if (event.type === "text_delta") {
      this.deltaBuffer += event.delta;
      if (this.deltaBuffer.length >= BATCH_CHAR_LIMIT) {
        void this.flush();
        return;
      }
      this.scheduleFlush();
      return;
    }
    void this.flush().then(() => {
      this.pending.push(this.withTurnId(event));
      return this.flushNow();
    });
  }

  private scheduleFlush(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, BATCH_MS);
  }

  async flush(): Promise<void> {
    this.flushChain = this.flushChain.then(async () => {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.deltaBuffer.length > 0) {
        this.pending.push(this.withTurnId({ type: "text_delta", delta: this.deltaBuffer }));
        this.deltaBuffer = "";
      }
      await this.flushNow();
    });
    return this.flushChain;
  }

  private async flushNow(): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = this.pending.splice(0, this.pending.length);
    await appendTurnEvents(this.turnId, batch);
  }
}

export type { InterviewTurnWorkflowParams };
