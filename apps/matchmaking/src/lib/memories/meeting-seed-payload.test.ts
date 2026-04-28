import { expect, test } from "bun:test";
import { zMeetingSeedPayload } from "./meeting-seed-payload.ts";

test("meeting_goal payload parses", () => {
  const p = zMeetingSeedPayload.parse({
    kind: "meeting_goal",
    text: "Align on exit criteria",
    goalKind: "strategy",
    priority: 2,
  });
  expect(p.kind).toBe("meeting_goal");
  if (p.kind === "meeting_goal") {
    expect(p.text).toContain("exit");
    expect(p.priority).toBe(2);
  }
});

test("meeting_negotiation_summary payload parses", () => {
  const p = zMeetingSeedPayload.parse({
    kind: "meeting_negotiation_summary",
    summaryText: "Both sides want a follow-up with a shared doc.",
    fitAssessment: "Likely fit",
    keyEvidence: ["Clear next step"],
    partySlug: "mira-patel",
    counterpartySlug: "_user_",
  });
  expect(p.kind).toBe("meeting_negotiation_summary");
  if (p.kind === "meeting_negotiation_summary") {
    expect(p.summaryText.length).toBeGreaterThan(0);
    expect(p.keyEvidence?.[0]).toBe("Clear next step");
  }
});
