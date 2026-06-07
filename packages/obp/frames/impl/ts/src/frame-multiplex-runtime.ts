import { AsyncLocalStorage } from "node:async_hooks";
import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import { ObpError } from "@khoralabs/obp-errors";
import {
  applyNbcFrameTurn,
  type NbcTurnBody,
  nbcTurnBodyToWireRecord,
  parseNbcFrameTurnBody,
} from "@khoralabs/obp-nbc";
import type { ObpPersistenceClient } from "@khoralabs/obp-persistence";
import { accumulateTaggedSessionOps, type SessionOp } from "@khoralabs/obp-session-impl";

import { canonicalJsonString } from "./canonical-json";
import { encodeFramedJson } from "./encode-framed-json";
import {
  bytesToHexLower,
  decryptWireFrameBody,
  deriveFrameBodyAesKey,
  encryptLogicalFrameBody,
  ephemeralX25519Keygen,
  handshakeBodyFromEphemeralPub,
  hexToBytes32,
  isE2eeHandshakeBody,
  minActorPubkeyFromInit,
  parseHandshakeEphemeralPub,
  x25519SharedSecret,
} from "./frame-channel-e2ee";
import { FrameDag, sha256HexLowerFromUtf8String, signingPayloadBytes } from "./frame-dag";
import {
  createFrameDecoder,
  encodeSessionEnvelopeMessage,
  type FrameDecoderYield,
} from "./frame-decoder";
import {
  canonicalSessionParties,
  normalizeSessionInit,
  sessionInitFromUnknownWireEnvelope,
  sessionInitToWire,
} from "./frame-init-wire";
import {
  ensureSignerInSession,
  frameAsOpLike,
  frameDedupeKeyHex,
  partyIdForActor,
  remoteActorForSigner,
  templateMatch,
} from "./frame-multiplex-session-helpers";
import type {
  ChainState,
  RunFrameMultiplexSessionArgs,
  SessionEnvelopeSyncAdapter,
} from "./frame-multiplex-session-types";
import type {
  FrameMultiplexOpenerApi,
  FrameSessionHandle,
  FrameSessionHandlers,
  MultiplexChainHooks,
} from "./frame-mux-types";
import type { Frame, SessionEnvelopeWire, SessionInitNormalized } from "./frame-protocol-types";
import type { FrameSigner, FrameVerifier } from "./frame-signer";

type MultiplexE2eeState = {
  localSk: Uint8Array;
  localPk: Uint8Array;
  remotePubHex: string | null;
  aesKey: CryptoKey | null;
  ready: boolean;
  hsSeen: number;
};

export class MultiplexSessionRuntime {
  private readonly channel: DuplexByteStream;
  private readonly signer: FrameSigner;
  private readonly verifier: FrameVerifier;
  private readonly client: ObpPersistenceClient;
  private readonly handlers: FrameSessionHandlers;
  private readonly sessionEnvelopeSync: SessionEnvelopeSyncAdapter | undefined;
  private readonly userOpener: RunFrameMultiplexSessionArgs["openerSession"];
  private readonly plans: Array<{ init: SessionInitNormalized }>;
  private readonly usesSequentialPlans: boolean;
  private readonly closeChannelOnTerminate: boolean;
  private readonly closeChannelWhenIdle: boolean;
  private readonly validateBindPayload: RunFrameMultiplexSessionArgs["validateBindPayload"];

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
  private readonly e2eeChannelBinding: string;
  private readonly frameChannelBodyE2ee: boolean;
  private readonly e2eeByChain = new WeakMap<ChainState, MultiplexE2eeState>();

  constructor(args: RunFrameMultiplexSessionArgs) {
    this.channel = args.channel;
    this.signer = args.signer;
    this.verifier = args.verifier;
    this.client = args.client;
    this.handlers = args.handlers;
    this.sessionEnvelopeSync = args.sessionEnvelopeSync;
    this.userOpener = args.openerSession;
    this.plans = (args.initiatorChainPlans ?? []).map((p) => ({
      init: normalizeSessionInit(p.init),
    }));
    this.usesSequentialPlans = this.plans.length > 0;
    this.closeChannelOnTerminate = args.closeChannelOnTerminate === true;
    this.closeChannelWhenIdle = args.closeChannelWhenIdle !== false;

    this.validateBindPayload = args.validateBindPayload;

    this.e2eeChannelBinding = args.e2eeChannelBinding ?? "";
    this.frameChannelBodyE2ee = args.frameChannelBodyE2ee === true;

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
    const chainState: ChainState = {
      init: wire,
      dag: new FrameDag(wire.genesis_hash),
      sessionOps: [],
      confirmedSeq: 0,
      pendingAck: false,
      active: true,
      ...(hooks !== undefined ? { hooks } : {}),
    };
    this.chains.set(wire.session_id, chainState);
    this.tipToSession.set(wire.genesis_hash, wire.session_id);
    this.initFrameE2eeForChain(chainState);
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

  private initFrameE2eeForChain(c: ChainState): void {
    if (!this.frameChannelBodyE2ee) return;
    const { sk, pk } = ephemeralX25519Keygen();
    this.e2eeByChain.set(c, {
      localSk: sk,
      localPk: pk,
      remotePubHex: null,
      aesKey: null,
      ready: false,
      hsSeen: 0,
    });
    const minPub = minActorPubkeyFromInit(c.init.parties);
    if (this.signer.actor === minPub) {
      void this.enqueueMux(async () => {
        await this.sendLeaderE2eeHandshake(c);
      });
    }
  }

  private async sendLeaderE2eeHandshake(c: ChainState): Promise<void> {
    if (this.channelDead) return;
    const st = this.e2eeByChain.get(c);
    if (st === undefined) return;
    const body = handshakeBodyFromEphemeralPub(st.localPk);
    const { frame } = await c.dag.signOutboundAtTip(this.signer, "END_OFFERS", body);
    await this.sendWire(frame);
  }

  private assertValidE2eeHandshakeOrder(c: ChainState, frame: Frame, st: MultiplexE2eeState): void {
    if (frame.type !== "END_OFFERS") {
      throw new ObpError("VALIDATION", "E2EE: handshake must use END_OFFERS");
    }
    parseHandshakeEphemeralPub(frame.body as Record<string, unknown>);
    const minPub = minActorPubkeyFromInit(c.init.parties);
    const idx = st.hsSeen;
    if (idx === 0) {
      if (frame.actor !== minPub) {
        throw new ObpError("VALIDATION", "E2EE: first handshake must be from lex-min actor");
      }
      if (frame.p_hash !== c.init.genesis_hash) {
        throw new ObpError("VALIDATION", "E2EE: first handshake p_hash must be genesis_hash");
      }
    } else if (idx === 1) {
      if (frame.actor === minPub) {
        throw new ObpError("VALIDATION", "E2EE: second handshake must be from lex-max actor");
      }
      if (frame.p_hash === c.init.genesis_hash) {
        throw new ObpError("VALIDATION", "E2EE: second handshake must extend first");
      }
    } else {
      throw new ObpError("VALIDATION", "E2EE: unexpected handshake frame");
    }
  }

  private async finalizeE2eeKeys(c: ChainState, st: MultiplexE2eeState): Promise<void> {
    if (st.hsSeen < 2 || st.ready) return;
    if (st.remotePubHex === null) {
      throw new ObpError("VALIDATION", "E2EE: missing remote ephemeral pubkey");
    }
    const remotePk = hexToBytes32(st.remotePubHex, "remote_ephemeral");
    const shared = x25519SharedSecret(st.localSk, remotePk);
    st.aesKey = await deriveFrameBodyAesKey({
      sharedSecret: shared,
      sessionId: c.init.session_id,
      channelBinding: this.e2eeChannelBinding,
    });
    st.ready = true;
  }

  private emitOutboundTurn(sessionId: string, body: NbcTurnBody): Promise<void> {
    return this.enqueueMux(async () => {
      const chain = this.chains.get(sessionId);
      if (chain === undefined || !chain.active) {
        throw new ObpError("VALIDATION", "emitOutboundTurn: unknown or inactive chain");
      }
      const st = this.e2eeByChain.get(chain);
      let wire = nbcTurnBodyToWireRecord(body);
      if (this.frameChannelBodyE2ee) {
        if (st === undefined || !st.ready || st.aesKey === null) {
          throw new ObpError("VALIDATION", "E2EE: cannot send TURN before handshake completes");
        }
        wire = await encryptLogicalFrameBody(st.aesKey, wire);
      }
      const { frame } = await chain.dag.signOutboundAtTip(this.signer, "TURN", wire);
      const key = frameDedupeKeyHex(frame);
      if (this.globalDedupe.has(key)) return;

      await this.sendWire(frame);
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
          let body: Record<string, unknown> = {
            reason,
            ...(code !== undefined ? { code } : {}),
          };
          const st = this.e2eeByChain.get(chain);
          if (this.frameChannelBodyE2ee && st?.ready === true && st.aesKey !== null) {
            body = await encryptLogicalFrameBody(st.aesKey, body);
          }
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

  private async handleInboundFrame(
    frame: Frame,
    wireUtf8: string,
    relayTsMs?: number,
  ): Promise<void> {
    await this.enqueueMux(async () => {
      const key = frameDedupeKeyHex(frame);
      if (this.globalDedupe.has(key)) {
        return;
      }
      const c = this.resolveChain(frame.p_hash);
      const oldP = frame.p_hash;
      const e2eeSt = this.e2eeByChain.get(c);

      if (frame.type === "TURN") {
        if (e2eeSt !== undefined && !e2eeSt.ready) {
          throw new ObpError("VALIDATION", "E2EE: TURN before handshake completes");
        }
      }

      if (frame.type === "TERMINATE") {
        const ok = await this.verifier.verify(frame.actor, signingPayloadBytes(frame), frame.sig);
        if (!ok) throw new ObpError("BAD_SIG", "invalid frame signature");
      } else {
        await c.dag.verifyInboundChild(frame, this.verifier);
      }

      let workFrame = frame;

      if (frame.type === "END_OFFERS" && isE2eeHandshakeBody(frame.body)) {
        if (e2eeSt === undefined) {
          throw new ObpError("VALIDATION", "unexpected E2EE handshake on this transport");
        }
        this.assertValidE2eeHandshakeOrder(c, frame, e2eeSt);
        if (frame.actor !== this.signer.actor) {
          e2eeSt.remotePubHex = bytesToHexLower(
            parseHandshakeEphemeralPub(frame.body as Record<string, unknown>),
          );
        }
        e2eeSt.hsSeen += 1;
        await this.finalizeE2eeKeys(c, e2eeSt);
      } else if (e2eeSt !== undefined && !e2eeSt.ready && frame.type !== "TERMINATE") {
        throw new ObpError("VALIDATION", "E2EE: frame before handshake completes");
      } else if (
        e2eeSt?.ready === true &&
        e2eeSt.aesKey !== null &&
        !isE2eeHandshakeBody(frame.body)
      ) {
        workFrame = {
          ...frame,
          body: (await decryptWireFrameBody(
            e2eeSt.aesKey,
            frame.body as Record<string, unknown>,
          )) as Frame["body"],
        };
      }

      if (frame.type === "TURN") {
        await applyNbcFrameTurn(
          this.client,
          partyIdForActor(c.init, workFrame.actor),
          parseNbcFrameTurnBody(workFrame.body as Record<string, unknown>),
          {
            turnSeq: c.sessionOps.length,
            relayTsMs: relayTsMs ?? 0,
          },
          this.validateBindPayload,
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

        if (
          frame.type === "END_OFFERS" &&
          isE2eeHandshakeBody(frame.body) &&
          frame.actor === minActorPubkeyFromInit(c.init.parties) &&
          this.signer.actor !== minActorPubkeyFromInit(c.init.parties)
        ) {
          await this.sendLeaderE2eeHandshake(c);
        }

        if (frame.type === "TURN") {
          const body = parseNbcFrameTurnBody(workFrame.body as Record<string, unknown>);
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
        const tb = workFrame.body as Record<string, unknown>;
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
    await this.handleInboundFrame(part.value, part.wireUtf8, part.relayTsMs);
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
