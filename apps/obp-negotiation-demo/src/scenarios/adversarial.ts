import type { Database } from "bun:sqlite";
import { ObpError } from "@cfd/obp-core";
import type { DemoAgents } from "../agents/buildAgents.ts";
import { createDemoStack } from "../obp/demoPersistence.ts";
import { agentSourcemaps } from "../obp/sourcemaps.ts";
import type { TranscriptStep } from "./types.ts";

function insertOrphanPort(
  db: Database,
  args: {
    id: string;
    ts_created: number;
    ts_expired: number;
    type: string;
    max_bindings: number;
  },
): void {
  db.run(
    `INSERT INTO obp_ports (id, ts_created, ts_expired, type, max_bindings, terminal, ref, sourcemaps_json)
     VALUES (?, ?, ?, ?, ?, 0, '', '[]')`,
    [args.id, args.ts_created, args.ts_expired, args.type, args.max_bindings],
  );
}

export async function runAdversarial(agents: DemoAgents): Promise<TranscriptStep[]> {
  const steps: TranscriptStep[] = [];

  steps.push({
    kind: "info",
    label: "scenario.beat",
    data: {
      id: "not_exposed_bind",
      note: "Bind to a port that exists but is not on any EXPOSES edge.",
    },
  });

  {
    const { client, db, now } = createDemoStack();
    const t = now();

    const { party: buyerParty } = client.registerParty({
      name: agents.buyer.name,
      sourcemaps: agentSourcemaps(agents.buyer),
    });
    const { party: sellerParty } = client.registerParty({
      name: agents.seller.name,
      sourcemaps: agentSourcemaps(agents.seller),
    });

    const { offer } = client.extendOffer({
      partyId: sellerParty.id,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: t,
        ts_expired: t + 86_400_000,
        type: "adversarial.offer.v1",
        sourcemaps: [],
      },
    });

    const orphanPortId = crypto.randomUUID();
    insertOrphanPort(db, {
      id: orphanPortId,
      ts_created: t,
      ts_expired: t + 86_400_000,
      type: "adversarial.port.orphan",
      max_bindings: 1,
    });

    try {
      client.bindPort({ offerId: offer.id, portId: orphanPortId });
      steps.push({
        kind: "obp",
        op: "bindPort",
        ok: false,
        code: "UNEXPECTED",
        message: "expected NOT_EXPOSED",
      });
    } catch (e) {
      if (e instanceof ObpError) {
        steps.push({
          kind: "obp",
          op: "bindPort",
          ok: false,
          code: e.code,
          message: e.message,
        });
      } else {
        throw e;
      }
    }
    void buyerParty;
  }

  steps.push({
    kind: "info",
    label: "scenario.beat",
    data: {
      id: "max_bindings_zero",
      note: "Exposed port with max_bindings 0 cannot accept a bind.",
    },
  });

  {
    const { client, now } = createDemoStack();
    const t = now();

    const { party: sellerParty } = client.registerParty({
      name: agents.seller.name,
      sourcemaps: agentSourcemaps(agents.seller),
    });

    const { offer } = client.extendOffer({
      partyId: sellerParty.id,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: t,
        ts_expired: t + 86_400_000,
        type: "adversarial.offer.v2",
        sourcemaps: [],
      },
    });

    const { port } = client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        ts_created: t,
        ts_expired: t + 86_400_000,
        type: "adversarial.port.saturated",
        max_bindings: 0,
        terminal: false,
        ref: "",
        sourcemaps: [],
      },
    });

    try {
      client.bindPort({ offerId: offer.id, portId: port.id });
      steps.push({
        kind: "obp",
        op: "bindPort",
        ok: false,
        code: "UNEXPECTED",
        message: "expected MAX_BINDINGS",
      });
    } catch (e) {
      if (e instanceof ObpError) {
        steps.push({
          kind: "obp",
          op: "bindPort",
          ok: false,
          code: e.code,
          message: e.message,
        });
      } else {
        throw e;
      }
    }
  }

  steps.push({
    kind: "info",
    label: "scenario.beat",
    data: { id: "duplicate_bind", note: "Second identical bind hits UNIQUE / validation." },
  });

  {
    const { client, now } = createDemoStack();
    const t = now();

    const { party: sellerParty } = client.registerParty({
      name: agents.seller.name,
      sourcemaps: agentSourcemaps(agents.seller),
    });

    const { offer } = client.extendOffer({
      partyId: sellerParty.id,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: t,
        ts_expired: t + 86_400_000,
        type: "adversarial.offer.v3",
        sourcemaps: [],
      },
    });

    const { port } = client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        ts_created: t,
        ts_expired: t + 86_400_000,
        type: "adversarial.port.dup",
        max_bindings: 2,
        terminal: false,
        ref: "",
        sourcemaps: [],
      },
    });

    client.bindPort({ offerId: offer.id, portId: port.id });
    steps.push({
      kind: "obp",
      op: "bindPort",
      ok: true,
      detail: { offerId: offer.id, portId: port.id, note: "first bind ok" },
    });

    try {
      client.bindPort({ offerId: offer.id, portId: port.id });
      steps.push({
        kind: "obp",
        op: "bindPort",
        ok: false,
        code: "UNEXPECTED",
        message: "expected duplicate error",
      });
    } catch (e) {
      if (e instanceof ObpError) {
        steps.push({
          kind: "obp",
          op: "bindPort",
          ok: false,
          code: e.code,
          message: e.message,
        });
      } else {
        throw e;
      }
    }
  }

  return steps;
}
