import {
  type BindPolicyField,
  type ObpClient,
  type ObpPersistence,
  type Port,
  type PortBindPolicy,
  type SourceMapRef,
  validateCounterpartyBindForPort,
} from "@cfd/obp-core";
import { listBindableCounterpartyPorts, type ObpToolkitEnv } from "@cfd/obp-tools";
import type z from "zod";
import {
  isRuntimeNoopPortId,
  isRuntimeWalkAwayPortId,
  noopPortIdForHeadOffer,
  OBP_NEGOTIATION_BIND_NO_POLICY,
  walkAwayPortIdForHeadOffer,
} from "./constants.ts";
import { filterPortIdsByNegotiationTurnTtl, minExposeTurnIndexOnOffer } from "./port-turn-ttl.ts";
import {
  ensureRuntimeSyntheticPorts,
  resolveHeadOfferIdForSyntheticPorts,
} from "./system-ports.ts";
import { tsExpiredForTtl } from "./ttl-resolve.ts";
import type { TtlSpec } from "./ttl-spec.ts";
import {
  buildGenesisNegotiationTurnOutput,
  buildNegotiationTurnOutput,
  type NegotiationGenesisTurnOutput,
  type NegotiationTurnExposePort,
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
  let s = port.description.trim();
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
  /** From `Port.description` (exposing party’s counterparty-facing explanation). */
  description: string;
  /** Full string passed to Zod `.describe` on the bind output key. */
  affordanceDescription: string;
  bind_policy?: PortBindPolicy;
};

export type NegotiationExposedPortSummary = {
  portType: string;
  description: string;
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
};

export type NegotiationTurnAudit = NegotiationGenesisTurnAudit | NegotiationBindTurnAudit;

export type NegotiationRuntimeOptions = {
  client: ObpClient;
  persistence: ObpPersistence;
  now: () => number;
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
  ports: readonly { portType: string; description: string; terminal: boolean }[] | undefined,
): NegotiationExposedPortSummary[] {
  if (ports === undefined) {
    return [];
  }
  return ports.map((p) => ({
    portType: p.portType,
    description: p.description,
    terminal: p.terminal,
  }));
}

export class NegotiationRuntime {
  private turnsCompleted = 0;
  private lastPrepared: LastPrepared = null;

  constructor(private readonly opts: NegotiationRuntimeOptions) {}

  /** Completed successful {@link applyTurn} / {@link applyGenesisTurn} calls. */
  get turns(): number {
    return this.turnsCompleted;
  }

  private schemaOpts(): NegotiationTurnSchemaOptions {
    return { allowAgentPortTtl: this.opts.allowAgentPortTtl ?? true };
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
   * Attaches noop/walk synthetic ports to a new head offer after genesis or a non-terminal bind.
   * Skipped when the acting party just bound a **terminal** counterparty port: that offer must not
   * expose anything (including synthetics).
   */
  private reconcileSyntheticPortsOnNewHeadOffer(
    offerId: string,
    exposeTurnIndex: number,
    opts?: { skipSyntheticPorts?: boolean },
  ): void {
    if (opts?.skipSyntheticPorts === true) {
      return;
    }
    ensureRuntimeSyntheticPorts({
      client: this.opts.client,
      now: this.opts.now(),
      headOfferId: offerId,
      requireNoop: this.opts.requireNoop ?? true,
      requireWalkAway: this.opts.requireWalkAway ?? true,
      exposeTurnIndex,
      portTtl: this.opts.defaultPortTtl,
    });
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
    const now = this.opts.now();

    let bindable = await listBindableCounterpartyPorts({
      client,
      persistence: this.opts.persistence,
      actingPartyId,
      now,
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

    const synExpose = minExposeTurnIndexOnOffer(client, head) ?? this.turnsCompleted;
    ensureRuntimeSyntheticPorts({
      client,
      now,
      headOfferId: head,
      requireNoop,
      requireWalkAway,
      exposeTurnIndex: synExpose,
      portTtl: this.opts.defaultPortTtl,
    });

    bindable = await listBindableCounterpartyPorts({
      client,
      persistence: this.opts.persistence,
      actingPartyId,
      now,
      validateBind: this.opts.validateBind,
    });

    let portIds = filterBindablePortIdsForPolicy(
      bindable.map((b) => b.portId),
      head,
      requireNoop,
      requireWalkAway,
    );
    portIds = filterPortIdsByNegotiationTurnTtl(client, portIds, this.turnsCompleted);
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
          description: port.description,
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
    if (this.turnsCompleted >= this.opts.maxTurns) {
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

  applyGenesisTurn(actingPartyId: string, rawOutput: unknown): NegotiationGenesisTurnAudit {
    if (this.turnsCompleted >= this.opts.maxTurns) {
      throw new RangeError("NegotiationRuntime.applyGenesisTurn: maxTurns exceeded");
    }
    const prep = this.lastPrepared;
    if (prep === null || prep.kind !== "genesis") {
      throw new RangeError(
        "NegotiationRuntime.applyGenesisTurn: call prepareGenesisTurn before applyGenesisTurn",
      );
    }

    const output = prep.schema.parse(rawOutput) as NegotiationGenesisTurnOutput;
    const client = this.opts.client;
    const now = this.opts.now();
    const exposeTurnIndex = this.turnsCompleted;
    const sourcemaps: SourceMapRef[] = output.sourcemaps ?? [];
    const offerTtl = this.pickOfferTtl(output);

    const { offer } = client.extendOffer({
      partyId: actingPartyId,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: now,
        ts_expired: tsExpiredForTtl(now, offerTtl),
        type: output.offerType,
        sourcemaps,
      },
    });

    const exposedPortIds: string[] = [];
    for (const p of output.ports ?? []) {
      const portTtl = this.pickPortTtl(p);
      const { port } = client.exposePort({
        offerId: offer.id,
        port: this.buildExposePortPayload(p, now, exposeTurnIndex, portTtl),
      });
      exposedPortIds.push(port.id);
    }

    this.reconcileSyntheticPortsOnNewHeadOffer(offer.id, exposeTurnIndex);

    const audit: NegotiationGenesisTurnAudit = {
      kind: "genesis",
      turnIndex: this.turnsCompleted,
      actingPartyId,
      newOfferId: offer.id,
      newOfferType: output.offerType,
      exposedPortIds,
      exposedPorts: summarizeExposedPorts(output.ports),
    };

    this.lastPrepared = null;
    this.turnsCompleted += 1;
    return audit;
  }

  private buildExposePortPayload(
    p: NegotiationTurnExposePort,
    now: number,
    exposeTurnIndex: number,
    portTtl: TtlSpec,
  ) {
    return {
      id: "",
      ts_created: now,
      ts_expired: tsExpiredForTtl(now, portTtl),
      type: p.portType,
      description: p.description,
      max_bindings: p.max_bindings ?? 1,
      terminal: p.terminal,
      ref: p.ref?.trim() ?? "",
      sourcemaps: p.sourcemaps ?? [],
      ttl_basis: portTtl.basis,
      ttl_measure: portTtl.measure,
      expose_turn_index: exposeTurnIndex,
      ...(p.bind_policy !== undefined ? { bind_policy: p.bind_policy } : {}),
    };
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
    if (this.turnsCompleted >= this.opts.maxTurns) {
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
          description: port.description,
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
   * Validates structured output, performs extend + bind + expose, increments the turn counter,
   * and records audit metadata. Call {@link prepareActingTurn} first.
   */
  applyTurn(actingPartyId: string, rawOutput: unknown): NegotiationBindTurnAudit {
    if (this.turnsCompleted >= this.opts.maxTurns) {
      throw new RangeError("NegotiationRuntime.applyTurn: maxTurns exceeded");
    }
    const prep = this.lastPrepared;
    if (prep === null || prep.kind !== "bind") {
      throw new RangeError("NegotiationRuntime.applyTurn: call prepareActingTurn before applyTurn");
    }

    const output = prep.schema.parse(rawOutput) as NegotiationTurnOutput;
    const head = prep.headOfferId;
    const bindMenu = prep.bindMenu;
    const counterpartyHeadOfferType = prep.counterpartyHeadOfferType;

    const outRec = output as Record<string, unknown>;
    let portId: string | null = null;
    let counterpartyBindRaw: unknown = undefined;
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
        "NegotiationRuntime.applyTurn: structured output must bind exactly one counterparty port (see schema)",
      );
    }

    const client = this.opts.client;
    const now = this.opts.now();
    const exposeTurnIndex = this.turnsCompleted;
    const sourcemaps: SourceMapRef[] = output.sourcemaps ?? [];
    const offerTtl = this.pickOfferTtl(output);

    const chosenPortRes = client.getPort(portId);
    if (chosenPortRes.kind === "notFound") {
      throw new RangeError(`NegotiationRuntime.applyTurn: bind port not found: ${portId}`);
    }
    const counterparty_bind = validateCounterpartyBindForPort(
      chosenPortRes.port,
      counterpartyBindRaw,
    );

    const { offer } = client.extendOffer({
      partyId: actingPartyId,
      bindPortId: portId,
      counterparty_bind,
      offer: {
        id: "",
        ts_created: now,
        ts_expired: tsExpiredForTtl(now, offerTtl),
        type: output.offerType,
        sourcemaps,
      },
    });

    const menuHit = bindMenu.find((b) => b.portId === portId);
    const skipNewPortExposes = menuHit?.terminal === true;

    const exposedPortIds: string[] = [];
    for (const p of skipNewPortExposes ? [] : (output.ports ?? [])) {
      const portTtl = this.pickPortTtl(p);
      const { port } = client.exposePort({
        offerId: offer.id,
        port: this.buildExposePortPayload(p, now, exposeTurnIndex, portTtl),
      });
      exposedPortIds.push(port.id);
    }

    this.reconcileSyntheticPortsOnNewHeadOffer(offer.id, exposeTurnIndex, {
      skipSyntheticPorts: skipNewPortExposes,
    });

    let bindKind: NegotiationBindTurnAudit["bindKind"] = "real";
    if (isRuntimeNoopPortId(portId, head)) {
      bindKind = "noop";
    } else if (isRuntimeWalkAwayPortId(portId, head)) {
      bindKind = "walkAway";
      this.opts.requestNegotiationEnd?.({ reason: "walk-away" });
    }

    const chosenPortType =
      menuHit?.portType ??
      (() => {
        const pr = client.getPort(portId);
        return pr.kind === "found" ? pr.port.type : "";
      })();

    const audit: NegotiationBindTurnAudit = {
      kind: "bind",
      turnIndex: this.turnsCompleted,
      actingPartyId,
      chosenPortId: portId,
      chosenPortType,
      headOfferId: head,
      counterpartyHeadOfferType,
      bindKind,
      bindMenu,
      newOfferId: offer.id,
      newOfferType: output.offerType,
      exposedPortIds,
      exposedPorts: summarizeExposedPorts(output.ports),
      ...(Object.keys(counterparty_bind).length > 0 ? { counterpartyBind: counterparty_bind } : {}),
    };

    this.lastPrepared = null;
    this.turnsCompleted += 1;
    return audit;
  }
}
