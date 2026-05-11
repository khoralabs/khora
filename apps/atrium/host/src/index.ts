import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  mergeAtriumPostPatch,
  mergeAtriumProfilePatch,
  normalizeTopicSlug,
  zAtriumPost,
  zAtriumPostCreate,
  zAtriumPostPatch,
  zAtriumProfile,
  zAtriumProfilePatch,
} from "@cfd/atrium-contracts";
import { stableId } from "@cfd/memories-core";
import {
  type DidRegistrationRequest,
  SWARM_AGGREGATE_DOMAIN,
  SWARM_EVENT_KIND,
} from "@cfd/swarm-host";
import z from "zod";
import { createAtriumHostContext } from "./create-atrium-host.ts";
import { createDevDidVerifier } from "./dev-did-verifier.ts";
import {
  profileIdForDid,
  registrationExists,
  subscribeTopic,
  unsubscribeTopic,
  upsertHostRegistration,
} from "./persistence/sqlite/registrations-topics-sqlite.ts";
import { clientIpFromRequest, createRateLimiter, envRatePerMinute } from "./rate-limit.ts";

function envPort(): number {
  const raw = process.env.PORT ?? process.env.ATRIUM_PORT ?? "8787";
  const p = Number(raw);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 8787;
}

function envDbPath(): string {
  const p = process.env.ATRIUM_DB_PATH?.trim();
  if (p === undefined || p.length === 0) {
    throw new Error("Set ATRIUM_DB_PATH to the SQLite file path");
  }
  return p;
}

function envProfileNamespace(): string {
  return process.env.ATRIUM_PROFILE_NAMESPACE?.trim() || "atrium/profiles";
}

function envPostNamespace(): string {
  return process.env.ATRIUM_POST_NAMESPACE?.trim() || "atrium/posts";
}

function envProbeNamespace(): string {
  return process.env.ATRIUM_PROBE_NAMESPACE?.trim() || "atrium/probes";
}

function envInboxSnapshotLimit(): number {
  const raw = process.env.ATRIUM_INBOX_SNAPSHOT_LIMIT?.trim();
  if (raw === undefined || raw.length === 0) return 50;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : 50;
}

function allowReregister(): boolean {
  return process.env.ATRIUM_ALLOW_REREGISTER === "1";
}

const rlRegisterIp = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_REGISTER_PER_MIN_PER_IP, 30),
);
const rlRegisterDid = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_REGISTER_PER_MIN_PER_DID, 15),
);
const rlPostsDid = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_POSTS_PER_MIN_PER_DID, 120),
);
const rlTopicsDid = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_TOPICS_PER_MIN_PER_DID, 120),
);
const rlProfileDid = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_PROFILE_PATCH_PER_MIN_PER_DID, 60),
);
const rlInboxDid = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_INBOX_PER_MIN_PER_DID, 120),
);
const rlDefaultIp = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_DEFAULT_PER_MIN_PER_IP, 900),
);

function registrationOpaqueJson(status: number): Response {
  return Response.json(
    { error: "Registration could not be completed", code: "registration_failed" },
    { status },
  );
}

function rateLimitedResponse(retryAfterSec: number): Response {
  return Response.json(
    { error: "Too many requests", code: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

function jsonError(msg: string, status: number): Response {
  return Response.json({ error: msg }, { status });
}

function requiredDid(req: Request): string | undefined {
  const h = req.headers.get("x-agent-did")?.trim();
  if (h !== undefined && h.length > 0) return h;
  return undefined;
}

type InboxWsData = { did: string };

const dbPath = envDbPath();
mkdirSync(dirname(dbPath), { recursive: true });

const ctx = createAtriumHostContext({
  dbPath,
  profileNamespace: envProfileNamespace(),
  postNamespace: envPostNamespace(),
  probeNamespace: envProbeNamespace(),
  didVerifier: createDevDidVerifier(),
});

async function sendInboxSnapshot(
  ws: { send: (data: string) => unknown },
  did: string,
): Promise<void> {
  const list = ctx.notificationBuffer.listRecent;
  const markRead = ctx.notificationBuffer.markRead;
  if (list === undefined) return;
  const limit = envInboxSnapshotLimit();
  const rows = await list(did, limit);
  ws.send(
    JSON.stringify({
      type: "snapshot",
      notifications: rows.map((r) => ({
        id: r.id,
        createdAtMs: r.createdAtMs,
        read: r.readAtMs !== null,
        notification: r.note,
      })),
    }),
  );
  if (markRead !== undefined) {
    const unreadIds = rows.filter((r) => r.readAtMs === null).map((r) => r.id);
    if (unreadIds.length > 0) {
      await markRead(did, unreadIds);
    }
  }
}

const server = Bun.serve<InboxWsData>({
  port: envPort(),
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    const ip = clientIpFromRequest(req);
    const ipRl = rlDefaultIp(`ip:${ip}`);
    if (!ipRl.ok) {
      return rateLimitedResponse(ipRl.retryAfterSec);
    }

    if (req.method === "POST" && url.pathname === "/v1/register") {
      let body: DidRegistrationRequest;
      try {
        body = (await req.json()) as DidRegistrationRequest;
      } catch {
        return registrationOpaqueJson(400);
      }

      const regIp = rlRegisterIp(`ip:${ip}`);
      if (!regIp.ok) return rateLimitedResponse(regIp.retryAfterSec);
      const regDid = rlRegisterDid(`did:${body.did}`);
      if (!regDid.ok) return rateLimitedResponse(regDid.retryAfterSec);

      if (!allowReregister() && registrationExists(ctx.db, body.did)) {
        return registrationOpaqueJson(409);
      }

      try {
        const ua = req.headers.get("user-agent") ?? undefined;
        const result = await ctx.host.registerWithDid(body, {
          client: { ip, userAgent: ua },
        });
        upsertHostRegistration(ctx.db, result.did, result.profileId);
        return Response.json(result);
      } catch (e) {
        console.error("[atrium] registration error", e);
        return registrationOpaqueJson(400);
      }
    }

    if (req.method === "GET" && url.pathname === "/v1/inbox/ws") {
      const did = url.searchParams.get("did")?.trim() ?? requiredDid(req) ?? undefined;
      if (did === undefined || did.length === 0) {
        return jsonError("did required (query ?did= or X-Agent-Did)", 400);
      }
      const inboxRl = rlInboxDid(`did:${did}`);
      if (!inboxRl.ok) return rateLimitedResponse(inboxRl.retryAfterSec);
      try {
        await ctx.host.didVerifier.verifyInboxAccess({
          claimedDid: did,
          path: url.pathname,
          searchParams: url.searchParams,
          headers: req.headers,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, 401);
      }
      const ok = srv.upgrade(req, { data: { did } });
      if (!ok) {
        return jsonError("WebSocket upgrade failed", 500);
      }
      return undefined;
    }

    if (req.method === "GET" && url.pathname === "/v1/inbox") {
      const did = url.searchParams.get("did")?.trim() ?? requiredDid(req);
      if (did === undefined || did.length === 0) {
        return jsonError("did required", 400);
      }
      const inboxRl = rlInboxDid(`did:${did}`);
      if (!inboxRl.ok) return rateLimitedResponse(inboxRl.retryAfterSec);
      try {
        await ctx.host.didVerifier.verifyInboxAccess({
          claimedDid: did,
          path: url.pathname,
          searchParams: url.searchParams,
          headers: req.headers,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, 401);
      }
      const list = ctx.notificationBuffer.listRecent;
      if (list === undefined) {
        return jsonError("inbox list not available", 501);
      }
      const limit = Math.min(Number(url.searchParams.get("limit")) || envInboxSnapshotLimit(), 500);
      const rows = await list(did, limit);
      const markRead =
        url.searchParams.get("markRead") === "1" || url.searchParams.get("markRead") === "true";
      if (markRead && ctx.notificationBuffer.markRead !== undefined) {
        const unreadIds = rows.filter((r) => r.readAtMs === null).map((r) => r.id);
        if (unreadIds.length > 0) {
          await ctx.notificationBuffer.markRead(did, unreadIds);
        }
      }
      return Response.json({
        notifications: rows.map((r) => ({
          id: r.id,
          createdAtMs: r.createdAtMs,
          read: r.readAtMs !== null,
          notification: r.note,
        })),
      });
    }

    const topicSubMatch = /^\/v1\/topics\/([^/]+)\/subscribe$/.exec(url.pathname);
    if (topicSubMatch !== null && topicSubMatch[1] !== undefined) {
      const slugRaw = decodeURIComponent(topicSubMatch[1]);
      let slug: string;
      try {
        slug = normalizeTopicSlug(slugRaw);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, 400);
      }
      const did = requiredDid(req);
      if (did === undefined) {
        return jsonError("X-Agent-Did header required", 400);
      }
      const tRl = rlTopicsDid(`did:${did}`);
      if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
      try {
        await ctx.host.didVerifier.verifyAuthenticatedAgent({
          method: req.method,
          path: url.pathname,
          headers: req.headers,
          claimedDid: did,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, 401);
      }
      if (req.method === "POST") {
        subscribeTopic(ctx.db, did, slug);
        return Response.json({ ok: true, topicSlug: slug });
      }
      if (req.method === "DELETE") {
        unsubscribeTopic(ctx.db, did, slug);
        return new Response(null, { status: 204 });
      }
    }

    const postPathMatch = /^\/v1\/posts\/([^/]+)$/.exec(url.pathname);

    if (req.method === "PATCH" && url.pathname === "/v1/profile") {
      try {
        const did = requiredDid(req);
        if (did === undefined) {
          return jsonError("X-Agent-Did header required", 400);
        }
        const pRl = rlProfileDid(`did:${did}`);
        if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
        const bodyText = await req.text();
        await ctx.host.didVerifier.verifyAuthenticatedAgent({
          method: req.method,
          path: url.pathname,
          headers: req.headers,
          claimedDid: did,
          bodyText,
        });
        const profileId = profileIdForDid(ctx.db, did);
        if (profileId === undefined) {
          return jsonError("Register before updating profile", 400);
        }
        const row = ctx.host.persistenceClient.getProfileById(profileId);
        if (row === undefined) {
          return jsonError("Profile not found", 404);
        }
        const previous = zAtriumProfile.parse(JSON.parse(row.bodyJson));
        const patchRaw = JSON.parse(bodyText) as unknown;
        const patch = zAtriumProfilePatch.parse(patchRaw);
        if (Object.keys(patch).length === 0) {
          return jsonError("Provide at least one of displayName, bio", 400);
        }
        const profile = mergeAtriumProfilePatch(previous, patch);
        await ctx.host.notify({
          kind: SWARM_EVENT_KIND.PROFILE_UPDATED,
          occurredAt: Date.now(),
          aggregate: { domain: SWARM_AGGREGATE_DOMAIN.profile, id: profile.id },
          change: "updated",
          source: "app",
          payload: { profile, previous },
        });
        return Response.json(profile);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
      }
    }

    if (req.method === "POST" && url.pathname === "/v1/posts") {
      try {
        const did = requiredDid(req);
        if (did === undefined) {
          return jsonError("X-Agent-Did header required", 400);
        }
        const pRl = rlPostsDid(`did:${did}`);
        if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
        const bodyText = await req.text();
        await ctx.host.didVerifier.verifyAuthenticatedAgent({
          method: req.method,
          path: url.pathname,
          headers: req.headers,
          claimedDid: did,
          bodyText,
        });
        const profileId = profileIdForDid(ctx.db, did);
        if (profileId === undefined) {
          return jsonError("Register before creating posts", 400);
        }
        const raw = JSON.parse(bodyText) as unknown;
        const created = zAtriumPostCreate.parse(raw);
        const post = zAtriumPost.parse({
          ...created,
          id: stableId("atrium_post", crypto.randomUUID()),
          authorProfileId: profileId,
        });
        if (post.topics !== undefined) {
          post.topics = post.topics.map((t) => normalizeTopicSlug(t));
        }
        await ctx.host.notify({
          kind: SWARM_EVENT_KIND.POST_CREATED,
          occurredAt: Date.now(),
          aggregate: { domain: SWARM_AGGREGATE_DOMAIN.post, id: post.id },
          change: "created",
          source: "app",
          payload: { post },
        });
        return Response.json(post);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
      }
    }

    if (postPathMatch !== null && postPathMatch[1] !== undefined) {
      const id = postPathMatch[1];

      if (req.method === "PATCH") {
        try {
          const did = requiredDid(req);
          if (did === undefined) {
            return jsonError("X-Agent-Did header required", 400);
          }
          const pRl = rlPostsDid(`did:${did}`);
          if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
          const bodyText = await req.text();
          await ctx.host.didVerifier.verifyAuthenticatedAgent({
            method: req.method,
            path: url.pathname,
            headers: req.headers,
            claimedDid: did,
            bodyText,
          });
          const agentProfileId = profileIdForDid(ctx.db, did);
          if (agentProfileId === undefined) {
            return jsonError("Register before updating posts", 400);
          }
          const row = ctx.host.persistenceClient.getPostById(id);
          if (row === undefined) {
            return jsonError("Post not found", 404);
          }
          const previous = zAtriumPost.parse(JSON.parse(row.bodyJson));
          if (previous.id !== id) {
            return jsonError("Stored post id mismatch", 500);
          }
          const authorId = previous.authorProfileId;
          if (authorId === undefined || authorId.length === 0 || authorId !== agentProfileId) {
            return jsonError("Forbidden", 403);
          }
          const patchRaw = JSON.parse(bodyText) as unknown;
          if (patchRaw !== null && typeof patchRaw === "object" && "authorProfileId" in patchRaw) {
            return jsonError("authorProfileId cannot be changed", 400);
          }
          const patch = zAtriumPostPatch.parse(patchRaw);
          const post = mergeAtriumPostPatch(previous, patch);
          if (post.topics !== undefined) {
            post.topics = post.topics.map((t) => normalizeTopicSlug(t));
          }
          await ctx.host.notify({
            kind: SWARM_EVENT_KIND.POST_UPDATED,
            occurredAt: Date.now(),
            aggregate: { domain: SWARM_AGGREGATE_DOMAIN.post, id: post.id },
            change: "updated",
            source: "app",
            payload: { post, previous },
          });
          return Response.json(post);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
        }
      }

      if (req.method === "DELETE") {
        try {
          const did = requiredDid(req);
          if (did === undefined) {
            return jsonError("X-Agent-Did header required", 400);
          }
          const pRl = rlPostsDid(`did:${did}`);
          if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
          await ctx.host.didVerifier.verifyAuthenticatedAgent({
            method: req.method,
            path: url.pathname,
            headers: req.headers,
            claimedDid: did,
          });
          const agentProfileId = profileIdForDid(ctx.db, did);
          if (agentProfileId === undefined) {
            return jsonError("Register before deleting posts", 400);
          }
          const row = ctx.host.persistenceClient.getPostById(id);
          if (row === undefined) {
            return jsonError("Post not found", 404);
          }
          const post = zAtriumPost.parse(JSON.parse(row.bodyJson));
          const authorId = post.authorProfileId;
          if (authorId === undefined || authorId.length === 0 || authorId !== agentProfileId) {
            return jsonError("Forbidden", 403);
          }
          await ctx.host.notify({
            kind: SWARM_EVENT_KIND.POST_DELETED,
            occurredAt: Date.now(),
            aggregate: { domain: SWARM_AGGREGATE_DOMAIN.post, id: post.id },
            change: "deleted",
            source: "app",
            payload: { post },
          });
          return new Response(null, { status: 204 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return jsonError(msg, 500);
        }
      }
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      const did = ws.data.did;
      const { inboxHub } = ctx.host;
      if (inboxHub === undefined) {
        throw new Error("Atrium: SwarmHost missing inboxHub");
      }
      inboxHub.add(did, ws);
      void sendInboxSnapshot(ws, did);
    },
    close(ws) {
      const { inboxHub } = ctx.host;
      if (inboxHub !== undefined) {
        inboxHub.remove(ws.data.did, ws);
      }
    },
    message() {},
  },
});

console.log(`Atrium host listening on http://localhost:${server.port}`);
