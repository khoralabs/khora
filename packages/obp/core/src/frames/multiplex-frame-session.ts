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
import { applyTurn, parseTurnBody } from "./graph-effect.ts";
import type { FrameSigner, FrameVerifier } from "./signer.ts";
import { accumulateTaggedSessionOps, type SessionOp } from "./to-session-op.ts";
import type {
  Frame,
  FrameSessionHandle,
  FrameSessionHandlers,
  SessionCheckpoint,
  SessionEnvelopeWire,
  SessionInit,
  TurnBody,
} from "./types.ts";

export type SessionEnvelopeSyncAdapter = {
  myPartyId: string;
  checkpointFromOps: (ops: SessionOp[]) => SessionCheckpoint;
  verifyExtends: (args: {
    baseOps: unknown[];
    deltaOps: unknown[];
    claimed: SessionCheckpoint;
  }) => { ok: true; checkpoint: SessionCheckpoint } | { ok: false; error: { code: string } };
};

export type RunFrameMultiplexSessionArgs = {
  role: "initiator" | "responder";
  channel: FrameChannel;
  signer: FrameSigner;
  verifier: FrameVerifier;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  /** Wire `init` must match these `party_ids` and `actor_pubkeys`; each chain may use its own `session_id` / `genesis_hash`. */
  sessionTemplate: Pick<SessionInit, "party_ids" | "actor_pubkeys">;
  handlers: FrameSessionHandlers;
  sessionEnvelopeSync?: SessionEnvelopeSyncAdapter;
  graphApplyOutbound?: boolean;
  /**
   * Initiator only: ordered chain opens. First is sent when the session starts; each subsequent plan is sent after
   * the prior chain ends (TERMINATE processed). Responders omit this or pass `[]`.
   */
  initiatorChainPlans?: Array<{ init: SessionInit; initialTurn?: TurnBody }>;
  /** When true, inbound or local TERMINATE calls `channel.close()` after tearing down that chain. Default false. */
  closeChannelOnTerminate?: boolean;
  /**
   * Initiator: after the last chain is torn down and there are no further plans, call `channel.close()` so this runner
   * completes. Default true. Responders ignore this.
   */
  closeChannelWhenIdle?: boolean;
};

type ChainState = {
  init: SessionInit;
  dag: FrameDag;
  sessionOps: SessionOp[];
  confirmedSeq: number;
  pendingAck: boolean;
  active: boolean;
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

function templateMatch(
  wire: SessionInit,
  t: Pick<SessionInit, "party_ids" | "actor_pubkeys">,
): boolean {
  return (
    wire.party_ids[0] === t.party_ids[0] &&
    wire.party_ids[1] === t.party_ids[1] &&
    wire.actor_pubkeys[0] === t.actor_pubkeys[0] &&
    wire.actor_pubkeys[1] === t.actor_pubkeys[1]
  );
}

function ensureActorSignerAligned(
  init: SessionInit,
  signer: FrameSigner,
  role: "initiator" | "responder",
): void {
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

function turnBodyToWireRecord(body: TurnBody): Record<string, unknown> {
  const o: Record<string, unknown> = {
    offerId: body.offerId,
    offerType: body.offerType,
  };
  if (body.turn_seq !== undefined) o.turn_seq = body.turn_seq;
  if (body.sourcemaps !== undefined && body.sourcemaps.length > 0) {
    o.sourcemaps = body.sourcemaps;
  }
  if (body.ttl !== undefined) o.ttl = body.ttl;
  if (body.ports !== undefined && body.ports.length > 0) o.ports = body.ports;
  if (body.bindPortId !== undefined && body.bindPortId !== "") o.bindPortId = body.bindPortId;
  if (body.counterparty_bind !== undefined) o.counterparty_bind = body.counterparty_bind;
  if (body.content_receipts !== undefined && body.content_receipts.length > 0) {
    o.content_receipts = body.content_receipts;
  }
  return o;
}

/** Run multiple {@link SessionInit} chains on one {@link FrameChannel}; route frames by `p_hash` → registered tip / genesis. */
export async function runFrameMultiplexSession(
  args: RunFrameMultiplexSessionArgs,
): Promise<SessionOp[]> {
  const {
    channel,
    signer,
    verifier,
    persistence,
    ledgerSeq,
    sessionTemplate,
    handlers,
    role,
    sessionEnvelopeSync,
    graphApplyOutbound,
  } = args;
  const plans = args.initiatorChainPlans ?? [];
  const closeChannelOnTerminate = args.closeChannelOnTerminate === true;
  const closeChannelWhenIdle = args.closeChannelWhenIdle !== false;

  const templateInit: SessionInit = {
    session_id: "__template__",
    party_ids: sessionTemplate.party_ids,
    actor_pubkeys: sessionTemplate.actor_pubkeys,
    genesis_hash: "__template_genesis__",
  };
  if (role === "initiator") {
    const p0 = plans[0];
    if (p0 === undefined) {
      throw new ObpError("VALIDATION", "initiatorChainPlans must be non-empty for initiator role");
    }
    ensureActorSignerAligned(p0.init, signer, "initiator");
  } else {
    ensureActorSignerAligned(templateInit, signer, "responder");
  }

  const obp = new OBPPersistenceClient(persistence, { ledgerSeq });
  const chains = new Map<string, ChainState>();
  /** Maps current tip hex and each registered genesis → session_id */
  const tipToSession = new Map<string, string>();
  const globalOps: SessionOp[] = [];
  const globalDedupe = new Set<string>();
  let channelDead = false;
  /** Chains fully torn down; ignore late `session_envelope` for these (Merkle sync can trail TER on the wire). */
  const endedSessionIds = new Set<string>();

  const registerChain = (wire: SessionInit): void => {
    if (!templateMatch(wire, sessionTemplate)) {
      throw new ObpError("VALIDATION", "init does not match session template");
    }
    if (chains.has(wire.session_id)) {
      throw new ObpError("VALIDATION", "duplicate session_id for open multiplex chain");
    }
    if (tipToSession.has(wire.genesis_hash)) {
      throw new ObpError("VALIDATION", "duplicate genesis_hash for open multiplex chain");
    }
    chains.set(wire.session_id, {
      init: wire,
      dag: new FrameDag(wire.genesis_hash),
      sessionOps: [],
      confirmedSeq: 0,
      pendingAck: false,
      active: true,
    });
    tipToSession.set(wire.genesis_hash, wire.session_id);
  };

  const removeTipsForSession = (sessionId: string): void => {
    for (const [tip, sid] of [...tipToSession.entries()]) {
      if (sid === sessionId) tipToSession.delete(tip);
    }
  };

  const resolveChain = (pHash: string): ChainState => {
    const sid = tipToSession.get(pHash);
    if (sid === undefined) {
      throw new ObpError("VALIDATION", "p_hash does not match any open chain tip or genesis");
    }
    const c = chains.get(sid);
    if (c === undefined || !c.active) {
      throw new ObpError("VALIDATION", "chain not active for p_hash");
    }
    return c;
  };

  const advanceTip = (c: ChainState, oldP: string): void => {
    tipToSession.delete(oldP);
    tipToSession.set(c.dag.tipHash, c.init.session_id);
  };

  const frameDedupeKey = async (frame: Frame): Promise<string> =>
    sha256HexUtf8(`${frame.p_hash}:${frame.sig}`);

  const flushSessionEnvelopeFor = async (sid: string): Promise<void> => {
    if (sessionEnvelopeSync === undefined || channelDead) return;
    const chain = chains.get(sid);
    if (chain === undefined || !chain.active) return;
    const { sessionOps, confirmedSeq } = chain;
    const deltaRaw = sessionOps.slice(confirmedSeq);
    if (deltaRaw.length === 0 && !chain.pendingAck) return;
    chain.pendingAck = false;
    const wireSessionOps = sessionOps.map((op) => JSON.parse(canonicalJsonString(op)) as SessionOp);
    const baseSlice = wireSessionOps.slice(0, confirmedSeq);
    const deltaSlice = wireSessionOps.slice(confirmedSeq);
    const envelope: SessionEnvelopeWire = {
      session_id: sid,
      from_party: sessionEnvelopeSync.myPartyId,
      base_checkpoint: sessionEnvelopeSync.checkpointFromOps(baseSlice),
      delta_ops: [...deltaSlice],
      new_checkpoint: sessionEnvelopeSync.checkpointFromOps(wireSessionOps),
    };
    await channel.write(encodeSessionEnvelopeMessage(envelope));
  };

  const envelopeFlushBySid = new Map<string, Promise<void> | null>();
  const requestEnvelopeFlush = (sid: string): Promise<void> => {
    if (sessionEnvelopeSync === undefined || channelDead) return Promise.resolve();
    const existing = envelopeFlushBySid.get(sid);
    if (existing) return existing;
    const p = Promise.resolve().then(async () => {
      envelopeFlushBySid.set(sid, null);
      await flushSessionEnvelopeFor(sid);
    });
    envelopeFlushBySid.set(sid, p);
    return p;
  };

  const handleInboundSessionEnvelope = async (envelope: SessionEnvelopeWire): Promise<void> => {
    if (sessionEnvelopeSync === undefined) {
      throw new ObpError("VALIDATION", "unexpected session_envelope (sync disabled)");
    }
    const sid = envelope.session_id;
    const chain = chains.get(sid);
    if (chain === undefined) {
      if (endedSessionIds.has(sid)) {
        return;
      }
      throw new ObpError("VALIDATION", "session_envelope for unknown or inactive chain");
    }
    if (!chain.active) {
      throw new ObpError("VALIDATION", "session_envelope for unknown or inactive chain");
    }
    if (envelope.from_party === sessionEnvelopeSync.myPartyId) {
      throw new ObpError("VALIDATION", "session_envelope from_party is self");
    }
    const baseSeq = envelope.base_checkpoint.seq;
    const newSeq = envelope.new_checkpoint.seq;
    const sessionOps = chain.sessionOps;
    if (sessionOps.length < baseSeq) {
      throw new ObpError("VALIDATION", "local session ops lag session_envelope base");
    }
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
    chain.confirmedSeq = newSeq;
    chain.pendingAck = true;
    await requestEnvelopeFlush(sid);
  };

  const sendWire = async (frame: Frame): Promise<void> => {
    await channel.write(encodeFramedJson(frame));
  };

  let initiatorPlanIdx = 0;

  const startNextInitiatorChain = async (): Promise<void> => {
    if (role !== "initiator") return;
    initiatorPlanIdx += 1;
    const plan = plans[initiatorPlanIdx];
    if (plan === undefined) {
      if (
        closeChannelWhenIdle &&
        chains.size === 0 &&
        !channelDead
      ) {
        channelDead = true;
        await channel.close();
      }
      return;
    }
    if (!templateMatch(plan.init, sessionTemplate)) {
      throw new ObpError("VALIDATION", "initiator chain init does not match template");
    }
    ensureActorSignerAligned(plan.init, signer, "initiator");
    await channel.write(encodeFramedJson({ init: plan.init }));
    registerChain(plan.init);
    if (plan.initialTurn !== undefined) {
      await emitOutboundTurn(plan.init.session_id, plan.initialTurn);
    }
  };

  const emitOutboundTurn = async (sessionId: string, body: TurnBody): Promise<void> => {
    const chain = chains.get(sessionId);
    if (chain === undefined || !chain.active) {
      throw new ObpError("VALIDATION", "emitOutboundTurn: unknown or inactive chain");
    }
    const wire = turnBodyToWireRecord(body);
    const oldP = chain.dag.tipHash;
    const frame = await chain.dag.mintOutbound(signer, "TURN", wire);
    const key = await frameDedupeKey(frame);
    if (globalDedupe.has(key)) return;
    globalDedupe.add(key);
    accumulateTaggedSessionOps(chain.sessionOps, frame, sessionId);
    accumulateTaggedSessionOps(globalOps, frame, sessionId);
    tipToSession.delete(oldP);
    tipToSession.set(chain.dag.tipHash, sessionId);
    if (graphApplyOutbound === true) {
      applyTurn(obp, partyIdForActor(chain.init, frame.actor), parseTurnBody(frame.body));
    }
    await sendWire(frame);
    await requestEnvelopeFlush(sessionId);
  };

  const applyInboundGraph = async (c: ChainState, frame: Frame): Promise<void> => {
    const key = await frameDedupeKey(frame);
    if (globalDedupe.has(key)) return;
    globalDedupe.add(key);
    accumulateTaggedSessionOps(c.sessionOps, frame, c.init.session_id);
    accumulateTaggedSessionOps(globalOps, frame, c.init.session_id);
    if (frame.type === "TURN") {
      const body = parseTurnBody(frame.body);
      applyTurn(obp, partyIdForActor(c.init, frame.actor), body);
    }
  };

  /** @param notifyTerminate fire `onTerminate` (inbound peer TERMINATE only; not local `handle.terminate()`). */
  const destroyChain = async (
    sid: string,
    reason: string,
    code: string | undefined,
    notifyTerminate: boolean,
  ): Promise<void> => {
    const c = chains.get(sid);
    if (c === undefined) return;
    c.active = false;
    removeTipsForSession(sid);
    endedSessionIds.add(sid);
    chains.delete(sid);
    if (notifyTerminate) {
      await handlers.onTerminate?.(reason, code, sid);
    }
    if (role === "initiator") {
      await startNextInitiatorChain();
    }
  };

  const makeHandle = (c: ChainState): FrameSessionHandle => ({
    sessionId: c.init.session_id,
    init: c.init,
    get remoteActor() {
      return remoteActorForRole(c.init, role);
    },
    get tipHash() {
      return c.dag.tipHash;
    },
    async terminate(reason: string, code?: string) {
      const body: Record<string, unknown> = { reason, ...(code !== undefined ? { code } : {}) };
      const oldP = c.dag.tipHash;
      const frame = await c.dag.mintOutbound(signer, "TERMINATE", body);
      const key = await frameDedupeKey(frame);
      if (!globalDedupe.has(key)) {
        globalDedupe.add(key);
        accumulateTaggedSessionOps(c.sessionOps, frame, c.init.session_id);
        accumulateTaggedSessionOps(globalOps, frame, c.init.session_id);
        tipToSession.delete(oldP);
        tipToSession.set(c.dag.tipHash, c.init.session_id);
      }
      await sendWire(frame);
      await requestEnvelopeFlush(c.init.session_id);
      await destroyChain(c.init.session_id, reason, code, false);
      if (closeChannelOnTerminate) {
        channelDead = true;
        await channel.close();
      }
    },
  });

  const handleInboundFrame = async (frame: Frame): Promise<void> => {
    const c = resolveChain(frame.p_hash);
    const key = await frameDedupeKey(frame);
    if (globalDedupe.has(key)) {
      return;
    }
    const oldP = frame.p_hash;
    await c.dag.appendInbound(frame, verifier);
    await applyInboundGraph(c, frame);
    advanceTip(c, oldP);

    if (frame.type === "TURN") {
      const body = parseTurnBody(frame.body);
      let replied = false;
      if (handlers.onIncomingOffer !== undefined) {
        const reply = await handlers.onIncomingOffer(body, makeHandle(c));
        if (reply !== null) {
          await emitOutboundTurn(c.init.session_id, reply);
          replied = true;
        }
      }
      if (!replied) await requestEnvelopeFlush(c.init.session_id);
      return;
    }

    if (frame.type === "TERMINATE") {
      const reason = String(frame.body.reason ?? "");
      const code = frame.body.code !== undefined ? String(frame.body.code) : undefined;
      await destroyChain(c.init.session_id, reason, code, true);
      if (closeChannelOnTerminate) {
        channelDead = true;
        await channel.close();
      }
      return;
    }

    throw new ObpError("VALIDATION", `unknown frame type: ${(frame as Frame).type}`);
  };

  const decoder = createFrameDecoder();

  const processYield = async (part: FrameDecoderYield): Promise<void> => {
    if (part.kind === "raw") {
      throw new ObpError("VALIDATION", "unexpected wire payload");
    }
    if (part.kind === "init") {
      registerChain(parseWireInit(part.value));
      return;
    }
    if (part.kind === "session_envelope") {
      await handleInboundSessionEnvelope(part.value);
      return;
    }
    if (part.kind !== "frame") {
      throw new ObpError("VALIDATION", "unexpected decoder yield");
    }
    if (chains.size === 0) {
      throw new ObpError("VALIDATION", "expected init before frames");
    }
    await handleInboundFrame(part.value);
  };

  if (role === "initiator") {
    const p0 = plans[0];
    if (p0 === undefined) throw new ObpError("VALIDATION", "no initiator plans");
    if (!templateMatch(p0.init, sessionTemplate)) {
      throw new ObpError("VALIDATION", "first initiator init does not match sessionTemplate");
    }
    await channel.write(encodeFramedJson({ init: p0.init }));
    registerChain(p0.init);
    if (p0.initialTurn !== undefined) {
      await emitOutboundTurn(p0.init.session_id, p0.initialTurn);
    }
  }

  for await (const chunk of channel.read()) {
    for (const part of decoder.push(chunk)) {
      await processYield(part);
      if (channelDead) return globalOps;
    }
  }

  return globalOps;
}
