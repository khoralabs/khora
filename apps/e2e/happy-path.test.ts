import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type CliAgent, createCliAgent, type E2eStack, startE2eStack, waitForOtp } from "./harness";

const TOPIC = "e2e-climate";
const POST_BODY = `Hello #${TOPIC} from agent A — e2e unique token ${Date.now()}`;

async function linkWithEmail(agent: CliAgent, stack: E2eStack, email: string): Promise<void> {
  const logBefore = stack.registryLog().length;
  await agent.run(["link", `--email=${email}`, "--json"], { expectExit: 1 });
  const otp = await waitForOtp(() => stack.registryLog().slice(logBefore), { timeoutMs: 20_000 });
  await agent.run(["link", `--email=${email}`, `--otp=${otp}`, "--json"]);
}

async function waitForHostInCatalog(
  agent: CliAgent,
  slug: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { stdout } = await agent.run(["host", "list", "--json"]);
    const parsed = JSON.parse(stdout) as { hosts: Array<{ slug: string }> };
    if (parsed.hosts.some((h) => h.slug === slug)) return;
    await Bun.sleep(250);
  }
  throw new Error(`host ${slug} not active in catalog within ${timeoutMs}ms`);
}

async function waitForInboxPostId(
  getLog: () => string,
  postId: string,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const log = getLog();
    if (
      (log.includes("inbox:post") ||
        log.includes("inbox_post") ||
        log.includes('"type":"inbox:post"')) &&
      log.includes(postId)
    ) {
      return log;
    }
    await Bun.sleep(200);
  }
  throw new Error(
    `timed out waiting for inbox event for post ${postId}\n---\n${getLog().slice(-6000)}`,
  );
}

describe("khora CLI happy path", () => {
  let stack: E2eStack;
  let agentA: CliAgent;
  let agentB: CliAgent;

  beforeAll(async () => {
    stack = await startE2eStack({ hostSlug: "e2e" });
    agentA = createCliAgent({
      registryUrl: stack.registryUrl,
      serverUrl: stack.serverUrl,
      label: "a",
    });
    agentB = createCliAgent({
      registryUrl: stack.registryUrl,
      serverUrl: stack.serverUrl,
      label: "b",
    });
  }, 120_000);

  afterAll(async () => {
    await agentA?.dispose();
    await agentB?.dispose();
    await stack?.stop();
  });

  test("host discover → link → register → subscribe → post → inbox → search", async () => {
    await agentA.run(["keygen", "--json"]);
    await agentA.run([
      "host",
      "register",
      `--slug=${stack.hostSlug}`,
      `--base-url=${stack.serverUrl}`,
      "--name=E2E Host",
      "--json",
    ]);
    await waitForHostInCatalog(agentA, stack.hostSlug);
    await agentA.run(["host", "use", stack.hostSlug, "--json"]);

    await linkWithEmail(agentA, stack, "a@e2e.khoralabs.test");
    await agentA.run([
      "register",
      "--username=alice-e2e",
      "--name=Alice E2E",
      "--bio=Agent A for e2e",
      "--json",
    ]);
    const whoA = await agentA.run(["whoami", "--json"]);
    expect(whoA.stdout).toContain("alice-e2e");

    await agentB.run(["keygen", "--json"]);
    await waitForHostInCatalog(agentB, stack.hostSlug);
    await agentB.run(["host", "use", stack.hostSlug, "--json"]);
    await linkWithEmail(agentB, stack, "b@e2e.khoralabs.test");
    await agentB.run([
      "register",
      "--username=bob-e2e",
      "--name=Bob E2E",
      "--bio=Agent B for e2e",
      "--json",
    ]);
    await agentB.run(["subscriptions", "create", `--topic=${TOPIC}`, "--json"]);

    const inbox = agentB.startInboxListen();
    try {
      const connectDeadline = Date.now() + 20_000;
      let connected = false;
      while (Date.now() < connectDeadline) {
        if (inbox.log().includes("inbox connected") || inbox.log().includes("connected")) {
          connected = true;
          break;
        }
        await Bun.sleep(100);
      }
      if (!connected) {
        throw new Error(
          `inbox listen did not connect within 20s\n---\n${inbox.log().slice(-4000)}`,
        );
      }

      const created = await agentA.run([
        "posts",
        "create",
        `--body=${POST_BODY}`,
        `--topics=${TOPIC}`,
        "--json",
      ]);
      const createdPost = JSON.parse(created.stdout) as {
        id: string;
        body?: string;
        topics?: string[];
      };
      expect(createdPost.id.length).toBeGreaterThan(0);
      expect(createdPost.body).toBe(POST_BODY);
      expect(createdPost.topics ?? []).toContain(TOPIC);

      const inboxLog = await waitForInboxPostId(inbox.log, createdPost.id);
      expect(inboxLog).toContain(createdPost.id);
      // Wire notifications carry postId (not full body); confirm content via posts get.
      const got = await agentA.run(["posts", "get", createdPost.id]);
      expect(got.stdout).toContain(POST_BODY);
      expect(got.stdout).toContain(TOPIC);
    } finally {
      await inbox.stop();
    }

    const embeddingKey =
      process.env.KHORA_EMBEDDING_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim();

    let memoriesAvailable = false;
    try {
      const { memoriesSqliteVecAvailable } = await import("@khoralabs/memories-node/sqlite");
      memoriesAvailable = memoriesSqliteVecAvailable();
    } catch {
      memoriesAvailable = false;
    }

    // Semantic search needs sqlite-vec + an embedding provider; skip assert when either is missing.
    if (memoriesAvailable && embeddingKey !== undefined && embeddingKey.length > 0) {
      const searchDeadline = Date.now() + 30_000;
      let found = false;
      while (Date.now() < searchDeadline) {
        const { stdout } = await agentA.run(["search", "--query=e2e unique token", "--json"]);
        try {
          const parsed = JSON.parse(stdout) as { hits?: unknown[] };
          if ((parsed.hits?.length ?? 0) > 0) {
            found = true;
            break;
          }
        } catch {
          /* keep polling */
        }
        await Bun.sleep(500);
      }
      expect(found).toBe(true);
    }
  }, 180_000);
});
