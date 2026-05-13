import { describe, expect, mock, test } from "bun:test";
import { zAtriumPost } from "@khoralabs/atrium-contracts";
import type { AgentNotification, InboxPostReason, SwarmHostEventHandlerCtx } from "@khoralabs/swarm-host";
import { swarmHostOntology } from "@khoralabs/swarm-host";
import { fanOutPostMatches } from "./atrium-post-fanout.ts";
import type { AtriumHostAppContext } from "./atrium-app-context.ts";
import type { ProbeSubscribersRepo } from "./persistence/sqlite/index.ts";
import {
  authorSubscriptionSubject,
  authorTopicSubscriptionSubject,
  topicSubscriptionSubject,
} from "./subject-keys.ts";

type TNode = typeof swarmHostOntology.nodeLabels;
type TEdge = typeof swarmHostOntology.edgeLabels;
type FanoutCtx = SwarmHostEventHandlerCtx<TNode, TEdge> & {
  _enqueued: Array<{ did: string; note: AgentNotification }>;
};

const emptyProbeRepo: ProbeSubscribersRepo = {
  upsert: () => {},
  delete: () => {},
  listActive: () => [],
};

function makeSubjectRepo() {
  const subjectSubscriptions = new Map<string, Set<string>>();
  return {
    subscribe(did: string, subject: string) {
      let set = subjectSubscriptions.get(subject);
      if (set === undefined) {
        set = new Set();
        subjectSubscriptions.set(subject, set);
      }
      set.add(did);
    },
    subscriberDidsForSubject(subject: string, exclude?: string) {
      const set = subjectSubscriptions.get(subject);
      if (set === undefined) return [];
      return [...set].filter((d) => d !== exclude);
    },
  };
}

function makeCtx(params: {
  repo: ReturnType<typeof makeSubjectRepo>;
  authorDid: string;
  authorProfileId: string;
}): FanoutCtx {
  const enqueued: Array<{ did: string; note: AgentNotification }> = [];
  const buffer = {
    enqueue: mock(async (did: string, note: AgentNotification) => {
      enqueued.push({ did, note });
      return enqueued.length;
    }),
    markRead: mock(async () => {}),
  };
  const hub = {
    broadcast: mock(() => {}),
    listenerCount: mock(() => 0),
  };
  return {
    notificationBuffer: buffer,
    inboxHub: hub,
    _enqueued: enqueued,
    persistence: {
      agentRegistrations: {
        didForProfileId: (pid: string) => (pid === params.authorProfileId ? params.authorDid : undefined),
      },
      agentSubjectSubscriptions: {
        subscriberDidsForSubject: (subject: string, exclude?: string) =>
          params.repo.subscriberDidsForSubject(subject, exclude),
      },
    },
    appContext: {} as AtriumHostAppContext,
    memories: {} as never,
    persistenceClient: {} as never,
    search: async () => [],
    searchMemories: async () => [],
  } as unknown as FanoutCtx;
}

describe("fanOutPostMatches", () => {
  test("author_topic subscription yields one inbox_post with author_topic reason", async () => {
    const authorDid = "did:key:author";
    const subscriberDid = "did:key:sub";
    const repo = makeSubjectRepo();
    repo.subscribe(subscriberDid, authorTopicSubscriptionSubject(authorDid, "rust-dev"));
    const ctx = makeCtx({
      repo,
      authorDid,
      authorProfileId: "prof-1",
    });
    const post = zAtriumPost.parse({
      id: "p1",
      kind: "post",
      authorProfileId: "prof-1",
      title: "Hi",
      body: "x",
      topics: ["rust-dev"],
    });
    await fanOutPostMatches({
      ctx,
      probeSubscribers: emptyProbeRepo,
      post,
    });
    expect(ctx._enqueued).toHaveLength(1);
    expect(ctx._enqueued[0]?.did).toBe(subscriberDid);
    expect(ctx._enqueued[0]?.note).toEqual({
      kind: "inbox_post",
      payload: {
        postId: "p1",
        postKind: "post",
        authorDid,
        reasons: [{ kind: "author_topic", authorDid, topic: "rust-dev" }],
      },
    });
  });

  test("author_topic without matching topic on post does not notify", async () => {
    const authorDid = "did:key:author";
    const repo = makeSubjectRepo();
    repo.subscribe("did:key:sub", authorTopicSubscriptionSubject(authorDid, "rust-dev"));
    const ctx = makeCtx({ repo, authorDid, authorProfileId: "prof-1" });
    const post = zAtriumPost.parse({
      id: "p2",
      kind: "post",
      authorProfileId: "prof-1",
      title: "Hi",
      body: "x",
      topics: ["zig-only"],
    });
    await fanOutPostMatches({
      ctx,
      probeSubscribers: emptyProbeRepo,
      post,
    });
    expect(ctx._enqueued).toHaveLength(0);
  });

  test("author + topic + author_topic merge to one notification with three reasons", async () => {
    const authorDid = "did:key:author";
    const subscriberDid = "did:key:sub";
    const repo = makeSubjectRepo();
    repo.subscribe(subscriberDid, topicSubscriptionSubject("rust-dev"));
    repo.subscribe(subscriberDid, authorSubscriptionSubject(authorDid));
    repo.subscribe(subscriberDid, authorTopicSubscriptionSubject(authorDid, "rust-dev"));
    const ctx = makeCtx({ repo, authorDid, authorProfileId: "prof-1" });
    const post = zAtriumPost.parse({
      id: "p3",
      kind: "post",
      authorProfileId: "prof-1",
      title: "Hi",
      body: "x",
      topics: ["rust-dev"],
    });
    await fanOutPostMatches({
      ctx,
      probeSubscribers: emptyProbeRepo,
      post,
    });
    expect(ctx._enqueued).toHaveLength(1);
    const note = ctx._enqueued[0]?.note;
    expect(note?.kind).toBe("inbox_post");
    if (note?.kind !== "inbox_post") throw new Error("expected inbox_post");
    const reasons = note.payload.reasons;
    expect(reasons).toHaveLength(3);
    const kinds = new Set(reasons.map((r: InboxPostReason) => r.kind));
    expect(kinds).toEqual(new Set(["topic", "author_topic", "author"]));
  });
});
