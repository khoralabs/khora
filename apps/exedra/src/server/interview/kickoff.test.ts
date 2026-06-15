import { expect, test } from "bun:test";

import {
  buildInterviewKickoffMessage,
  interviewKickoffMessageId,
} from "../../agents/interview/instructions";

test("buildInterviewKickoffMessage is deterministic for a session", () => {
  const meta = {
    topic: "Q2 roadmap alignment",
  };

  const first = buildInterviewKickoffMessage(meta);
  const second = buildInterviewKickoffMessage(meta);

  expect(first).toBe(second);
  expect(first).toBe("Session topic: Q2 roadmap alignment");
});

test("interviewKickoffMessageId is stable per thread", () => {
  expect(interviewKickoffMessageId("thread-1")).toBe("kickoff-thread-1");
});
