import { expect, test } from "bun:test";
import { zRunSummariesApiResponse } from "./summary-types.ts";

test("run summaries API response parses ready payload", () => {
  const parsed = zRunSummariesApiResponse.parse({
    status: "ready",
    summaries: [
      {
        partySlug: "_user_",
        counterpartySlug: "mira-patel",
        summaryText: "Likely good fit for a short intro.",
        keyEvidence: ["Shared scope", "Timebox aligned"],
      },
      {
        partySlug: "mira-patel",
        counterpartySlug: "_user_",
        summaryText: "Potential fit with clear constraints.",
        keyEvidence: ["Agenda explicit"],
      },
    ],
  });
  expect(parsed.status).toBe("ready");
  if (parsed.status === "ready") {
    expect(parsed.summaries.length).toBe(2);
  }
});
