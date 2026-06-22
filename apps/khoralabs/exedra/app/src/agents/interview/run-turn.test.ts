import { expect, test } from "bun:test";

import { TurnAbortedError } from "../errors.js";
import { getAgentRegistry } from "../registry.js";
import { runInterviewTurn } from "./run-turn.js";

test("TurnAbortedError identifies aborted turns", () => {
  const err = new TurnAbortedError();
  expect(err.name).toBe("TurnAbortedError");
  expect(err).toBeInstanceOf(Error);
});

test("runInterviewTurn throws TurnAbortedError when abortSignal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();

  await expect(
    runInterviewTurn({
      registry: getAgentRegistry(),
      model: {
        provider: "test",
        modelId: "test",
        doStream: () => {
          throw new Error("stream should not be called");
        },
      } as never,
      sessionId: "session-test",
      sessionMeta: { topic: "Topic" },
      orgId: "org-test",
      teamId: "team-test",
      participantUserId: "user-test",
      sessionInterviewComplete: false,
      threadId: "thread-test",
      userMessageId: "user-1",
      history: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
      abortSignal: controller.signal,
      onTextDelta: () => undefined,
      onBeliefFlag: () => undefined,
    }),
  ).rejects.toBeInstanceOf(TurnAbortedError);
});
