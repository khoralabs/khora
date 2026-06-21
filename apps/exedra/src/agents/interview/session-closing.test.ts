import { expect, test } from "bun:test";

import { buildSessionClosingMessage } from "./session-closing.js";

test("buildSessionClosingMessage includes summary, beliefs nudge, and follow-up options", () => {
  const message = buildSessionClosingMessage({
    summary: "We aligned on shipping weekly with async design reviews.",
    nextSessionOptions: ["Roadmap tradeoffs", "Quality bar"],
  });

  expect(message).toContain("We aligned on shipping weekly with async design reviews.");
  expect(message).toContain("beliefs in the canvas");
  expect(message).toContain("- Roadmap tradeoffs");
  expect(message).toContain("- Quality bar");
  expect(message).toContain("keep chatting here");
});

test("buildSessionClosingMessage uses fallback summary when empty", () => {
  const message = buildSessionClosingMessage({
    summary: "   ",
    nextSessionOptions: [],
  });

  expect(message).toContain("Thanks for sharing your perspective");
  expect(message).not.toContain("consider a follow-up session");
});
