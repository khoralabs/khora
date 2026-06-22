import { expect, test } from "bun:test";

import type { ChatMessage } from "@/lib/interview-api";

import { interviewShowAgentLoading } from "./interview-agent-loading";

const userMessage: ChatMessage = {
  id: "user-1",
  role: "user",
  content: "Hello",
  createdAtMs: 1,
  author: null,
};

const assistantMessage: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  content: "Hi",
  createdAtMs: 2,
  author: null,
};

test("interviewShowAgentLoading shows for opening kickoff", () => {
  expect(interviewShowAgentLoading(true, [], "submitted")).toBe(true);
});

test("interviewShowAgentLoading shows after user sends a message", () => {
  expect(
    interviewShowAgentLoading(false, [userMessage, assistantMessage, userMessage], "submitted"),
  ).toBe(true);
});

test("interviewShowAgentLoading hides once assistant starts responding", () => {
  expect(interviewShowAgentLoading(false, [userMessage], "streaming")).toBe(false);
  expect(interviewShowAgentLoading(false, [userMessage], "ready")).toBe(false);
});
