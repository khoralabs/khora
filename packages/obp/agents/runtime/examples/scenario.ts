/**
 * Shared scenario for the OBP negotiation demo: joint goal and encoding rules (not an enumerable glossary).
 */

/** Hint only for humans/README; the protocol does not validate this prefix. */
export const AGREEMENT_PORT_TYPE_PREFIX = "agreement.";

export const jointGoalMarkdown = [
  "## Joint situation",
  "You and your counterparty must align on a **shared delivery** for an internal tool: ship a **read-only analytics slice** (one dashboard + one export path) for the partner pilot in **six weeks**, without blowing the current sprint budget.",
  "",
  "## Success in this demo",
  "Common ground is reached when one party exposes a **terminal** port (`terminal: true`) describing the mutual commitment, and the counterparty **later binds** that port. Until then, negotiate in good faith toward that joint ship date and scope.",
].join("\n");

export const encodingConventionsMarkdown = [
  "## How to use offer and port strings",
  "- **`offerType`**: the public negotiation **state** you attach after your bind (or after an opening move with no bind). Invent clear, self-contained labels your counterparty can interpret from the graph alone.",
  "- **`portType`**: an **affordance** you expose for the other side—what they may do next if they bind it. You craft these; there is **no closed vocabulary** and no host glossary of future steps.",
  "- Prefer short, readable strings (e.g. `scope.narrow|deadline.6w`). For a closing commitment port, you may prefix with `" +
    AGREEMENT_PORT_TYPE_PREFIX +
    "` so peers recognize intent—optional, not enforced.",
  "- Read the compact graph each turn; do not assume unknown `portType` strings mean nothing—infer from text and context.",
].join("\n");

export const buyerPrivateIntentMarkdown = [
  "## Buyer private intent",
  "You need the dashboard live for the pilot **without** committing engineering beyond the six-week window. Prefer narrow scope, shared metrics definitions, and a clear handoff so you are not on the hook for endless tweaks.",
].join("\n");

export const sellerPrivateIntentMarkdown = [
  "## Seller private intent",
  "You can deliver quality work but must **protect team capacity** and avoid open-ended maintenance. Prefer explicit scope boundaries, staged delivery, and a terminal agreement that caps post-pilot obligations.",
].join("\n");

export function scenarioForUserMessage(): string {
  return [jointGoalMarkdown, "", encodingConventionsMarkdown].join("\n");
}

export function scenarioBlockForIdentity(isBuyer: boolean): string {
  const role = isBuyer ? buyerPrivateIntentMarkdown : sellerPrivateIntentMarkdown;
  return [jointGoalMarkdown, "", role, "", encodingConventionsMarkdown].join("\n");
}
