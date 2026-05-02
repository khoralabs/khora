import type {
  RegisteredAgentIdentity,
  ToolkitContext,
  ToolRuntimeContext,
} from "@cfd/agent-identity";
import { evaluateRegisteredAgentAffordances } from "@cfd/agent-identity";
import { formatZodErrorForAgent } from "@cfd/obp-bind-policy-zod";
import type { LanguageModel } from "ai";
import {
  APICallError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from "ai";
import type z from "zod";
import { OBP_NEGOTIATION_BIND_NO_POLICY } from "../src/constants.ts";
import { createStructuredObpNegotiationAgent } from "../src/create-agent.ts";
import type {
  NegotiationBindMenuEntry,
  NegotiationRuntime,
  NegotiationTurnAudit,
} from "../src/runtime.ts";
import type { GraphSnapshot } from "./graph-snapshot.ts";
import { NEGOTIATION_LLM_TURN_BUDGET_MS } from "./negotiation-timeouts.ts";
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

function bindChoicesPrompt(menu: ReadonlyArray<NegotiationBindMenuEntry>): string {
  if (menu.length === 0) {
    return "(none)";
  }
  return menu
    .map((b) => {
      const tag = b.terminal ? " [terminal — omit `ports` in JSON]" : "";
      const sid = short(b.portId);
      return `• **${sid}** \`${b.portType}\`${tag}\n  ${b.description}`;
    })
    .join("\n\n");
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

const MAX_PROVIDER_BODY_CHARS = 16_000;

function stringifyProviderBody(body: unknown): string {
  if (body === undefined || body === null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function truncateForLog(s: string, max = MAX_PROVIDER_BODY_CHARS): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}\n… (${s.length - max} more characters truncated)`;
}

/**
 * Human-readable chain for AI SDK / provider failures (exposes HTTP status and response body when present).
 */
export function formatNegotiationProviderError(e: unknown): string {
  const lines: string[] = [];

  function appendFromUnknown(cur: unknown, depth: number): void {
    if (cur === undefined || depth > 8) {
      return;
    }
    if (cur instanceof APICallError) {
      lines.push(`${cur.name}: ${cur.message}`);
      if (cur.statusCode !== undefined) {
        lines.push(`HTTP ${cur.statusCode}`);
      }
      if (cur.url) {
        lines.push(`URL: ${cur.url}`);
      }
      const bodyText = stringifyProviderBody(cur.responseBody);
      if (bodyText) {
        lines.push(`Response body:\n${truncateForLog(bodyText)}`);
      }
      const hdrs = cur.responseHeaders;
      if (hdrs !== undefined && typeof hdrs === "object" && Object.keys(hdrs).length > 0) {
        lines.push(`Response headers: ${truncateForLog(JSON.stringify(hdrs), 4000)}`);
      }
      appendFromUnknown(cur.cause, depth + 1);
      return;
    }
    if (NoOutputGeneratedError.isInstance(cur)) {
      lines.push(`${cur.name}: ${cur.message}`);
      lines.push(
        "Source: AI SDK (not a raw provider HTTP error). The model/tool loop ended without producing the structured negotiation object — e.g. used all tool steps without a final JSON object, empty completion, safety stop, or object-generation gave up.",
      );
      appendFromUnknown(cur.cause, depth + 1);
      return;
    }
    if (NoObjectGeneratedError.isInstance(cur)) {
      lines.push(`${cur.name}: ${cur.message}`);
      lines.push(
        "Source: AI SDK. The model returned something that could not be parsed into the expected structured JSON object.",
      );
      appendFromUnknown(cur.cause, depth + 1);
      return;
    }
    if (cur instanceof Error) {
      lines.push(`${cur.name}: ${cur.message}`);
      appendFromUnknown(cur.cause, depth + 1);
      return;
    }
    lines.push(typeof cur === "object" ? JSON.stringify(cur) : String(cur));
  }

  appendFromUnknown(e, 0);
  return lines.filter(Boolean).join("\n");
}

async function generateStructuredNegotiationTurn<T>(opts: {
  args: RunLlmTurnArgs;
  scenario: string;
  schema: z.ZodType<T>;
  outputName: string;
  outputDescription: string;
  /** Lines after the turn header, before the graph snapshot. */
  turnBodyLines: string[];
  applyParsed: (data: T) => NegotiationTurnAudit;
}): Promise<RunLlmTurnOk | RunLlmTurnErr> {
  const { args, scenario, schema, outputName, outputDescription, turnBodyLines, applyParsed } =
    opts;

  const outputSpec = Output.object({
    name: outputName,
    description: outputDescription,
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
    ...turnBodyLines,
    snapshotLines(args.graph),
    "",
    "Prior turns summary:",
    args.priorAuditsSummary || "(none)",
  ].join("\n");

  let generation: Awaited<ReturnType<typeof agent.generate>>;
  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const budgetExceeded = new Promise<never>((_, reject) => {
      budgetTimer = setTimeout(() => {
        reject(
          new Error(
            `LLM generation exceeded ${NEGOTIATION_LLM_TURN_BUDGET_MS}ms budget (tool loop or provider stalled)`,
          ),
        );
      }, NEGOTIATION_LLM_TURN_BUDGET_MS);
    });
    generation = await Promise.race([
      agent.generate({
        messages: [{ role: "user", content: userContent }],
      }),
      budgetExceeded,
    ]);
  } catch (e) {
    return {
      ok: false,
      error: `LLM generation failed:\n${formatNegotiationProviderError(e)}`,
    };
  } finally {
    if (budgetTimer !== undefined) {
      clearTimeout(budgetTimer);
    }
  }

  let structuredOutput: unknown;
  try {
    structuredOutput = generation.output;
  } catch (e) {
    return {
      ok: false,
      error: `Structured output unavailable:\n${formatNegotiationProviderError(e)}`,
    };
  }

  const parsed = schema.safeParse(structuredOutput);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Structured output invalid:\n${formatZodErrorForAgent(parsed.error)}`,
    };
  }

  try {
    const audit = applyParsed(parsed.data);
    return { ok: true, audit };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function runLlmTurn(args: RunLlmTurnArgs): Promise<RunLlmTurnOk | RunLlmTurnErr> {
  const scenario = scenarioForUserMessage();

  if (args.genesisTurn) {
    const { schema } = await args.negotiation.prepareGenesisTurn(args.actingPartyId);
    return generateStructuredNegotiationTurn({
      args,
      scenario,
      schema,
      outputName: "GenesisNegotiationTurn",
      outputDescription:
        "Opening move: set your root offerType (public state) and expose one or more ports. Each port requires a non-empty `description` (counterparty-facing copy), `portType`, and `terminal`. Optional `bind_policy` means future binds must supply matching policy-shaped fields on that port’s key. No bind yet.",
      turnBodyLines: [
        "**Opening move:** there is no counterparty offer to bind yet. Propose your initial public state (`offerType`) and expose the ports your counterpart may bind next.",
        "",
      ],
      applyParsed: (data) => args.negotiation.applyGenesisTurn(args.actingPartyId, data),
    });
  }

  const { schema, bindMenu } = await args.negotiation.prepareActingTurn(args.actingPartyId);
  return generateStructuredNegotiationTurn({
    args,
    scenario,
    schema,
    outputName: "NegotiationTurn",
    outputDescription: `Structured negotiation: set **exactly one** JSON property whose key is a **port id** from the bind menu (see user message). Use value **"${OBP_NEGOTIATION_BIND_NO_POLICY}"** for ports without bind policy, or the **policy-shaped object** when that port has \`bind_policy\`. Set \`offerType\` to your new public state after that bind. If the chosen port is **terminal**, omit \`ports\` entirely. Otherwise you may optionally list new \`ports\` (each with required \`description\`).`,
    turnBodyLines: [
      "Choose exactly one counterparty affordance: your JSON must include **one** top-level key equal to a **port id** from the list below (opaque UUIDs are intentional). The schema's `.description` on that key repeats the affordance text.",
      "Ports marked **terminal**: your structured response must **not** include a `ports` field.",
      "**Bind choices (port id → type → description):**",
      bindChoicesPrompt(bindMenu),
      "",
    ],
    applyParsed: (data) => args.negotiation.applyTurn(args.actingPartyId, data),
  });
}
