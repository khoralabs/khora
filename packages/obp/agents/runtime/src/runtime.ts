import {
  type ApplyTurnResult,
  type BindPolicyField,
  applyTurn as graphApplyTurn,
  type Port,
  type PortBindPolicy,
  type PortSpec,
  type SourceMapRef,
  type TurnBody,
  validateCounterpartyBindForPort,
} from "@khoralabs/obp-core";
import type { OBPPersistenceClient, ObpPersistence } from "@khoralabs/obp-persistence-client";
import { listBindableCounterpartyPorts, type ObpToolkitEnv } from "@khoralabs/obp-tools";
import type z from "zod";
import {
  isRuntimeNoopPortId,
  isRuntimeWalkAwayPortId,
  noopPortIdForHeadOffer,
  OBP_NEGOTIATION_BIND_NO_POLICY,
  walkAwayPortIdForHeadOffer,
} from "./constants.ts";
import { filterPortIdsByNegotiationTurnTtl, minExposeSeqOnOffer } from "./port-turn-ttl.ts";
import {
  ensureRuntimeSyntheticPorts,
  resolveHeadOfferIdForSyntheticPorts,
} from "./system-ports.ts";
import { expiresSeqForOfferTtl, expiresSeqForPortTtl } from "./ttl-resolve.ts";
import type { TtlSpec } from "./ttl-spec.ts";
import {
  buildGenesisNegotiationTurnOutput,
  buildNegotiationTurnOutput,
  type NegotiationGenesisTurnOutput,
  type NegotiationTurnOutput,
  type NegotiationTurnSchemaOptions,
} from "./turn-output-schema.ts";

function summarizeBindPolicyField(f: BindPolicyField): string {
  switch (f.type) {
    case "text":
      return `${f.name} (text)`;
    case "boolean":
      return `${f.name} (boolean)`;
    case "int":
      return `${f.name} (int)`;
    case "float":
      return `${f.name} (float)`;
    case "choice":
      return `${f.name} (choice)`;
  }
}

function summarizeBindPolicy(policy: PortBindPolicy): string {
  return policy.properties.map(summarizeBindPolicyField).join(", ");
}

/** Text for Zod `.describe` on each bind-key in structured output. */
function composeBindAffordanceDescription(port: Port): string {
  let s = port.promise.trim();
  if (port.terminal) {
    s +=
      " Terminal affordance: after binding, omit the `ports` property from your structured response (no further exposes on this line).";
  }
  if (port.bind_policy !== undefined && port.bind_policy.properties.length > 0) {
    s += ` Required bind answers: ${summarizeBindPolicy(port.bind_policy)}.`;
  }
  return s;
}

export type NegotiationBindMenuEntry = {
  portId: string;
  portType: string;
  terminal: boolean;
  /** From `Port.promise` (exposing party’s counterparty-facing affordance copy). */
  promise: string;
  /** Full string passed to Zod `.describe` on the bind output key. */
  affordanceDescription: string;
  bind_policy?: PortBindPolicy;
};

export type NegotiationExposedPortSummary = {
  portType: string;
  promise: string;
  terminal: boolean;
};

export type NegotiationGenesisTurnAudit = {
  kind: "genesis";
  turnIndex: number;
  actingPartyId: string;
  newOfferId: string;
  newOfferType: string;
  exposedPortIds: string[];
  exposedPorts: NegotiationExposedPortSummary[];
  /** Canonical {@link TurnBody} committed for this turn (wire + persistence interpreter). */
  committedTurnBody: TurnBody;
};

export type NegotiationBindTurnAudit = {
  kind: "bind";
  turnIndex: number;
  actingPartyId: string;
  chosenPortId: string;
  chosenPortType: string;
  headOfferId: string;
  counterpartyHeadOfferType: string | null;
  bindKind: "real" | "noop" | "walkAway";
  bindMenu: NegotiationBindMenuEntry[];
  newOfferId: string;
  newOfferType: string;
  exposedPortIds: string[];
  exposedPorts: NegotiationExposedPortSummary[];
  counterpartyBind?: Record<string, unknown>;
  committedTurnBody: TurnBody;
};

export type NegotiationTurnAudit = NegotiationGenesisTurnAudit | NegotiationBindTurnAudit;

/**
 * @deprecated Prefer composing the bilateral structured contract via
 * `createNegotiationStructuredBilateralContract` (see
 * `src/contracts/structured-bilateral.ts`). Direct use of `NegotiationRuntime`
 * bypasses the shared `ObpLedger` turn counter / audit tail and will be hidden
 * in a follow-up release.
 */
export type NegotiationRuntimeOptions = {
  client: OBPPersistenceClient;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  /** When true (default), host exposes the noop synthetic port on the counterparty head offer. */
  requireNoop?: boolean;
  /** When true (default), host exposes the walk-away synthetic port on the counterparty head offer. */
  requireWalkAway?: boolean;
  maxTurns: number;
  validateBind?: ObpToolkitEnv["validateBind"];
  requestNegotiationEnd?: ObpToolkitEnv["requestNegotiationEnd"];
  /** When false, structured output omits `ttl`; host uses {@link defaultPortTtl} only. Default true. */
  allowAgentPortTtl?: boolean;
  /** TTL applied when the agent omits `ttl` or when {@link allowAgentPortTtl} is false. */
  defaultPortTtl: TtlSpec;
  /**
   * Completed structured turns (for expose index / TTL / max-turn guards). When wired through
   * {@link ObpLedger}, pass `() => ledger.completedTurns`. Omit for standalone tests — runtime uses an internal counter bumped only by legacy {@link applyGenesisTurn} / {@link applyTurn}.
   */
  getCompletedTurns?: () => number;
};

/** Staging between {@link NegotiationRuntime.materializeGenesisTurn} and {@link NegotiationRuntime.finalizeGenesisTurn}. */
export type NegotiationGenesisStaging = {
  kind: "genesis";
  actingPartyId: string;
  turnIndex: number;
  parsed: NegotiationGenesisTurnOutput;
};

/** Staging between {@link NegotiationRuntime.materializeBindTurn} and {@link NegotiationRuntime.finalizeBindTurn}. */
export type NegotiationBindStaging = {
  kind: "bind";
  actingPartyId: string;
  turnIndex: number;
  headOfferId: string;
  counterpartyHeadOfferType: string | null;
  bindMenu: NegotiationBindMenuEntry[];
  bindPortId: string;
  bindKind: NegotiationBindTurnAudit["bindKind"];
  parsed: NegotiationTurnOutput;
  skipNewPortExposes: boolean;
};

function filterBindablePortIdsForPolicy(
  ids: readonly string[],
  headOfferId: string,
  requireNoop: boolean,
  requireWalkAway: boolean,
): string[] {
  const noop = noopPortIdForHeadOffer(headOfferId);
  const walk = walkAwayPortIdForHeadOffer(headOfferId);
  return ids.filter((id) => {
    if (id === noop) {
      return requireNoop;
    }
    if (id === walk) {
      return requireWalkAway;
    }
    return true;
  });
}

type PreparedBind = {
  kind: "bind";
  schema: z.ZodType<NegotiationTurnOutput>;
  headOfferId: string;
  allowedPortIds: readonly string[];
  bindMenu: NegotiationBindMenuEntry[];
  counterpartyHeadOfferType: string | null;
};

type PreparedGenesis = {
  kind: "genesis";
  schema: z.ZodType<NegotiationGenesisTurnOutput>;
};

type LastPrepared = PreparedBind | PreparedGenesis | null;

function summarizeExposedPorts(
  ports: readonly { portType: string; promise: string; terminal: boolean }[] | undefined,
): NegotiationExposedPortSummary[] {
  if (ports === undefined) {
    return [];
  }
  return ports.map((p) => ({
    portType: p.portType,
    promise: p.promise,
    terminal: p.terminal,
  }));
}

/**
 * Low-level negotiation runtime: prepares per-turn structured-output schemas,
 * applies parsed agent output to the OBP graph, and tracks its own turn counter.
 *
 * @deprecated Prefer the higher-level
 * `createNegotiationStructuredBilateralContract` (see
 * `src/contracts/structured-bilateral.ts`) wired through `BilateralCoordinator`
 * + `ObpLedger`. That path keeps the shared turn counter / audit tail in one
 * place and is the supported entry point for new code. Direct use of this
 * class bypasses the ledger and will be hidden in a follow-up release; only
 * reach for it when you genuinely need the lower-level `prepareActingTurn` /
 * `applyTurn` escape hatches.
 */
export class NegotiationRuntime {
  /** Internal counter when {@link NegotiationRuntimeOptions.getCompletedTurns} is omitted (legacy tests). */
  private localCompletedTurns = 0;
  private lastPrepared: LastPrepared = null;

  constructor(private readonly opts: NegotiationRuntimeOptions) {}

  private completedTurnsForPrepare(): number {
    return this.opts.getCompletedTurns?.() ?? this.localCompletedTurns;
  }

  private bumpLocalCompletedIfStandalone(): void {
    if (this.opts.getCompletedTurns === undefined) {
      this.localCompletedTurns += 1;
    }
  }

  /** Completed turns for prompts / TTL (ledger-backed or internal when standalone). */
  get turns(): number {
    return this.completedTurnsForPrepare();
  }

  private schemaOpts(): NegotiationTurnSchemaOptions {
    return {
      allowAgentPortTtl: this.opts.allowAgentPortTtl ?? true,
    };
  }

  private pickOfferTtl(output: { ttl?: TtlSpec }): TtlSpec {
    const allow = this.opts.allowAgentPortTtl ?? true;
    if (allow && output.ttl) {
      return output.ttl;
    }
    return this.opts.defaultPortTtl;
  }

  private pickPortTtl(p: { ttl?: TtlSpec }): TtlSpec {
    const allow = this.opts.allowAgentPortTtl ?? true;
    if (allow && p.ttl) {
      return p.ttl;
    }
    return this.opts.defaultPortTtl;
  }

  /**
   * Lists counterparty bind targets after synthetic reconciliation, policy, and negotiation turn TTL.
   */
  private async listBindablePortIdsForActingParty(actingPartyId: string): Promise<{
    head: string;
    portIds: string[];
  } | null> {
    const requireNoop = this.opts.requireNoop ?? true;
    const requireWalkAway = this.opts.requireWalkAway ?? true;
    const client = this.opts.client;
    const ledgerSeq = this.opts.ledgerSeq();

    let bindable = await listBindableCounterpartyPorts({
      client,
      persistence: this.opts.persistence,
      actingPartyId,
      ledgerSeq,
      validateBind: this.opts.validateBind,
    });

    const head = resolveHeadOfferIdForSyntheticPorts({
      client,
      actingPartyId,
      bindable,
    });
    if (head === null) {
      return null;
    }

    const synExpose = minExposeSeqOnOffer(client, head) ?? this.completedTurnsForPrepare();
    ensureRuntimeSyntheticPorts({
      client,
      ledgerSeq,
      headOfferId: head,
      requireNoop,
      requireWalkAway,
      exposeSeq: synExpose,
      portTtl: this.opts.defaultPortTtl,
    });

    bindable = await listBindableCounterpartyPorts({
      client,
      persistence: this.opts.persistence,
      actingPartyId,
      ledgerSeq,
      validateBind: this.opts.validateBind,
    });

    let portIds = filterBindablePortIdsForPolicy(
      bindable.map((b) => b.portId),
      head,
      requireNoop,
      requireWalkAway,
    );
    portIds = filterPortIdsByNegotiationTurnTtl(client, portIds, this.completedTurnsForPrepare());
    if (portIds.length === 0) {
      return null;
    }
    return { head, portIds };
  }

  /**
   * True when the graph has no counterparty bind targets for this party (typical empty start).
   * Host may use this with `turns === 0` to choose a genesis turn.
   */
  async hasNoBindableCounterpartyPorts(actingPartyId: string): Promise<boolean> {
    const r = await this.listBindablePortIdsForActingParty(actingPartyId);
    return r === null;
  }

  /**
   * Read-only bind menu for UI / health checks: reconciles synthetic noop/walk ports on the
   * counterparty head (same as {@link prepareActingTurn}) then lists policy-filtered bind targets.
   * Does not set internal prepare state for {@link applyTurn}.
   */
  async getBindSnapshotForParty(actingPartyId: string): Promise<{
    bindMenu: NegotiationBindMenuEntry[];
    counterpartyHeadOfferType: string | null;
    headOfferId: string;
  } | null> {
    const client = this.opts.client;
    const r = await this.listBindablePortIdsForActingParty(actingPartyId);
    if (r === null) {
      return null;
    }

    const headOfferRes = client.getOffer(r.head);
    const counterpartyHeadOfferType =
      headOfferRes.kind === "found" ? headOfferRes.offer.type : null;

    const bindMenu: NegotiationBindMenuEntry[] = [];
    for (const id of r.portIds) {
      const pr = client.getPort(id);
      if (pr.kind === "found") {
        const port = pr.port;
        bindMenu.push({
          portId: id,
          portType: port.type,
          terminal: port.terminal,
          promise: port.promise,
          affordanceDescription: composeBindAffordanceDescription(port),
          ...(port.bind_policy !== undefined ? { bind_policy: port.bind_policy } : {}),
        });
      }
    }

    return { bindMenu, counterpartyHeadOfferType, headOfferId: r.head };
  }

  /**
   * First structured move: extend with empty bind and expose ports. Call {@link applyGenesisTurn} after `generate()`.
   */
  async prepareGenesisTurn(actingPartyId: string): Promise<{
    schema: z.ZodType<NegotiationGenesisTurnOutput>;
  }> {
    if (this.completedTurnsForPrepare() >= this.opts.maxTurns) {
      throw new RangeError("NegotiationRuntime.prepareGenesisTurn: maxTurns already reached");
    }
    const empty = await this.hasNoBindableCounterpartyPorts(actingPartyId);
    if (!empty) {
      throw new RangeError(
        "NegotiationRuntime.prepareGenesisTurn: counterparty already exposes bindable ports",
      );
    }
    const schema = buildGenesisNegotiationTurnOutput(this.schemaOpts());
    this.lastPrepared = { kind: "genesis", schema };
    return { schema };
  }

  /**
   * Build {@link TurnBody} + staging after structured genesis output validation (no persistence).
   */
  materializeGenesisTurn(
    actingPartyId: string,
    rawOutput: unknown,
  ): { body: TurnBody; staging: NegotiationGenesisStaging } {
    if (this.completedTurnsForPrepare() >= this.opts.maxTurns) {
      throw new RangeError("NegotiationRuntime.materializeGenesisTurn: maxTurns exceeded");
    }
    const prep = this.lastPrepared;
    if (prep === null || prep.kind !== "genesis") {
      throw new RangeError(
        "NegotiationRuntime.materializeGenesisTurn: call prepareGenesisTurn before materializeGenesisTurn",
      );
    }

    const output = prep.schema.parse(rawOutput) as NegotiationGenesisTurnOutput;
    const ledgerSeq = this.opts.ledgerSeq();
    const turnIndex = this.completedTurnsForPrepare();
    const offerTtl = this.pickOfferTtl(output);
    const offerExpiresSeq = expiresSeqForOfferTtl(ledgerSeq, offerTtl);

    const offerId = crypto.randomUUID();
    const ports: PortSpec[] = [];
    for (const p of output.ports ?? []) {
      const portTtl = this.pickPortTtl(p);
      ports.push({
        id: crypto.randomUUID(),
        isTerminal: p.terminal,
        portType: p.portType,
        promise: p.promise,
        max_bindings: p.max_bindings ?? 1,
        ...(p.bind_policy !== undefined ? { bind_policy: p.bind_policy } : {}),
        ref: p.ref?.trim() ?? "",
        expose_seq: turnIndex,
        ttl_basis: portTtl.basis,
        ttl_measure: portTtl.measure,
        expires_seq: expiresSeqForPortTtl(ledgerSeq, portTtl),
        sourcemaps: p.sourcemaps ?? [],
      });
    }

    const body: TurnBody = {
      offerId,
      offerType: output.offerType,
      expires_seq: offerExpiresSeq,
      ...(output.sourcemaps !== undefined && output.sourcemaps.length > 0
        ? { sourcemaps: output.sourcemaps }
        : {}),
      ...(ports.length > 0 ? { ports } : {}),
    };

    const staging: NegotiationGenesisStaging = {
      kind: "genesis",
      actingPartyId,
      turnIndex,
      parsed: output,
    };

    return { body, staging };
  }

  finalizeGenesisTurn(
    staging: NegotiationGenesisStaging,
    summary: ApplyTurnResult,
    committedTurnBody: TurnBody,
  ): NegotiationGenesisTurnAudit {
    if (
      summary.offerId !== committedTurnBody.offerId ||
      summary.exposedPortIds.length !== (committedTurnBody.ports ?? []).length
    ) {
      throw new RangeError(
        "NegotiationRuntime.finalizeGenesisTurn: commit summary does not match materialized turn body",
      );
    }

    ensureRuntimeSyntheticPorts({
      client: this.opts.client,
      ledgerSeq: this.opts.ledgerSeq(),
      headOfferId: summary.offerId,
      requireNoop: this.opts.requireNoop ?? true,
      requireWalkAway: this.opts.requireWalkAway ?? true,
      exposeSeq: staging.turnIndex,
      portTtl: this.opts.defaultPortTtl,
    });

    const audit: NegotiationGenesisTurnAudit = {
      kind: "genesis",
      turnIndex: staging.turnIndex,
      actingPartyId: staging.actingPartyId,
      newOfferId: summary.offerId,
      newOfferType: staging.parsed.offerType,
      exposedPortIds: summary.exposedPortIds,
      exposedPorts: summarizeExposedPorts(staging.parsed.ports),
      committedTurnBody,
    };

    this.lastPrepared = null;
    return audit;
  }

  applyGenesisTurn(actingPartyId: string, rawOutput: unknown): NegotiationGenesisTurnAudit {
    const { body, staging } = this.materializeGenesisTurn(actingPartyId, rawOutput);
    const summary = graphApplyTurn(this.opts.client, actingPartyId, body);
    const audit = this.finalizeGenesisTurn(staging, summary, body);
    this.bumpLocalCompletedIfStandalone();
    return audit;
  }

  /** Validates structured bind-turn output and returns wire/commit payload without persistence. */
  materializeBindTurn(
    actingPartyId: string,
    rawOutput: unknown,
  ): { body: TurnBody; staging: NegotiationBindStaging } {
    if (this.completedTurnsForPrepare() >= this.opts.maxTurns) {
      throw new RangeError("NegotiationRuntime.materializeBindTurn: maxTurns exceeded");
    }
    const prep = this.lastPrepared;
    if (prep === null || prep.kind !== "bind") {
      throw new RangeError(
        "NegotiationRuntime.materializeBindTurn: call prepareActingTurn before materializeBindTurn",
      );
    }

    const output = prep.schema.parse(rawOutput) as NegotiationTurnOutput;
    const head = prep.headOfferId;
    const bindMenu = prep.bindMenu;
    const counterpartyHeadOfferType = prep.counterpartyHeadOfferType;

    const outRec = output as Record<string, unknown>;
    let portId: string | null = null;
    let counterpartyBindRaw: unknown;
    for (const m of bindMenu) {
      const v = outRec[m.portId];
      if (v === undefined) {
        continue;
      }
      const hasPol = m.bind_policy !== undefined && m.bind_policy.properties.length > 0;
      if (hasPol) {
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
          portId = m.portId;
          counterpartyBindRaw = v;
          break;
        }
      } else if (v === OBP_NEGOTIATION_BIND_NO_POLICY) {
        portId = m.portId;
        counterpartyBindRaw = undefined;
        break;
      }
    }
    if (portId === null) {
      throw new RangeError(
        "NegotiationRuntime.materializeBindTurn: structured output must bind exactly one counterparty port (see schema)",
      );
    }

    const client = this.opts.client;
    const ledgerSeq = this.opts.ledgerSeq();
    const turnIndex = this.completedTurnsForPrepare();

    const chosenPortRes = client.getPort(portId);
    if (chosenPortRes.kind === "notFound") {
      throw new RangeError(
        `NegotiationRuntime.materializeBindTurn: bind port not found: ${portId}`,
      );
    }
    const counterparty_bind = validateCounterpartyBindForPort(
      chosenPortRes.port,
      counterpartyBindRaw,
    );

    const menuHit = bindMenu.find((b) => b.portId === portId);
    const skipNewPortExposes = menuHit?.terminal === true;

    let bindKind: NegotiationBindTurnAudit["bindKind"] = "real";
    if (isRuntimeNoopPortId(portId, head)) {
      bindKind = "noop";
    } else if (isRuntimeWalkAwayPortId(portId, head)) {
      bindKind = "walkAway";
    }

    const sourcemaps: SourceMapRef[] = output.sourcemaps ?? [];
    const offerTtl = this.pickOfferTtl(output);
    const offerExpiresSeq = expiresSeqForOfferTtl(ledgerSeq, offerTtl);
    const offerId = crypto.randomUUID();

    const ports: PortSpec[] = [];
    if (!skipNewPortExposes) {
      for (const p of output.ports ?? []) {
        const portTtl = this.pickPortTtl(p);
        ports.push({
          id: crypto.randomUUID(),
          isTerminal: p.terminal,
          portType: p.portType,
          promise: p.promise,
          max_bindings: p.max_bindings ?? 1,
          ...(p.bind_policy !== undefined ? { bind_policy: p.bind_policy } : {}),
          ref: p.ref?.trim() ?? "",
          expose_seq: turnIndex,
          ttl_basis: portTtl.basis,
          ttl_measure: portTtl.measure,
          expires_seq: expiresSeqForPortTtl(ledgerSeq, portTtl),
          sourcemaps: p.sourcemaps ?? [],
        });
      }
    }

    const body: TurnBody = {
      offerId,
      offerType: output.offerType,
      expires_seq: offerExpiresSeq,
      ...(sourcemaps.length > 0 ? { sourcemaps } : {}),
      bindPortId: portId,
      counterparty_bind,
      ...(ports.length > 0 ? { ports } : {}),
    };

    const staging: NegotiationBindStaging = {
      kind: "bind",
      actingPartyId,
      turnIndex,
      headOfferId: head,
      counterpartyHeadOfferType,
      bindMenu,
      bindPortId: portId,
      bindKind,
      parsed: output,
      skipNewPortExposes,
    };

    return { body, staging };
  }

  finalizeBindTurn(
    staging: NegotiationBindStaging,
    summary: ApplyTurnResult,
    committedTurnBody: TurnBody,
  ): NegotiationBindTurnAudit {
    if (
      summary.offerId !== committedTurnBody.offerId ||
      summary.exposedPortIds.length !== (committedTurnBody.ports ?? []).length
    ) {
      throw new RangeError(
        "NegotiationRuntime.finalizeBindTurn: commit summary does not match materialized turn body",
      );
    }

    if (!staging.skipNewPortExposes) {
      ensureRuntimeSyntheticPorts({
        client: this.opts.client,
        ledgerSeq: this.opts.ledgerSeq(),
        headOfferId: summary.offerId,
        requireNoop: this.opts.requireNoop ?? true,
        requireWalkAway: this.opts.requireWalkAway ?? true,
        exposeSeq: staging.turnIndex,
        portTtl: this.opts.defaultPortTtl,
      });
    }

    if (staging.bindKind === "walkAway") {
      this.opts.requestNegotiationEnd?.({ reason: "walk-away" });
    }

    const chosenPortType =
      staging.bindMenu.find((b) => b.portId === staging.bindPortId)?.portType ??
      (() => {
        const pr = this.opts.client.getPort(staging.bindPortId);
        return pr.kind === "found" ? pr.port.type : "";
      })();

    const counterparty_bind =
      committedTurnBody.counterparty_bind !== undefined ? committedTurnBody.counterparty_bind : {};

    const audit: NegotiationBindTurnAudit = {
      kind: "bind",
      turnIndex: staging.turnIndex,
      actingPartyId: staging.actingPartyId,
      chosenPortId: staging.bindPortId,
      chosenPortType,
      headOfferId: staging.headOfferId,
      counterpartyHeadOfferType: staging.counterpartyHeadOfferType,
      bindKind: staging.bindKind,
      bindMenu: staging.bindMenu,
      newOfferId: summary.offerId,
      newOfferType: staging.parsed.offerType,
      exposedPortIds: summary.exposedPortIds,
      exposedPorts: summarizeExposedPorts(staging.parsed.ports),
      ...(Object.keys(counterparty_bind).length > 0 ? { counterpartyBind: counterparty_bind } : {}),
      committedTurnBody,
    };

    this.lastPrepared = null;
    return audit;
  }

  /**
   * Reconciles synthetic ports, then builds the Zod schema for this acting party turn.
   * Call once before each `generate()`; then pass structured output to {@link applyTurn}.
   */
  async prepareActingTurn(actingPartyId: string): Promise<{
    schema: z.ZodType<NegotiationTurnOutput>;
    allowedPortIds: readonly string[];
    headOfferId: string;
    bindMenu: NegotiationBindMenuEntry[];
  }> {
    if (this.completedTurnsForPrepare() >= this.opts.maxTurns) {
      throw new RangeError("NegotiationRuntime.prepareActingTurn: maxTurns already reached");
    }

    const client = this.opts.client;
    const r = await this.listBindablePortIdsForActingParty(actingPartyId);
    if (r === null) {
      throw new RangeError(
        "NegotiationRuntime.prepareActingTurn: no counterparty exposed offer; use prepareGenesisTurn when the graph is empty",
      );
    }

    const headOfferRes = client.getOffer(r.head);
    const counterpartyHeadOfferType =
      headOfferRes.kind === "found" ? headOfferRes.offer.type : null;

    const bindMenu: NegotiationBindMenuEntry[] = [];
    for (const id of r.portIds) {
      const pr = client.getPort(id);
      if (pr.kind === "found") {
        const port = pr.port;
        bindMenu.push({
          portId: id,
          portType: port.type,
          terminal: port.terminal,
          promise: port.promise,
          affordanceDescription: composeBindAffordanceDescription(port),
          ...(port.bind_policy !== undefined ? { bind_policy: port.bind_policy } : {}),
        });
      }
    }

    const schema = buildNegotiationTurnOutput(bindMenu, this.schemaOpts());
    this.lastPrepared = {
      kind: "bind",
      schema,
      headOfferId: r.head,
      allowedPortIds: r.portIds,
      bindMenu,
      counterpartyHeadOfferType,
    };

    return { schema, allowedPortIds: r.portIds, headOfferId: r.head, bindMenu };
  }

  /**
   * Validates structured output via {@link graphApplyTurn}, then finalizes synthetics + audit.
   * Call {@link prepareActingTurn} first.
   */
  applyTurn(actingPartyId: string, rawOutput: unknown): NegotiationBindTurnAudit {
    const { body, staging } = this.materializeBindTurn(actingPartyId, rawOutput);
    const summary = graphApplyTurn(this.opts.client, actingPartyId, body);
    const audit = this.finalizeBindTurn(staging, summary, body);
    this.bumpLocalCompletedIfStandalone();
    return audit;
  }
}
