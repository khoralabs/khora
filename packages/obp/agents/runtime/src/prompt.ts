import type { NegotiationBindMenuEntry } from "./runtime.ts";

/** Compact, portable view of an OBP graph for prompt injection. Mirrors the demo snapshot. */
export type GraphSnapshotForPrompt = {
  parties: ReadonlyArray<{ id: string; name: string }>;
  offers: ReadonlyArray<{ id: string; type: string; partyId: string | null }>;
  ports: ReadonlyArray<{ id: string; type: string; terminal: boolean }>;
  extends: ReadonlyArray<{ partyId: string; offerId: string }>;
  exposes: ReadonlyArray<{ offerId: string; portId: string }>;
  binds: ReadonlyArray<{ offerId: string; portId: string }>;
};

function shortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}…`;
}

/** Markdown-friendly compact graph block for the user message. */
export function formatGraphSnapshotForPrompt(g: GraphSnapshotForPrompt): string {
  const lines: string[] = ["=== Graph (compact) ==="];
  lines.push(`Parties: ${g.parties.map((p) => `${p.name}(${shortId(p.id)})`).join(", ")}`);
  for (const o of g.offers) {
    lines.push(
      `Offer ${shortId(o.id)} type=${o.type} ownerParty=${o.partyId ? shortId(o.partyId) : "?"}`,
    );
  }
  for (const p of g.ports) {
    lines.push(`Port ${shortId(p.id)} type=${p.type} terminal=${p.terminal}`);
  }
  lines.push(
    `EXTENDS: ${g.extends.map((e) => `${shortId(e.partyId)}→${shortId(e.offerId)}`).join("; ") || "(none)"}`,
  );
  lines.push(
    `EXPOSES: ${g.exposes.map((e) => `${shortId(e.offerId)}→${shortId(e.portId)}`).join("; ") || "(none)"}`,
  );
  lines.push(
    `BINDS: ${g.binds.map((e) => `${shortId(e.offerId)}→${shortId(e.portId)}`).join("; ") || "(none)"}`,
  );
  return lines.join("\n");
}

/** Renders the bind menu as the bullet list the agent reads when picking a port id. */
export function formatBindMenuForPrompt(menu: ReadonlyArray<NegotiationBindMenuEntry>): string {
  if (menu.length === 0) {
    return "(none)";
  }
  return menu
    .map((b) => {
      const tag = b.terminal ? " [terminal — omit `ports` in JSON]" : "";
      const sid = shortId(b.portId);
      return `• **${sid}** \`${b.portType}\`${tag}\n  ${b.description}`;
    })
    .join("\n\n");
}

export type BuildObpNegotiationUserMessageArgs = {
  /** Optional scenario block (joint goal, conventions). Omitted when empty. */
  scenario?: string;
  partyRoleName: string;
  actingPartyId: string;
  /** Lines after the turn header, before the graph snapshot. */
  turnBodyLines?: ReadonlyArray<string>;
  graph: GraphSnapshotForPrompt;
  /** Optional summary of prior turns for short-term context. */
  priorAuditsSummary?: string;
};

/** Composes the standard user message for an OBP negotiation turn. */
export function buildObpNegotiationUserMessage(args: BuildObpNegotiationUserMessageArgs): string {
  const lines: string[] = [];
  if (args.scenario && args.scenario.trim() !== "") {
    lines.push(args.scenario, "");
  }
  lines.push(`## This turn: **${args.partyRoleName}** (party id ${args.actingPartyId})`, "");
  for (const l of args.turnBodyLines ?? []) {
    lines.push(l);
  }
  lines.push(formatGraphSnapshotForPrompt(args.graph), "", "Prior turns summary:");
  const prior = args.priorAuditsSummary;
  lines.push(prior !== undefined && prior.trim().length > 0 ? prior : "(none)");
  return lines.join("\n");
}
