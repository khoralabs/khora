import { expect, test } from "bun:test";

import type { ChatMessage } from "@/lib/interview-api";

import { interviewScrollAnchorMessageId } from "./interview-scroll-pad";

const userMessage: ChatMessage = {
  id: "user-1",
  role: "user",
  content: "Hello",
  createdAtMs: 1,
  author: null,
};

test("interviewScrollAnchorMessageId tracks the last user message while submitted", () => {
  expect(interviewScrollAnchorMessageId([userMessage], "submitted")).toBe("user-1");
  expect(interviewScrollAnchorMessageId([userMessage], "streaming")).toBeNull();
  expect(interviewScrollAnchorMessageId([], "submitted")).toBeNull();
});
