/**
 * Intent-overlap scenario: parties probe whether they can work together when goals partially align but priorities differ.
 */

import type { PartyDisplayNames } from "../../shared/negotiation-types.ts";

/** Distinct labels so graph + toolbar reflect the scenario framing (wire roles stay buyer/seller). */
export const partyDisplayNames: PartyDisplayNames = {
  buyer: "Breadth / speed",
  seller: "Depth / controls",
};

export const AGREEMENT_PORT_TYPE_PREFIX = "agreement.";

export const jointGoalMarkdown = [
  "## Joint situation",
  "Two organizations are exploring whether to **integrate their systems for a limited pilot**. Both want real usage signal before a larger commitment, but they weigh **speed and breadth** differently versus **depth and risk control**.",
  "",
  "## What you are evaluating",
  "Use the negotiation graph to surface **where intents overlap**, where they conflict, and what concrete commitments would make collaboration trustworthy. You are not handed a fixed checklist—**you invent** `offerType` and `portType` strings that reflect your evolving read of fit.",
  "",
  "## Success in this demo",
  "Same technical rule as other demos: common ground is reached when one party exposes a **terminal** port describing mutual commitment and the counterparty **later binds** it.",
].join("\n");

export const encodingConventionsMarkdown = [
  "## How to use offer and port strings",
  "- **`offerType`**: your public **state** after a bind or opening move—readable labels your peer can interpret from the graph.",
  "- **`portType`**: an **affordance** you expose; **no closed vocabulary**. Prefer concise strings that encode stance (e.g. overlap on timeline vs mismatch on liability).",
  "- Optional terminal prefix `" +
    AGREEMENT_PORT_TYPE_PREFIX +
    "` on closing ports—hint only, not enforced.",
  "- **`bind_policy`** (optional on ports you expose): structured fields the peer must supply to bind; **enforced at bind time** when set. Listing interview questions only in **`promise`** does **not** obligate answers—use policy properties for anything you require before the bind counts.",
  "- Infer meaning from unknown strings using prior turns and port promises.",
].join("\n");

export const buyerPrivateIntentMarkdown = [
  "## Buyer private intent",
  "You want **momentum**: get integrations live quickly, touch multiple surfaces so stakeholders see value, and avoid months of analysis before traffic. You will trade some polish for **early breadth**—but you still need enough clarity not to own unlimited rework.",
].join("\n");

export const sellerPrivateIntentMarkdown = [
  "## Seller private intent",
  "You want **controlled exposure**: narrow blast radius, strong validation gates, and phased rollout so support load stays predictable. You can move fast **inside** a bounded envelope—but **breadth without guardrails** is a red flag.",
].join("\n");

export function scenarioForUserMessage(): string {
  return [jointGoalMarkdown, "", encodingConventionsMarkdown].join("\n");
}

export function scenarioBlockForIdentity(isBuyer: boolean): string {
  const role = isBuyer ? buyerPrivateIntentMarkdown : sellerPrivateIntentMarkdown;
  return [jointGoalMarkdown, "", role, "", encodingConventionsMarkdown].join("\n");
}
