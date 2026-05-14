import { AsyncLocalStorage } from "node:async_hooks";
import type { FrameChannel } from "@khoralabs/frame-channel";
import { ObpError } from "@khoralabs/obp-v2-errors";
import {
  applyNbcFrameTurn,
  type NbcTurnBody,
  nbcTurnBodyToWireRecord,
  parseNbcFrameTurnBody,
} from "@khoralabs/obp-v2-nbc";
import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { accumulateTaggedSessionOps, type SessionOp } from "@khoralabs/obp-v2-session-impl";

import { canonicalJsonString } from "./canonical-json.ts";
import { encodeFramedJson } from "./encode-framed-json.ts";
import { FrameDag, sha256HexLowerFromUtf8String, signingPayloadBytes } from "./frame-dag.ts";
import {
  createFrameDecoder,
  encodeSessionEnvelopeMessage,
  type FrameDecoderYield,
} from "./frame-decoder.ts";
import {
  canonicalSessionParties,
  normalizeSessionInit,
  sessionInitFromUnknownWireEnvelope,
  sessionInitToWire,
} from "./frame-init-wire.ts";
import {
  ensureSignerInSession,
  frameAsOpLike,
  frameDedupeKeyHex,
  partyIdForActor,
  remoteActorForSigner,
  templateMatch,
} from "./frame-multiplex-session-helpers.ts";
import type {
  ChainState,
  RunFrameMultiplexSessionArgs,
  SessionEnvelopeSyncAdapter,
} from "./frame-multiplex-session-types.ts";
import type {
  FrameMultiplexOpenerApi,
  FrameSessionHandle,
  FrameSessionHandlers,
  MultiplexChainHooks,
} from "./frame-mux-types.ts";
import type { Frame, SessionEnvelopeWire, SessionInitNormalized } from "./frame-protocol-types.ts";
import type { FrameSigner, FrameVerifier } from "./frame-signer.ts";

export class MultiplexSessionRuntime {
  private readonly channel: FrameChannel;
  private readonly signer: FrameSigner;
  private readonly verifier: FrameVerifier;
  private readonly client: ObpPersistenceClient;
  private readonly ledgerSeq: () => number;
  private readonly handlers: FrameSessionHandlers;
  private readonly sessionEnvelopeSync: SessionEnvelopeSyncAdapter | undefined;
  private readonly userOpener: RunFrameMultiplexSessionArgs["openerSession"];
  private readonly plans: Array<{ init: SessionInitNormalized }>;
  private readonly usesSequentialPlans: boolean;
  private readonly closeChannelOnTerminate: boolean;
  private readonly closeChannelWhenIdle: boolean;

  private lazyTemplate: Pick<SessionInitNormalized, "parties"> | undefined;
  private sequentialOpenedThrough = -1;
  private openerFinished: boolean;

  private readonly chains = new Map<string, ChainState>();
  private readonly tipToSession = new Map<string, string>();
  private readonly globalOps: SessionOp[] = [];
  private readonly globalDedupe = new Set<string>();
  private channelDead = false;
  private readonly endedSessionIds = new Set<string>();

  private writeChain = Promise.resolve();
  private readonly muxAls = new AsyncLocalStorage<boolean>();
  private muxTail = Promise.resolve();

  private readonly envelopeFlushBySid = new Map<string, Promise<void> | null>();
  private readonly decoder = createFrameDecoder();

  constructor(args: RunFrameMultiplexSessionArgs) {
    this.channel = args.channel;
    this.signer = args.signer;
    this.verifier = args.verifier;
    this.client = args.client;
    this.ledgerSeq = args.ledgerSeq;
    this.handlers = args.handlers;
    this.sessionEnvelopeSync = args.sessionEnvelopeSync;
    this.userOpener = args.openerSession;
    this.plans = (args.initiatorChainPlans ?? []).map((p) => ({
      init: normalizeSessionInit(p.init),
    }));
    this.usesSequentialPlans = this.plans.length > 0;
    this.closeChannelOnTerminate = args.closeChannelOnTerminate === true;
    this.closeChannelWhenIdle = args.closeChannelWhenIdle !== false;

    this.lazyTemplate =
      args.sessionTemplate !== undefined
        ? {
            parties: canonicalSessionParties([
              args.sessionTemplate.parties[0],
              args.sessionTemplate.parties[1],
            ]),
          }
        : undefined;

    this.openerFinished = this.userOpener === undefined;
  }

  async run(): Promise<SessionOp[]> {
    if (this.userOpener !== undefined) {
      const multiplexOpenerApi: FrameMultiplexOpenerApi = {
        init: async (rawInit, hooks) => {
          const wire = normalizeSessionInit(rawInit);
          ensureSignerInSession(wire, this.signer);
          await this.sendWireBytes(encodeFramedJson({ init: sessionInitToWire(wire) }));
          this.registerChain(wire, hooks);
          const ch = this.chains.get(wire.session_id);
          if (ch === undefined) {
            throw new ObpError("VALIDATION", "failed to register opened chain");
          }
          return this.makeHandle(ch);
        },
        close: () => {
          this.openerFinished = true;
          void this.maybeCloseIdle();
        },
      };
      await Promise.all([this.runReadLoop(), this.userOpener(multiplexOpenerApi)]);
      return this.globalOps;
    }

    if (this.usesSequentialPlans) {
      const p0 = this.plans[0];
      if (p0 === undefined) throw new ObpError("VALIDATION", "no outbound chain plans");
      if (this.lazyTemplate === undefined || !templateMatch(p0.init, this.lazyTemplate)) {
        throw new ObpError("VALIDATION", "first outbound init does not match sessionTemplate");
      }
      await this.openOutboundSequentialInit(p0.init);
      this.sequentialOpenedThrough = 0;
      await this.runReadLoop();
      return this.globalOps;
    }

    await this.runReadLoop();
    return this.globalOps;
  }

  private partyIdForEnvelope(): string {
    const sessionEnvelopeSync = this.sessionEnvelopeSync;
    if (sessionEnvelopeSync === undefined) {
      throw new ObpError("VALIDATION", "sessionEnvelopeSync missing");
    }
    const g = sessionEnvelopeSync.getMyPartyId?.();
    if (g !== undefined && g !== "") return g;
    const id = sessionEnvelopeSync.myPartyId;
    if (id !== undefined && id !== "") return id;
    throw new ObpError("VALIDATION", "sessionEnvelopeSync requires myPartyId or getMyPartyId");
  }

  private sendWireBytes(payload: Uint8Array): Promise<void> {
    const p = this.writeChain.then(async () => {
      await this.channel.write(payload);
    });
    this.writeChain = p.catch(() => {});
    return p;
  }

  private enqueueMux(fn: () => Promise<void>): Promise<void> {
    if (this.muxAls.getStore() === true) return fn();
    const run = this.muxTail.then(() => this.muxAls.run(true, fn));
    this.muxTail = run.catch(() => {});
    return run;
  }

  private registerChain(wireRaw: SessionInitNormalized, hooks?: MultiplexChainHooks): void {
    const wire = normalizeSessionInit(wireRaw);
    if (this.lazyTemplate === undefined) {
      this.lazyTemplate = { parties: wire.parties };
    } else if (!templateMatch(wire, this.lazyTemplate)) {
      throw new ObpError("VALIDATION", "init does not match session template");
    }
    if (this.chains.has(wire.session_id)) {
      throw new ObpError("VALIDATION", "duplicate session_id for open multiplex chain");
    }
    if (this.tipToSession.has(wire.genesis_hash)) {
      throw new ObpError("VALIDATION", "duplicate genesis_hash for open multiplex chain");
    }
    this.chains.set(wire.session_id, {
      init: wire,
      dag: new FrameDag(wire.genesis_hash),
      sessionOps: [],
      confirmedSeq: 0,
      pendingAck: false,
      active: true,
      ...(hooks !== undefined ? { hooks } : {}),
    });
    this.tipToSession.set(wire.genesis_hash, wire.session_id);
  }

  private removeTipsForSession(sessionId: string): void {
    for (const [tip, sid] of [...this.tipToSession.entries()]) {
      if (sid === sessionId) this.tipToSession.delete(tip);
    }
  }

  private resolveChain(pHash: string): ChainState {
    const sid = this.tipToSession.get(pHash);
    if (sid === undefined) {
      throw new ObpError("VALIDATION", "p_hash does not match any open chain tip or genesis");
    }
    const c = this.chains.get(sid);
    if (c === undefined || !c.active) {
      throw new ObpError("VALIDATION", "chain not active for p_hash");
    }
    return c;
  }

  private advanceTip(c: ChainState, oldP: string): void {
    this.tipToSession.delete(oldP);
    this.tipToSession.set(c.dag.tipHash, c.init.session_id);
  }

  private async flushSessionEnvelopeFor(sid: string): Promise<void> {
    const sessionEnvelopeSync = this.sessionEnvelopeSync;
    if (sessionEnvelopeSync === undefined || this.channelDead) return;
    const chain = this.chains.get(sid);
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
      from_party: this.partyIdForEnvelope(),
      base_checkpoint: sessionEnvelopeSync.checkpointFromOps(baseSlice),
      delta_ops: [...deltaSlice],
      new_checkpoint: sessionEnvelopeSync.checkpointFromOps(wireSessionOps),
    };
    await this.sendWireBytes(encodeSessionEnvelopeMessage(envelope));
  }

  private requestEnvelopeFlush(sid: string): Promise<void> {
    if (this.sessionEnvelopeSync === undefined || this.channelDead) return Promise.resolve();
    const existing = this.envelopeFlushBySid.get(sid);
    if (existing) return existing;
    const p = Promise.resolve().then(async () => {
      this.envelopeFlushBySid.set(sid, null);
      await this.flushSessionEnvelopeFor(sid);
    });
    this.envelopeFlushBySid.set(sid, p);
    return p;
  }

  private async handleInboundSessionEnvelope(envelope: SessionEnvelopeWire): Promise<void> {
    await this.enqueueMux(async () => {
      const sessionEnvelopeSync = this.sessionEnvelopeSync;
      if (sessionEnvelopeSync === undefined) {
        throw new ObpError("VALIDATION", "unexpected session_envelope (sync disabled)");
      }
      const sid = envelope.session_id;
      const chain = this.chains.get(sid);
      if (chain === undefined) {
        if (this.endedSessionIds.has(sid)) {
          return;
        }
        throw new ObpError("VALIDATION", "session_envelope for unknown or inactive chain");
      }
      if (!chain.active) {
        throw new ObpError("VALIDATION", "session_envelope for unknown or inactive chain");
      }
      if (envelope.from_party === this.partyIdForEnvelope()) {
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
        if (canonicalJsonString(local) !== canonicalJsonString(delta[i] as SessionOp)) {
          throw new ObpError("VALIDATION", "session_envelope op mismatch vs frame-derived ops");
        }
      }
      chain.confirmedSeq = newSeq;
      chain.pendingAck = true;
      await this.requestEnvelopeFlush(sid);
    });
  }

  private async sendWire(frame: Frame): Promise<void> {
    await this.sendWireBytes(encodeFramedJson(frame));
  }

  private async maybeCloseIdle(): Promise<void> {
    if (!this.closeChannelWhenIdle || this.channelDead) return;
    if (this.chains.size > 0) return;
    if (this.userOpener !== undefined && !this.openerFinished) return;
    if (this.userOpener === undefined && !this.usesSequentialPlans) return;
    this.channelDead = true;
    await this.channel.close();
  }

  private emitOutboundTurn(sessionId: string, body: NbcTurnBody): Promise<void> {
    return this.enqueueMux(async () => {
      const chain = this.chains.get(sessionId);
      if (chain === undefined || !chain.active) {
        throw new ObpError("VALIDATION", "emitOutboundTurn: unknown or inactive chain");
      }
      const wire = nbcTurnBodyToWireRecord(body);
      const { frame, nextTip } = await chain.dag.signOutboundAtTip(this.signer, "TURN", wire);
      const key = frameDedupeKeyHex(frame);
      if (this.globalDedupe.has(key)) return;

      await applyNbcFrameTurn(
        this.client,
        partyIdForActor(chain.init, frame.actor),
        parseNbcFrameTurnBody(frame.body as Record<string, unknown>),
        BigInt(this.ledgerSeq()),
      );

      this.globalDedupe.add(key);
      accumulateTaggedSessionOps(chain.sessionOps, frameAsOpLike(frame), sessionId);
      accumulateTaggedSessionOps(this.globalOps, frameAsOpLike(frame), sessionId);
      this.tipToSession.set(nextTip, sessionId);
      chain.dag.commitTip(nextTip);

      await this.sendWire(frame);

      await this.requestEnvelopeFlush(sessionId);
    });
  }

  private makeHandle(c: ChainState): FrameSessionHandle {
    const signer = this.signer;
    return {
      sessionId: c.init.session_id,
      init: c.init,
      get remoteActor() {
        return remoteActorForSigner(c.init, signer);
      },
      get tipHash() {
        return c.dag.tipHash;
      },
      sendTurn: (body) => this.emitOutboundTurn(c.init.session_id, body),
      terminate: async (reason: string, code?: string) => {
        const sid = c.init.session_id;
        await this.enqueueMux(async () => {
          const chain = this.chains.get(sid);
          if (chain === undefined || !chain.active) {
            throw new ObpError("VALIDATION", "terminate: unknown or inactive chain");
          }
          const body: Record<string, unknown> = { reason, ...(code !== undefined ? { code } : {}) };
          const parentTip = chain.dag.tipHash;
          const { frame, nextTip } = await chain.dag.signOutboundAtTip(
            this.signer,
            "TERMINATE",
            body,
          );
          const key = frameDedupeKeyHex(frame);
          if (this.globalDedupe.has(key)) return;

          await this.sendWire(frame);
          await this.requestEnvelopeFlush(sid);

          this.globalDedupe.add(key);
          accumulateTaggedSessionOps(chain.sessionOps, frameAsOpLike(frame), sid);
          accumulateTaggedSessionOps(this.globalOps, frameAsOpLike(frame), sid);
          this.tipToSession.delete(parentTip);
          this.tipToSession.set(nextTip, sid);
          chain.dag.commitTip(nextTip);
        });
        await this.destroyChain(sid, reason, code, false);
        if (this.closeChannelOnTerminate) {
          this.channelDead = true;
          await this.channel.close();
        }
      },
    };
  }

  private async openOutboundSequentialInit(wire: SessionInitNormalized): Promise<void> {
    ensureSignerInSession(wire, this.signer);
    await this.sendWireBytes(encodeFramedJson({ init: sessionInitToWire(wire) }));
    this.registerChain(wire);
    const chOpen = this.chains.get(wire.session_id);
    if (chOpen !== undefined) {
      await this.handlers.onSessionReady?.(this.makeHandle(chOpen));
    }
  }

  private async advanceSequentialAfterChainEnd(): Promise<void> {
    if (this.userOpener !== undefined || !this.usesSequentialPlans) return;
    this.sequentialOpenedThrough += 1;
    if (this.sequentialOpenedThrough >= this.plans.length) return;
    const plan = this.plans[this.sequentialOpenedThrough];
    if (plan === undefined) return;
    if (this.lazyTemplate === undefined || !templateMatch(plan.init, this.lazyTemplate)) {
      throw new ObpError("VALIDATION", "initiator chain init does not match template");
    }
    await this.openOutboundSequentialInit(plan.init);
  }

  private readonly destroyChain = async (
    sid: string,
    reason: string,
    code: string | undefined,
    notifyTerminate: boolean,
  ): Promise<void> => {
    const c = this.chains.get(sid);
    if (c === undefined) return;
    const sess = this.makeHandle(c);
    c.active = false;
    this.removeTipsForSession(sid);
    this.endedSessionIds.add(sid);
    this.chains.delete(sid);
    if (notifyTerminate) {
      if (c.hooks?.onTerminate) {
        await c.hooks.onTerminate(reason, code, sess);
      } else {
        await this.handlers.onTerminate?.(reason, code, sid);
      }
    }
    await this.advanceSequentialAfterChainEnd();
    await this.maybeCloseIdle();
  };

  private async handleInboundFrame(frame: Frame, wireUtf8: string): Promise<void> {
    await this.enqueueMux(async () => {
      const key = frameDedupeKeyHex(frame);
      if (this.globalDedupe.has(key)) {
        return;
      }
      const c = this.resolveChain(frame.p_hash);
      const oldP = frame.p_hash;

      if (frame.type === "TERMINATE") {
        const ok = await this.verifier.verify(frame.actor, signingPayloadBytes(frame), frame.sig);
        if (!ok) throw new ObpError("BAD_SIG", "invalid frame signature");
      } else {
        await c.dag.verifyInboundChild(frame, this.verifier);
      }

      if (frame.type === "TURN") {
        await applyNbcFrameTurn(
          this.client,
          partyIdForActor(c.init, frame.actor),
          parseNbcFrameTurnBody(frame.body as Record<string, unknown>),
          BigInt(this.ledgerSeq()),
        );
      } else if (frame.type === "END_OFFERS") {
        // No persistence graph step; advances DAG only.
      } else if (frame.type !== "TERMINATE") {
        throw new ObpError("VALIDATION", `unknown frame type: ${frame.type}`);
      }

      this.globalDedupe.add(key);
      accumulateTaggedSessionOps(c.sessionOps, frameAsOpLike(frame), c.init.session_id);
      accumulateTaggedSessionOps(this.globalOps, frameAsOpLike(frame), c.init.session_id);

      if (frame.type === "TURN" || frame.type === "END_OFFERS") {
        const nextTip = sha256HexLowerFromUtf8String(wireUtf8);
        c.dag.commitTip(nextTip);
        this.advanceTip(c, oldP);

        if (frame.type === "TURN") {
          const body = parseNbcFrameTurnBody(frame.body as Record<string, unknown>);
          let replied = false;
          const offerFn = c.hooks?.onIncomingOffer ?? this.handlers.onIncomingOffer;
          if (offerFn !== undefined) {
            const reply = await offerFn(body, this.makeHandle(c));
            if (reply !== null) {
              await this.emitOutboundTurn(c.init.session_id, reply);
              replied = true;
            }
          }
          if (!replied) await this.requestEnvelopeFlush(c.init.session_id);
        } else {
          await this.requestEnvelopeFlush(c.init.session_id);
        }
        return;
      }

      if (frame.type === "TERMINATE") {
        const tb = frame.body as Record<string, unknown>;
        const reason = String(tb.reason ?? "");
        const termCode = tb.code !== undefined ? String(tb.code) : undefined;
        await this.destroyChain(c.init.session_id, reason, termCode, true);
        if (this.closeChannelOnTerminate) {
          this.channelDead = true;
          await this.channel.close();
        }
        return;
      }
    });
  }

  private async processYield(part: FrameDecoderYield): Promise<void> {
    if (part.kind === "raw") {
      throw new ObpError("VALIDATION", "unexpected wire payload");
    }
    if (part.kind === "init") {
      const wire = sessionInitFromUnknownWireEnvelope(part.value);
      this.registerChain(wire);
      const cInit = this.chains.get(wire.session_id);
      if (cInit !== undefined) {
        await this.handlers.onSessionReady?.(this.makeHandle(cInit));
      }
      return;
    }
    if (part.kind === "session_envelope") {
      await this.handleInboundSessionEnvelope(part.value);
      return;
    }
    if (part.kind !== "frame") {
      throw new ObpError("VALIDATION", "unexpected decoder yield");
    }
    if (this.chains.size === 0) {
      throw new ObpError("VALIDATION", "expected init before frames");
    }
    await this.handleInboundFrame(part.value, part.wireUtf8);
  }

  private async runReadLoop(): Promise<void> {
    for await (const chunk of this.channel.read()) {
      for (const part of this.decoder.push(chunk)) {
        await this.processYield(part);
        if (this.channelDead) return;
      }
    }
  }
}
