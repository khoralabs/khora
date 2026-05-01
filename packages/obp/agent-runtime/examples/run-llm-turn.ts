import type {
  RegisteredAgentIdentity,
  ToolkitContext,
  ToolRuntimeContext,
} from "@cfd/agent-identity";
import { evaluateRegisteredAgentAffordances } from "@cfd/agent-identity";
import type { LanguageModel } from "ai";
import { Output } from "ai";
import { createStructuredObpNegotiationAgent } from "../src/create-agent.ts";
import type { NegotiationRuntime, NegotiationTurnAudit } from "../src/runtime.ts";
import type { GraphSnapshot } from "./graph-snapshot.ts";
import { scenarioForUserMessage } from "./scenario.ts";

function snapshotLines(g: GraphSnapshot): string {
  const lines: string[] = ["=== Graph (compact) ==="];
  lines.push(`Parties: ${g.parties.map((p) => `${p.name}(${short(p.id)})`).join(", ")}`);
  for (const o of g.offers) {
    lines.push(
      `Offer ${short(o.id)} type=${o.type} ownerParty=${o.partyId ? short(o.partyId) : "?"}`,
    );
  }
  for (const p of g.ports) {
    lines.push(`Port ${short(p.id)} type=${p.type} terminal=${p.terminal}`);
  }
  lines.push(
    `EXTENDS: ${g.extends.map((e) => `${short(e.partyId)}→${short(e.offerId)}`).join("; ") || "(none)"}`,
  );
  lines.push(
    `EXPOSES: ${g.exposes.map((e) => `${short(e.offerId)}→${short(e.portId)}`).join("; ") || "(none)"}`,
  );
  lines.push(
    `BINDS: ${g.binds.map((e) => `${short(e.offerId)}→${short(e.portId)}`).join("; ") || "(none)"}`,
  );
  return lines.join("\n");
}

function short(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}…`;
}

function bindChoicesPrompt(menu: ReadonlyArray<{ portType: string; terminal: boolean }>): string {
  if (menu.length === 0) {
    return "(none)";
  }
  return menu
    .map((b, i) => {
      const tag = b.terminal ? " [terminal — no `ports` in JSON]" : "";
      return `${i}: "${b.portType}"${tag}`;
    })
    .join("\n");
}

export type RunLlmTurnArgs = {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  toolkitCtx: ToolkitContext<Record<string, never>>;
  toolRuntime: ToolRuntimeContext<Record<string, never>>;
  negotiation: NegotiationRuntime;
  actingPartyId: string;
  partyRoleName: string;
  graph: GraphSnapshot;
  priorAuditsSummary: string;
  /** When true, opening move: extend with no bind and expose initial affordances. */
  genesisTurn: boolean;
};

export type RunLlmTurnOk = { ok: true; audit: NegotiationTurnAudit };
export type RunLlmTurnErr = { ok: false; error: string };

export async function runLlmTurn(args: RunLlmTurnArgs): Promise<RunLlmTurnOk | RunLlmTurnErr> {
  const scenario = scenarioForUserMessage();

  if (args.genesisTurn) {
    const { schema } = await args.negotiation.prepareGenesisTurn(args.actingPartyId);

    const outputSpec = Output.object({
      name: "GenesisNegotiationTurn",
      description:
        "Opening move: set your root offerType (public state) and expose one or more portTypes as affordances for the counterparty. No bind yet.",
      schema,
    });

    const affordances = await evaluateRegisteredAgentAffordances(args.identity, args.toolkitCtx);
    const agent = createStructuredObpNegotiationAgent({
      model: args.model,
      identity: args.identity,
      affordances,
      runtime: args.toolRuntime,
      output: outputSpec,
      maxSteps: 6,
    });

    const userContent = [
      scenario,
      "",
      `## This turn: **${args.partyRoleName}** (party id ${args.actingPartyId})`,
      "",
      "**Opening move:** there is no counterparty offer to bind yet. Propose your initial public state (`offerType`) and expose the ports your counterpart may bind next.",
      "",
      snapshotLines(args.graph),
      "",
      "Prior turns summary:",
      args.priorAuditsSummary || "(none)",
    ].join("\n");

    const generation = await agent.generate({
      messages: [{ role: "user", content: userContent }],
    });

    const raw = generation.output;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: `Structured output invalid: ${parsed.error.message}`,
      };
    }

    try {
      const audit = args.negotiation.applyGenesisTurn(args.actingPartyId, parsed.data);
      return { ok: true, audit };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  const prepared = await args.negotiation.prepareActingTurn(args.actingPartyId);
  const { schema, bindMenu } = prepared;

  const outputSpec = Output.object({
    name: "NegotiationTurn",
    description:
      "Structured negotiation: set bindChoiceIndex to the index of which counterparty affordance you bind (numbered list in the user message). Set offerType to your new public state after that bind. If the chosen line is marked terminal, omit the `ports` property entirely (no further exposes). Otherwise you may optionally list new `ports` (portType you invent; use terminal=true only for a closing mutual commitment on your side).",
    schema,
  });

  const affordances = await evaluateRegisteredAgentAffordances(args.identity, args.toolkitCtx);
  const agent = createStructuredObpNegotiationAgent({
    model: args.model,
    identity: args.identity,
    affordances,
    runtime: args.toolRuntime,
    output: outputSpec,
    maxSteps: 6,
  });

  const userContent = [
    scenario,
    "",
    `## This turn: **${args.partyRoleName}** (party id ${args.actingPartyId})`,
    "",
    "Choose exactly one counterparty affordance by **`bindChoiceIndex`** matching the list below (integers 0 … n−1). Do not output port ids—the host maps your index to the graph.",
    "Lines marked **terminal** close that line: your structured response must **not** include a `ports` field when you select one of those indices.",
    "**Bind choices (index → portType):**",
    bindChoicesPrompt(bindMenu),
    "",
    snapshotLines(args.graph),
    "",
    "Prior turns summary:",
    args.priorAuditsSummary || "(none)",
  ].join("\n");

  const generation = await agent.generate({
    messages: [{ role: "user", content: userContent }],
  });

  const raw = generation.output;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Structured output invalid: ${parsed.error.message}`,
    };
  }

  try {
    const audit = args.negotiation.applyTurn(args.actingPartyId, parsed.data);
    return { ok: true, audit };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
