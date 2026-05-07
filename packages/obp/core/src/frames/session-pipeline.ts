import { ObpError } from "../persistence/client/errors.ts";
import { OBPPersistenceClient } from "../persistence/client/obp-persistence-client.ts";
import type { ObpPersistence } from "../persistence/client/persistence-types.ts";
import { canonicalJsonString } from "./canonical.ts";
import type { FrameChannel } from "./channel.ts";
import { FrameDag, sha256HexUtf8 } from "./dag.ts";
import {
  createFrameDecoder,
  encodeFramedJson,
  encodeSessionEnvelopeMessage,
  type FrameDecoderYield,
} from "./framing.ts";
import {
  applyProliferate,
  applyResolve,
  parseProliferateBody,
  parseResolveBody,
} from "./graph-effect.ts";
import type { FrameSigner, FrameVerifier } from "./signer.ts";
import { accumulateSessionOps, type SessionOp } from "./to-session-op.ts";
import type {
  Frame,
  FrameSessionHandle,
  PortSpec,
  ProliferateBody,
  ResolveBody,
  SessionCheckpoint,
  SessionEnvelopeWire,
  SessionInit,
} from "./types.ts";

export type FrameSessionHandlers = {
  /** Responder (server): first phase — send greeting / ports. */
  onConnect?: (session: FrameSessionHandle) => Promise<void>;
  /** Initiator (client): pick a binding for the latest proliferate. Return `null` to stall (not typical). */
  onProliferate?: (
    body: ProliferateBody,
    session: FrameSessionHandle,
  ) => Promise<{ portId: string; payload?: Record<string, unknown> } | null>;
  /** Responder: client bound a port. */
  onBind?: (
    portId: string,
    payload: Record<string, unknown> | undefined,
    session: FrameSessionHandle,
  ) => Promise<void>;
  onTerminate?: (reason: string, code?: string) => Promise<void>;
};

/** Injected Merkle helpers (from `@cfd/obp-session-sync` at the app layer; avoids core → session-sync cycle). */
export type SessionEnvelopeSyncAdapter = {
  myPartyId: string;
  checkpointFromOps: (ops: SessionOp[]) => SessionCheckpoint;
  verifyExtends: (args: {
    baseOps: unknown[];
    deltaOps: unknown[];
    claimed: SessionCheckpoint;
  }) => { ok: true; checkpoint: SessionCheckpoint } | { ok: false; error: { code: string } };
};

export type RunFrameSessionArgs = {
  role: "initiator" | "responder";
  channel: FrameChannel;
  signer: FrameSigner;
  verifier: FrameVerifier;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  init: SessionInit;
  handlers: FrameSessionHandlers;
  /** When set, multiplex `session_envelope` on the same stream (after frames); ops must match frame-derived log. */
  sessionEnvelopeSync?: SessionEnvelopeSyncAdapter;
  /**
   * When each peer has its own {@link ObpPersistence}, set true so outbound PROLIFERATE / RESOLVE also
   * run {@link applyProliferate} / {@link applyResolve} locally (inbound already does). Default false keeps
   * shared-persistence setups from double-applying graph effects.
   */
  graphApplyOutbound?: boolean;
};

function partyIdForActor(init: SessionInit, actor: string): string {
  if (actor === init.actor_pubkeys[0]) return init.party_ids[0];
  if (actor === init.actor_pubkeys[1]) return init.party_ids[1];
  throw new ObpError("VALIDATION", `unknown actor ${actor}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function parseWireInit(v: unknown): SessionInit {
  if (!isRecord(v) || !("init" in v)) {
    throw new ObpError("VALIDATION", "expected init envelope");
  }
  const init = v.init as Record<string, unknown>;
  const session_id = String(init.session_id ?? "");
  const genesis_hash = String(init.genesis_hash ?? "");
  const partyIds = Array.isArray(init.party_ids) ? init.party_ids : [];
  const keys = Array.isArray(init.actor_pubkeys)
    ? init.actor_pubkeys
    : Array.isArray(init.actors)
      ? init.actors
      : [];
  if (partyIds.length !== 2 || keys.length !== 2) {
    throw new ObpError("VALIDATION", "init requires party_ids[2] and actor_pubkeys[2]");
  }
  return {
    session_id,
    party_ids: [String(partyIds[0]), String(partyIds[1])],
    actor_pubkeys: [String(keys[0]), String(keys[1])],
    genesis_hash,
  };
}

function ensureActorSignerAligned(init: SessionInit, signer: FrameSigner, role: string): void {
  const expected = role === "responder" ? init.actor_pubkeys[0] : init.actor_pubkeys[1];
  if (signer.actor !== expected) {
    throw new ObpError(
      "VALIDATION",
      `signer.actor ${signer.actor} does not match expected ${role}`,
    );
  }
}

function remoteActorForRole(init: SessionInit, role: "initiator" | "responder"): string {
  if (role === "responder") {
    const k = init.actor_pubkeys[1];
    if (k === undefined) throw new ObpError("VALIDATION", "missing initiator actor pubkey");
    return k;
  }
  const k = init.actor_pubkeys[0];
  if (k === undefined) throw new ObpError("VALIDATION", "missing responder actor pubkey");
  return k;
}

export async function runFrameSession(args: RunFrameSessionArgs): Promise<SessionOp[]> {
  const {
    channel,
    signer,
    verifier,
    persistence,
    ledgerSeq,
    init,
    handlers,
    role,
    sessionEnvelopeSync,
    graphApplyOutbound,
  } = args;
  ensureActorSignerAligned(init, signer, role === "responder" ? "responder" : "initiator");

  const obp = new OBPPersistenceClient(persistence, { ledgerSeq });
  const dag = new FrameDag(init.genesis_hash);
  const sessionOps: SessionOp[] = [];
  const appliedFrames = new Set<string>();
  let terminated = false;
  let responderInitDone = role === "initiator";
  let confirmedSeq = 0;
  let pendingAck = false;

  const flushSessionEnvelope = async (): Promise<void> => {
    if (sessionEnvelopeSync === undefined || terminated) return;
    const deltaRaw = sessionOps.slice(confirmedSeq);
    if (deltaRaw.length === 0 && !pendingAck) return;
    pendingAck = false;
    /** Wire-round-trip each op so Merkle leaves match `JSON.parse`d envelope deltas (session-sync hashing). */
    const wireSessionOps = sessionOps.map((op) => JSON.parse(canonicalJsonString(op)) as SessionOp);
    const baseSlice = wireSessionOps.slice(0, confirmedSeq);
    const deltaSlice = wireSessionOps.slice(confirmedSeq);
    const envelope: SessionEnvelopeWire = {
      session_id: init.session_id,
      from_party: sessionEnvelopeSync.myPartyId,
      base_checkpoint: sessionEnvelopeSync.checkpointFromOps(baseSlice),
      delta_ops: [...deltaSlice],
      new_checkpoint: sessionEnvelopeSync.checkpointFromOps(wireSessionOps),
    };
    await channel.write(encodeSessionEnvelopeMessage(envelope));
  };

  /** Coalesce flushes in one turn so nested `expose`/`resolve` from handlers does not emit duplicate envelopes before `confirmedSeq` advances. */
  let envelopeFlushScheduled: Promise<void> | null = null;
  const requestEnvelopeFlush = (): Promise<void> => {
    if (sessionEnvelopeSync === undefined || terminated) {
      return Promise.resolve();
    }
    if (envelopeFlushScheduled) return envelopeFlushScheduled;
    envelopeFlushScheduled = Promise.resolve().then(async () => {
      envelopeFlushScheduled = null;
      await flushSessionEnvelope();
    });
    return envelopeFlushScheduled;
  };

  const handleInboundSessionEnvelope = async (envelope: SessionEnvelopeWire): Promise<void> => {
    if (sessionEnvelopeSync === undefined) {
      throw new ObpError("VALIDATION", "unexpected session_envelope (sync disabled)");
    }
    if (envelope.session_id !== init.session_id) {
      throw new ObpError("VALIDATION", "session_envelope session_id mismatch");
    }
    if (envelope.from_party === sessionEnvelopeSync.myPartyId) {
      throw new ObpError("VALIDATION", "session_envelope from_party is self");
    }
    const baseSeq = envelope.base_checkpoint.seq;
    const newSeq = envelope.new_checkpoint.seq;
    if (sessionOps.length < baseSeq) {
      throw new ObpError("VALIDATION", "local session ops lag session_envelope base");
    }
    /** Match sender `flushSessionEnvelope`: Merkle leaves use wire-round-tripped ops, not raw object refs. */
    const wireSessionOpsLocal = sessionOps.map(
      (op) => JSON.parse(canonicalJsonString(op)) as SessionOp,
    );
    const baseOps = wireSessionOpsLocal.slice(0, baseSeq) as unknown[];
    const v = sessionEnvelopeSync.verifyExtends({
      baseOps,
      deltaOps: envelope.delta_ops,
      claimed: envelope.new_checkpoint,
    });
    if (!v.ok) {
      throw new ObpError("VALIDATION", `session_envelope verify failed: ${v.error.code}`);
    }
    if (sessionOps.length < newSeq) {
      throw new ObpError("VALIDATION", "local session ops lag session_envelope (no catch-up)");
    }
    const delta = envelope.delta_ops;
    if (newSeq - baseSeq !== delta.length) {
      throw new ObpError("VALIDATION", "session_envelope delta length mismatch");
    }
    for (let i = 0; i < delta.length; i++) {
      const local = wireSessionOpsLocal[baseSeq + i];
      if (local === undefined) {
        throw new ObpError("VALIDATION", "session_envelope local op missing");
      }
      if (canonicalJsonString(local) !== canonicalJsonString(delta[i])) {
        throw new ObpError("VALIDATION", "session_envelope op mismatch vs frame-derived ops");
      }
    }
    confirmedSeq = newSeq;
    pendingAck = true;
    await requestEnvelopeFlush();
  };

  const frameDedupeKey = async (frame: Frame): Promise<string> =>
    sha256HexUtf8(`${frame.p_hash}:${frame.sig}`);

  const recordFrame = async (frame: Frame): Promise<void> => {
    const key = await frameDedupeKey(frame);
    if (appliedFrames.has(key)) {
      return;
    }
    appliedFrames.add(key);
    accumulateSessionOps(sessionOps, frame);
  };

  const applyInboundGraph = async (frame: Frame): Promise<void> => {
    const key = await frameDedupeKey(frame);
    if (appliedFrames.has(key)) {
      return;
    }
    appliedFrames.add(key);
    accumulateSessionOps(sessionOps, frame);
    if (frame.type === "PROLIFERATE") {
      const body = parseProliferateBody(frame.body);
      applyProliferate(obp, partyIdForActor(init, frame.actor), body);
    } else if (frame.type === "RESOLVE") {
      const body = parseResolveBody(frame.body);
      applyResolve(obp, partyIdForActor(init, frame.actor), body);
    }
  };

  const sendWire = async (frame: Frame): Promise<void> => {
    await channel.write(encodeFramedJson(frame));
  };

  const session: FrameSessionHandle = {
    sessionId: init.session_id,
    init,
    get remoteActor() {
      return remoteActorForRole(init, role);
    },
    get tipHash() {
      return dag.tipHash;
    },
    async expose(input: { offerId: string; ports: PortSpec[] }) {
      const asRecord = { offerId: input.offerId, ports: input.ports } as Record<string, unknown>;
      const parsed = parseProliferateBody(asRecord);
      const frame = await dag.mintOutbound(
        signer,
        "PROLIFERATE",
        parsed as unknown as Record<string, unknown>,
      );
      await recordFrame(frame);
      if (graphApplyOutbound === true) {
        applyProliferate(obp, partyIdForActor(init, frame.actor), parsed);
      }
      await sendWire(frame);
      await requestEnvelopeFlush();
    },
    async terminate(reason: string, code?: string) {
      const body: Record<string, unknown> = { reason, ...(code !== undefined ? { code } : {}) };
      const frame = await dag.mintOutbound(signer, "TERMINATE", body);
      await recordFrame(frame);
      await sendWire(frame);
      await requestEnvelopeFlush();
      terminated = true;
      await channel.close();
    },
    async resolve(plan: { offerId: string; portId: string; payload?: Record<string, unknown> }) {
      const body: ResolveBody = {
        offerId: plan.offerId,
        portId: plan.portId,
        payload: plan.payload,
      };
      const frame = await dag.mintOutbound(
        signer,
        "RESOLVE",
        body as unknown as Record<string, unknown>,
      );
      await recordFrame(frame);
      if (graphApplyOutbound === true) {
        applyResolve(obp, partyIdForActor(init, frame.actor), body);
      }
      await sendWire(frame);
      await requestEnvelopeFlush();
    },
  };

  const decoder = createFrameDecoder();

  const handleInboundFrame = async (frame: Frame): Promise<void> => {
    if (terminated) {
      throw new ObpError("TERMINATED", "session already terminated");
    }
    await dag.appendInbound(frame, verifier);
    await applyInboundGraph(frame);

    if (frame.type === "PROLIFERATE") {
      if (frame.actor !== init.actor_pubkeys[0]) {
        throw new ObpError("BAD_TURN", "PROLIFERATE must come from responder actor");
      }
      const body = parseProliferateBody(frame.body);
      let resolved = false;
      if (role === "initiator" && handlers.onProliferate) {
        const plan = await handlers.onProliferate(body, session);
        if (plan !== null) {
          await session.resolve({
            offerId: body.offerId,
            portId: plan.portId,
            ...(plan.payload !== undefined ? { payload: plan.payload } : {}),
          });
          resolved = true;
        }
      }
      if (!resolved) {
        await requestEnvelopeFlush();
      }
      return;
    }

    if (frame.type === "RESOLVE") {
      if (frame.actor !== init.actor_pubkeys[1]) {
        throw new ObpError("BAD_TURN", "RESOLVE must come from initiator actor");
      }
      const body = parseResolveBody(frame.body);
      if (role === "responder" && handlers.onBind) {
        await handlers.onBind(body.portId, body.payload, session);
      }
      if (!terminated) {
        await requestEnvelopeFlush();
      }
      return;
    }

    if (frame.type === "TERMINATE") {
      const reason = String(frame.body.reason ?? "");
      const code = frame.body.code !== undefined ? String(frame.body.code) : undefined;
      if (handlers.onTerminate) {
        await handlers.onTerminate(reason, code);
      }
      terminated = true;
      await channel.close();
      return;
    }

    throw new ObpError("VALIDATION", `unknown frame type: ${(frame as Frame).type}`);
  };

  const processYield = async (part: FrameDecoderYield): Promise<void> => {
    if (part.kind === "raw") {
      throw new ObpError("VALIDATION", "unexpected wire payload");
    }
    if (part.kind === "init") {
      if (role !== "responder" || responderInitDone) {
        return;
      }
      const wire = parseWireInit(part.value);
      if (wire.genesis_hash !== init.genesis_hash || wire.session_id !== init.session_id) {
        throw new ObpError("VALIDATION", "init mismatch");
      }
      responderInitDone = true;
      if (handlers.onConnect) {
        await handlers.onConnect(session);
      }
      return;
    }
    if (part.kind === "session_envelope") {
      if (!responderInitDone && role === "responder") {
        throw new ObpError("VALIDATION", "expected init before session_envelope");
      }
      await handleInboundSessionEnvelope(part.value);
      return;
    }
    if (!responderInitDone && role === "responder") {
      throw new ObpError("VALIDATION", "expected init before frames");
    }
    await handleInboundFrame(part.value);
  };

  if (role === "initiator") {
    await channel.write(encodeFramedJson({ init }));
  }

  for await (const chunk of channel.read()) {
    for (const part of decoder.push(chunk)) {
      await processYield(part);
      if (terminated) {
        return sessionOps;
      }
    }
  }

  return sessionOps;
}
