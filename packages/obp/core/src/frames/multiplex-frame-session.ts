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
import {
  canonicalSessionParties,
  normalizeSessionInit,
  sessionInitFromUnknownWireEnvelope,
  sessionInitToWire,
} from "./session-init-wire.ts";
import type { FrameSigner, FrameVerifier } from "./signer.ts";
import { accumulateTaggedSessionOps, type SessionOp } from "./to-session-op.ts";
import type {
  Frame,
  FrameMultiplexOpenerApi,
  FrameSessionHandle,
  FrameSessionHandlers,
  MultiplexChainHooks,
  SessionCheckpoint,
  SessionEnvelopeWire,
  SessionInit,
  TurnBody,
} from "./types.ts";

export type SessionEnvelopeSyncAdapter = {
  /** Use {@link getMyPartyId} when party id is known only after the first outbound `SessionInit`. */
  myPartyId?: string;
  getMyPartyId?: () => string;
  checkpointFromOps: (ops: SessionOp[]) => SessionCheckpoint;
  verifyExtends: (args: {
    baseOps: unknown[];
    deltaOps: unknown[];
    claimed: SessionCheckpoint;
  }) => { ok: true; checkpoint: SessionCheckpoint } | { ok: false; error: { code: string } };
};

export type RunFrameMultiplexSessionArgs = {
  channel: FrameChannel;
  signer: FrameSigner;
  verifier: FrameVerifier;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  /**
   * Fixed `parties` tuple for every chain on this byte stream.
   * Omit only when using {@link openerSession} without a prior template (frozen from first {@link FrameMultiplexOpenerApi.init}).
   */
  sessionTemplate?: Pick<SessionInit, "parties">;
  handlers: FrameSessionHandlers;
  sessionEnvelopeSync?: SessionEnvelopeSyncAdapter;
  /**
   * Ordered outbound `init`s when {@link openerSession} is omitted: after each chain ends (TERMINATE),
   * the next plan is written on the wire (the first plan is sent before the read loop starts).
   * Mutually exclusive with {@link openerSession}.
   */
  initiatorChainPlans?: Array<{ init: SessionInit }>;
  /** When true, inbound or local TERMINATE calls `channel.close()` after tearing down that chain. Default false. */
  closeChannelOnTerminate?: boolean;
  /**
   * After the last chain is torn down and the opener has finished ({@link FrameMultiplexOpenerApi.close} for user openers,
   * or no further sequential plans), call `channel.close()` so this runner completes. Default true.
   */
  closeChannelWhenIdle?: boolean;
  /**
   * Imperative outbound chains: runs in parallel with inbound decode; uses the same {@link FrameMultiplexOpenerApi.init}
   * path as sequential {@link initiatorChainPlans}.
   * Mutually exclusive with non-empty {@link initiatorChainPlans}.
   */
  openerSession?: (api: FrameMultiplexOpenerApi) => Promise<void>;
};

type ChainState = {
  init: SessionInit;
  dag: FrameDag;
  sessionOps: SessionOp[];
  confirmedSeq: number;
  pendingAck: boolean;
  active: boolean;
  hooks?: MultiplexChainHooks;
};

function partyIdForActor(init: SessionInit, actor: string): string {
  const p = init.parties.find((x) => x.pubkey === actor);
  if (p === undefined) throw new ObpError("VALIDATION", `unknown actor ${actor}`);
  return p.id;
}

function templateMatch(wire: SessionInit, t: Pick<SessionInit, "parties">): boolean {
  return (
    wire.parties[0].id === t.parties[0].id &&
    wire.parties[1].id === t.parties[1].id &&
    wire.parties[0].pubkey === t.parties[0].pubkey &&
    wire.parties[1].pubkey === t.parties[1].pubkey
  );
}

function ensureSignerInSession(init: SessionInit, signer: FrameSigner): void {
  if (!init.parties.some((p) => p.pubkey === signer.actor)) {
    throw new ObpError("VALIDATION", `signer.actor ${signer.actor} not in session parties`);
  }
}

function remoteActorForSigner(init: SessionInit, signer: FrameSigner): string {
  const remote = init.parties.find((p) => p.pubkey !== signer.actor)?.pubkey;
  if (remote === undefined) {
    throw new ObpError("VALIDATION", "cannot resolve remote actor");
  }
  return remote;
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
  const { channel, signer, verifier, persistence, ledgerSeq, handlers, sessionEnvelopeSync } = args;

  const userOpener = args.openerSession;
  const plans = (args.initiatorChainPlans ?? []).map((p) => ({
    init: normalizeSessionInit(p.init),
  }));

  if (userOpener !== undefined && plans.length > 0) {
    throw new ObpError("VALIDATION", "openerSession cannot be combined with initiatorChainPlans");
  }

  const usesSequentialPlans = plans.length > 0;
  let lazyTemplate: Pick<SessionInit, "parties"> | undefined =
    args.sessionTemplate !== undefined
      ? {
          parties: canonicalSessionParties([
            args.sessionTemplate.parties[0],
            args.sessionTemplate.parties[1],
          ]),
        }
      : undefined;

  if (userOpener === undefined && lazyTemplate === undefined) {
    throw new ObpError(
      "VALIDATION",
      "sessionTemplate is required unless openerSession defers it via first init",
    );
  }

  const closeChannelOnTerminate = args.closeChannelOnTerminate === true;
  const closeChannelWhenIdle = args.closeChannelWhenIdle !== false;

  /** Index of the last sequential plan already opened on the wire (`0` after first outbound init). `-1` before any. */
  let sequentialOpenedThrough = -1;

  let openerFinished = userOpener === undefined;

  if (userOpener === undefined && lazyTemplate !== undefined) {
    const templateInit: SessionInit = {
      session_id: "__template__",
      parties: lazyTemplate.parties,
      genesis_hash: "__template_genesis__",
    };
    if (usesSequentialPlans) {
      const p0 = plans[0];
      if (p0 === undefined) {
        throw new ObpError(
          "VALIDATION",
          "initiatorChainPlans must be non-empty when opening chains",
        );
      }
      ensureSignerInSession(p0.init, signer);
    } else {
      ensureSignerInSession(templateInit, signer);
    }
  }

  if (sessionEnvelopeSync !== undefined) {
    const hasPartyId =
      (sessionEnvelopeSync.myPartyId !== undefined && sessionEnvelopeSync.myPartyId !== "") ||
      sessionEnvelopeSync.getMyPartyId !== undefined;
    if (!hasPartyId) {
      throw new ObpError("VALIDATION", "sessionEnvelopeSync requires myPartyId or getMyPartyId");
    }
  }

  const partyIdForEnvelope = (): string => {
    if (sessionEnvelopeSync === undefined) {
      throw new ObpError("VALIDATION", "sessionEnvelopeSync missing");
    }
    const g = sessionEnvelopeSync.getMyPartyId?.();
    if (g !== undefined && g !== "") return g;
    const id = sessionEnvelopeSync.myPartyId;
    if (id !== undefined && id !== "") return id;
    throw new ObpError("VALIDATION", "sessionEnvelopeSync requires myPartyId or getMyPartyId");
  };

  const obp = new OBPPersistenceClient(persistence, { ledgerSeq });
  const chains = new Map<string, ChainState>();
  /** Maps current tip hex and each registered genesis → session_id */
  const tipToSession = new Map<string, string>();
  const globalOps: SessionOp[] = [];
  const globalDedupe = new Set<string>();
  let channelDead = false;
  /** Chains fully torn down; ignore late `session_envelope` for these (Merkle sync can trail TER on the wire). */
  const endedSessionIds = new Set<string>();

  /** Serialize all outbound bytes vs inbound decoder interleaving. */
  let writeChain = Promise.resolve();
  const sendWireBytes = (payload: Uint8Array): Promise<void> => {
    const p = writeChain.then(async () => {
      await channel.write(payload);
    });
    writeChain = p.catch(() => {});
    return p;
  };

  /** Serialize outbound DAG mutations + framed payload per chain (avoids sibling mints at same tip). */
  const outboundTailBySession = new Map<string, Promise<void>>();
  const enqueueChainOutbound = (sessionId: string, fn: () => Promise<void>): Promise<void> => {
    const prev = outboundTailBySession.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn);
    outboundTailBySession.set(sessionId, next.catch(() => {}));
    return next;
  };

  const registerChain = (wireRaw: SessionInit, hooks?: MultiplexChainHooks): void => {
    const wire = normalizeSessionInit(wireRaw);
    if (lazyTemplate === undefined) {
      lazyTemplate = { parties: wire.parties };
    } else if (!templateMatch(wire, lazyTemplate)) {
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
      ...(hooks !== undefined ? { hooks } : {}),
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
      from_party: partyIdForEnvelope(),
      base_checkpoint: sessionEnvelopeSync.checkpointFromOps(baseSlice),
      delta_ops: [...deltaSlice],
      new_checkpoint: sessionEnvelopeSync.checkpointFromOps(wireSessionOps),
    };
    await sendWireBytes(encodeSessionEnvelopeMessage(envelope));
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
    if (envelope.from_party === partyIdForEnvelope()) {
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
    await sendWireBytes(encodeFramedJson(frame));
  };

  const maybeCloseIdle = async (): Promise<void> => {
    if (!closeChannelWhenIdle || channelDead) return;
    if (chains.size > 0) return;
    if (userOpener !== undefined && !openerFinished) return;
    /** Peer may send another `{ init }` on the same byte stream (multiplex responder). */
    if (userOpener === undefined && !usesSequentialPlans) return;
    channelDead = true;
    await channel.close();
  };

  const emitOutboundTurn = (sessionId: string, body: TurnBody): Promise<void> =>
    enqueueChainOutbound(sessionId, async () => {
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
      applyTurn(obp, partyIdForActor(chain.init, frame.actor), parseTurnBody(frame.body));
      await sendWire(frame);
      await requestEnvelopeFlush(sessionId);
    });

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

  let destroyChain: (
    sid: string,
    reason: string,
    code: string | undefined,
    notifyTerminate: boolean,
  ) => Promise<void>;

  function makeHandle(c: ChainState): FrameSessionHandle {
    return {
      sessionId: c.init.session_id,
      init: c.init,
      get remoteActor() {
        return remoteActorForSigner(c.init, signer);
      },
      get tipHash() {
        return c.dag.tipHash;
      },
      sendTurn(body: TurnBody) {
        return emitOutboundTurn(c.init.session_id, body);
      },
      async terminate(reason: string, code?: string) {
        const sid = c.init.session_id;
        await enqueueChainOutbound(sid, async () => {
          const chain = chains.get(sid);
          if (chain === undefined || !chain.active) {
            throw new ObpError("VALIDATION", "terminate: unknown or inactive chain");
          }
          const body: Record<string, unknown> = { reason, ...(code !== undefined ? { code } : {}) };
          const oldP = chain.dag.tipHash;
          const frame = await chain.dag.mintOutbound(signer, "TERMINATE", body);
          const key = await frameDedupeKey(frame);
          if (!globalDedupe.has(key)) {
            globalDedupe.add(key);
            accumulateTaggedSessionOps(chain.sessionOps, frame, sid);
            accumulateTaggedSessionOps(globalOps, frame, sid);
            tipToSession.delete(oldP);
            tipToSession.set(chain.dag.tipHash, sid);
          }
          await sendWire(frame);
          await requestEnvelopeFlush(sid);
        });
        await destroyChain(sid, reason, code, false);
        if (closeChannelOnTerminate) {
          channelDead = true;
          await channel.close();
        }
      },
    };
  }

  const openOutboundSequentialInit = async (wire: SessionInit): Promise<void> => {
    ensureSignerInSession(wire, signer);
    await sendWireBytes(encodeFramedJson({ init: sessionInitToWire(wire) }));
    registerChain(wire);
    const chOpen = chains.get(wire.session_id);
    if (chOpen !== undefined) {
      await handlers.onSessionReady?.(makeHandle(chOpen));
    }
  };

  const advanceSequentialAfterChainEnd = async (): Promise<void> => {
    if (userOpener !== undefined || !usesSequentialPlans) return;
    sequentialOpenedThrough += 1;
    if (sequentialOpenedThrough >= plans.length) return;
    const plan = plans[sequentialOpenedThrough];
    if (plan === undefined) return;
    if (lazyTemplate === undefined || !templateMatch(plan.init, lazyTemplate)) {
      throw new ObpError("VALIDATION", "initiator chain init does not match template");
    }
    await openOutboundSequentialInit(plan.init);
  };

  /** @param notifyTerminate fire `onTerminate` (inbound peer TERMINATE only; not local `handle.terminate()`). */
  destroyChain = async (
    sid: string,
    reason: string,
    code: string | undefined,
    notifyTerminate: boolean,
  ): Promise<void> => {
    const c = chains.get(sid);
    if (c === undefined) return;
    const sess = makeHandle(c);
    c.active = false;
    removeTipsForSession(sid);
    endedSessionIds.add(sid);
    chains.delete(sid);
    outboundTailBySession.delete(sid);
    if (notifyTerminate) {
      if (c.hooks?.onTerminate) {
        await c.hooks.onTerminate(reason, code, sess);
      } else {
        await handlers.onTerminate?.(reason, code, sid);
      }
    }
    await advanceSequentialAfterChainEnd();
    await maybeCloseIdle();
  };

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
      const offerFn = c.hooks?.onIncomingOffer ?? handlers.onIncomingOffer;
      if (offerFn !== undefined) {
        const reply = await offerFn(body, makeHandle(c));
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
      const termCode = frame.body.code !== undefined ? String(frame.body.code) : undefined;
      await destroyChain(c.init.session_id, reason, termCode, true);
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
      const wire = sessionInitFromUnknownWireEnvelope(part.value);
      registerChain(wire);
      const cInit = chains.get(wire.session_id);
      if (cInit !== undefined) {
        await handlers.onSessionReady?.(makeHandle(cInit));
      }
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

  const runReadLoop = async (): Promise<void> => {
    for await (const chunk of channel.read()) {
      for (const part of decoder.push(chunk)) {
        await processYield(part);
        if (channelDead) return;
      }
    }
  };

  if (userOpener !== undefined) {
    const multiplexOpenerApi: FrameMultiplexOpenerApi = {
      async init(rawInit, hooks) {
        const wire = normalizeSessionInit(rawInit);
        ensureSignerInSession(wire, signer);
        await sendWireBytes(encodeFramedJson({ init: sessionInitToWire(wire) }));
        registerChain(wire, hooks);
        const ch = chains.get(wire.session_id);
        if (ch === undefined) {
          throw new ObpError("VALIDATION", "failed to register opened chain");
        }
        return makeHandle(ch);
      },
      close() {
        openerFinished = true;
        void maybeCloseIdle();
      },
    };
    await Promise.all([runReadLoop(), userOpener(multiplexOpenerApi)]);
    return globalOps;
  }

  if (usesSequentialPlans) {
    const p0 = plans[0];
    if (p0 === undefined) throw new ObpError("VALIDATION", "no outbound chain plans");
    if (lazyTemplate === undefined || !templateMatch(p0.init, lazyTemplate)) {
      throw new ObpError("VALIDATION", "first outbound init does not match sessionTemplate");
    }
    await openOutboundSequentialInit(p0.init);
    sequentialOpenedThrough = 0;
    await runReadLoop();
    return globalOps;
  }

  await runReadLoop();
  return globalOps;
}
