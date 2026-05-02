/**
 * Stranger matchmaking: two matched strangers progressively disclose to see if meeting has value.
 */

import type { PartyDisplayNames } from "../../shared/negotiation-types.ts";

export const partyDisplayNames: PartyDisplayNames = {
  buyer: "Party A",
  seller: "Party B",
};

export const AGREEMENT_PORT_TYPE_PREFIX = "agreement.";

export const jointGoalMarkdown = [
  "## Joint situation",
  "You were introduced as **strangers**—by a platform, a mutual contact, or a cold match—without shared history. You know almost nothing about each other except that someone thought you might benefit from connecting.",
  "",
  "Your shared objective is **calibrated disclosure**: trade small, truthful signals (interests, constraints, what you hope to learn) so both sides can judge **whether a real meeting**—or a longer dedicated call—is worth the time and trust cost.",
  "",
  "## Success in this demo",
  "Same technical rule as other demos: common ground is reached when one party exposes a **terminal** port describing mutual commitment (e.g. agreeing to meet under clear terms), and the counterparty **later binds** it.",
].join("\n");

export const encodingConventionsMarkdown = [
  "## How to use offer and port strings",
  "- **`offerType`**: your **public stance** after a bind or opening move—what you are willing to reveal or claim at this stage.",
  "- **`portType`**: an **affordance** for your peer—questions, small disclosure requests, compatibility checks, or narrow next steps. Prefer **incremental** steps; avoid dumping everything or locking in a meeting without mutual signal.",
  "- Optional terminal prefix `" +
    AGREEMENT_PORT_TYPE_PREFIX +
    "` on a closing port—e.g. a concrete meet proposal—hint only, not enforced.",
  "- **`bind_policy`** (when your host allows it on ports you expose): require structured answers (e.g. availability band, topic focus) at bind time instead of burying mandatory questions only in **`description`**.",
  "- Infer meaning from unknown strings using prior turns; the graph is your shared transcript.",
].join("\n");

export const buyerPrivateIntentMarkdown = [
  "## Party A private intent",
  "You **protect privacy**: you dislike oversharing with strangers and want to **screen for seriousness** before investing emotional or logistical energy. You prefer **slow reveal**: verify vibe and overlap before naming specifics (schedule, neighborhood, employer). You are willing to walk away if the exchange feels vague, pushy, or unsafe.",
].join("\n");

export const sellerPrivateIntentMarkdown = [
  "## Party B private intent",
  "You value **efficiency**: endless small talk without moving toward a decision frustrates you. You want **concrete overlap signals** early (topic, timing band, what “good” would look like) so you do not waste weeks on messaging. You still respect boundaries—you just push for **clear, bounded next steps** once basic trust is present.",
].join("\n");

export function scenarioForUserMessage(): string {
  return [jointGoalMarkdown, "", encodingConventionsMarkdown].join("\n");
}

export function scenarioBlockForIdentity(isBuyer: boolean): string {
  const role = isBuyer ? buyerPrivateIntentMarkdown : sellerPrivateIntentMarkdown;
  return [jointGoalMarkdown, "", role, "", encodingConventionsMarkdown].join("\n");
}
