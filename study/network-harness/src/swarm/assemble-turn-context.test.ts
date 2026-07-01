import { expect, test } from "bun:test";

import { generateAgentIdentity } from "@khoralabs/agent-persisted-signer";

import { createSignedChatService } from "../chat.ts";
import { assembleTurnContext } from "./assemble-turn-context.ts";
import { InboxBuffer } from "./inbox-buffer.ts";
import type { AgentLoopState, SwarmConfig } from "./types.ts";

async function createChatFixture() {
  const dataDir = `/tmp/swarm-assemble-${process.pid}-${crypto.randomUUID()}`;
  const signer = await generateAgentIdentity();
  const signers = new Map([[signer.did, signer]]);
  const backend = createSignedChatService(dataDir, {
    resolveSigner: (did) => Promise.resolve(signers.get(did)),
  });
  const client = backend.forAgent(signer.did);
  const thread = await client.createThread({
    id: `${signer.did}-self`,
    metadata: { kind: "self" },
  });
  await client.sendMessage(thread.id, { text: "prior self note", role: "user" });
  return { client, signer, threadId: thread.id };
}

test("assembleTurnContext builds self-thread messages and instruction blocks", async () => {
  const { client, signer, threadId } = await createChatFixture();
  const inboxBuffer = new InboxBuffer();
  inboxBuffer.push(signer.did, {
    type: "inbox:notification",
    id: 1,
    did: signer.did,
    notification: {
      kind: "inbox_post",
      payload: {
        postId: "atp0:test-post",
        postKind: "post",
        subscriptionMatches: [{ subscriptionId: "sub-1", score: 1 }],
      },
    },
  });

  const config: SwarmConfig = {
    sessionId: "session-1",
    dataDir: "/tmp/unused",
    goal: "Coordinate",
    agentCount: 1,
    maxTokenBudget: 1000,
    contextMessageLimit: 5,
    model: { id: "test-model", maxSteps: 2 },
    roles: ["researcher"],
  };

  const agent: AgentLoopState = {
    did: signer.did,
    agentId: signer.did,
    role: "researcher",
    selfThreadId: threadId,
    registeredStaticHash: "hash",
    turnCount: 0,
  };

  const { params, inboxEntryIds } = await assembleTurnContext({
    config,
    agent,
    agentChat: client,
    inboxBuffer,
  });

  expect(params.output.chat.threadId).toBe(threadId);
  expect(params.context.messages.length).toBeGreaterThan(0);
  expect(params.context.instructions?.some((block) => block.includes("<inbox_entries>"))).toBe(
    true,
  );
  expect(
    params.context.instructions?.some((block) => block.includes(`<thread id="${threadId}">`)),
  ).toBe(true);
  expect(inboxEntryIds).toHaveLength(1);
});
