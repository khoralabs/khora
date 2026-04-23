import { test, expect } from "bun:test";
import {
  postMeetingReflectionRequestSchema,
  postNegotiationReviewRequestSchema,
} from "./post-negotiation-request.ts";

test("post-negotiation review request schema: decision only", () => {
  const ok = postNegotiationReviewRequestSchema.parse({
    runId: "550e8400-e29b-41d4-a716-446655440000",
    decision: "accept",
  });
  expect(ok.decision).toBe("accept");
  expect(ok.agentFeedback).toBeUndefined();
});

test("post-negotiation review: optional agentFeedback", () => {
  const w = postNegotiationReviewRequestSchema.parse({
    runId: "550e8400-e29b-41d4-a716-446655440000",
    decision: "decline",
    agentFeedback: " The agent was too fast ",
  });
  expect(w.decision).toBe("decline");
  expect(w.agentFeedback).toBe(" The agent was too fast ");
});

test("post-meeting reflection: runId and non-empty text", () => {
  const ok = postMeetingReflectionRequestSchema.parse({
    runId: "550e8400-e29b-41d4-a716-446655440000",
    text: "The chat was useful; follow up next week.",
  });
  expect(ok.text).toContain("follow up");
});

test("post-meeting reflection: rejects empty string", () => {
  const r = postMeetingReflectionRequestSchema.safeParse({
    runId: "550e8400-e29b-41d4-a716-446655440000",
    text: "",
  });
  expect(r.success).toBe(false);
});
