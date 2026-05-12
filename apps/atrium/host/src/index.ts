import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AuthError, createAtriumDidAuth } from "@khoralabs/atrium-auth";
import {
  type AtriumProfile,
  mergeAtriumPostPatch,
  mergeAtriumProfilePatch,
  normalizeTopicSlug,
  normalizeUsername,
  zAgentStatusResponse,
  zAtriumInviteListResponse,
  zAtriumInvitePreviewResponse,
  zAtriumPost,
  zAtriumPostCreate,
  zAtriumPostPatch,
  zAtriumProfile,
  zAtriumProfilePatch,
  zAtriumRegistrationRequestBody,
} from "@khoralabs/atrium-contracts";
import { stableId } from "@khoralabs/memories-core";
import {
  type DidRegistrationRequest,
  SWARM_AGGREGATE_DOMAIN,
  SWARM_EVENT_KIND,
} from "@khoralabs/swarm-host";
import z from "zod";
import { deleteOtherStatusPostsForAuthor } from "./atrium-status-posts.ts";
import { createAtriumHostContext } from "./create-atrium-host.ts";
import {
  type AtriumInvitesRepo,
  createAtriumInvitesRepo,
  inviteRequiredFromEnv,
  invitesPerRegistrationFromEnv,
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "./invites/index.ts";
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

function envAgentSyncProbeLimit(): number {
  const raw = process.env.ATRIUM_AGENT_SYNC_PROBE_LIMIT?.trim();
  if (raw === undefined || raw.length === 0) return 500;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : 500;
}

/** Parse a non-negative integer ms interval from env. Empty/invalid → undefined (use default). */
function envIntervalMs(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
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
const rlAgentSyncDid = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_AGENT_SYNC_PER_MIN_PER_DID, 60),
);
const rlInboxDid = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_INBOX_PER_MIN_PER_DID, 120),
);
const rlDefaultIp = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_DEFAULT_PER_MIN_PER_IP, 900),
);
const rlInvitePreviewIp = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_INVITE_PREVIEW_PER_MIN_PER_IP, 30),
);
const rlInvitesListDid = createRateLimiter(
  envRatePerMinute(process.env.ATRIUM_RL_INVITES_LIST_PER_MIN_PER_DID, 60),
);

function registrationOpaqueJson(status: number): Response {
  return Response.json(
    { error: "Registration could not be completed", code: "registration_failed" },
    { status },
  );
}

function inviteOpaqueNotFound(): Response {
  return Response.json(
    { error: "Invite could not be found", code: "invite_invalid" },
    { status: 404 },
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

const zAgentSyncResponse = z.object({
  profile: zAtriumProfile,
  topicSlugs: z.array(z.string()),
  probes: z.array(zAtriumPost),
});

function authErrorResponse(e: unknown): Response {
  if (e instanceof AuthError) return jsonError(e.message, e.status);
  return jsonError(e instanceof Error ? e.message : String(e), 401);
}

type InboxWsData = { did: string };

const dbPath = envDbPath();
mkdirSync(dirname(dbPath), { recursive: true });

const walIntervalMs = envIntervalMs("ATRIUM_SQLITE_WAL_CHECKPOINT_INTERVAL_MS");
const analyzeIntervalMs = envIntervalMs("ATRIUM_SQLITE_ANALYZE_INTERVAL_MS");

const ctx = createAtriumHostContext({
  dbPath,
  profileNamespace: envProfileNamespace(),
  postNamespace: envPostNamespace(),
  probeNamespace: envProbeNamespace(),
  auth: (db) => createAtriumDidAuth({ db }),
  sqliteMaintenance: {
    ...(walIntervalMs !== undefined ? { walCheckpointIntervalMs: walIntervalMs } : {}),
    ...(analyzeIntervalMs !== undefined ? { analyzeIntervalMs } : {}),
  },
});

const seedInviteTokens = parseInviteSeedTokens(process.env.ATRIUM_INVITE_SEED_TOKENS);
validateInviteEnvConfig(seedInviteTokens);
const invitePepper = readInvitePepper();
const invitesRepo: AtriumInvitesRepo | undefined =
  invitePepper !== undefined ? createAtriumInvitesRepo(ctx.db, invitePepper) : undefined;
if (invitesRepo !== undefined) {
  invitesRepo.insertSeedInviteTokens(seedInviteTokens);
  const rootPlain = invitesRepo.ensureRootInviteIfAbsent();
  if (rootPlain !== undefined) {
    console.warn(
      `[atrium] Root invite token (single use; save this; not shown again): ${rootPlain}`,
    );
  }
}

const zInvitePreviewBody = z.object({
  token: z.string().trim().min(1),
});

function loadPublicProfileForDid(did: string): AtriumProfile | null {
  const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
  if (profileId === undefined) return null;
  const row = ctx.host.persistenceClient.getProfileById(profileId);
  if (row === undefined) return null;
  const parsed = zAtriumProfile.safeParse(JSON.parse(row.bodyJson));
  return parsed.success ? parsed.data : null;
}

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
      const bodyText = await req.text();
      let raw: unknown;
      try {
        raw = JSON.parse(bodyText);
      } catch {
        return registrationOpaqueJson(400);
      }
      const parsedBody = zAtriumRegistrationRequestBody.safeParse(raw);
      if (!parsedBody.success) {
        return registrationOpaqueJson(400);
      }
      const bodyFull = parsedBody.data;
      const swarmReq: DidRegistrationRequest = {
        did: bodyFull.did,
        ...(bodyFull.metadata !== undefined ? { metadata: bodyFull.metadata } : {}),
        ...(bodyFull.correlationId !== undefined ? { correlationId: bodyFull.correlationId } : {}),
      };

      const regIp = rlRegisterIp(`ip:${ip}`);
      if (!regIp.ok) return rateLimitedResponse(regIp.retryAfterSec);
      const regDid = rlRegisterDid(`did:${swarmReq.did}`);
      if (!regDid.ok) return rateLimitedResponse(regDid.retryAfterSec);

      if (!allowReregister() && ctx.host.persistenceClient.agentRegistrationExists(swarmReq.did)) {
        return registrationOpaqueJson(409);
      }

      const skipInvites = ctx.host.persistenceClient.agentRegistrationExists(swarmReq.did);
      const inviteTokenRaw = bodyFull.inviteToken?.trim();
      const inviteTokenPresent = inviteTokenRaw !== undefined && inviteTokenRaw.length > 0;

      let consumedInvitePlain: string | undefined;
      if (!skipInvites) {
        if (inviteRequiredFromEnv()) {
          if (!inviteTokenPresent || invitesRepo === undefined) {
            return registrationOpaqueJson(400);
          }
        }
        if (inviteTokenPresent && invitesRepo === undefined) {
          return registrationOpaqueJson(400);
        }
        if (inviteTokenPresent && invitesRepo !== undefined) {
          if (!invitesRepo.tryConsumeInviteToken(inviteTokenRaw, swarmReq.did)) {
            return registrationOpaqueJson(400);
          }
          consumedInvitePlain = inviteTokenRaw;
        }
      }

      // Snapshot the pre-existing username (if any) so we can roll back on failure without
      // stranding a returning DID's reservation under `ATRIUM_ALLOW_REREGISTER=1`.
      const priorUsername = ctx.usernamesRepo.lookupByDid(swarmReq.did)?.username;

      try {
        const ua = req.headers.get("user-agent") ?? undefined;
        const result = await ctx.host.registerWithDid(swarmReq, {
          headers: req.headers,
          bodyText,
          client: { ip, userAgent: ua },
        });
        ctx.host.persistenceClient.upsertAgentRegistration(result.did, result.profileId);
        let inviteTokens: string[] | undefined;
        if (!skipInvites && consumedInvitePlain !== undefined && invitesRepo !== undefined) {
          inviteTokens = invitesRepo.mintStandardInviteTokens(
            swarmReq.did,
            invitesPerRegistrationFromEnv(),
          );
        }
        return Response.json(inviteTokens !== undefined ? { ...result, inviteTokens } : result);
      } catch (e) {
        if (consumedInvitePlain !== undefined && invitesRepo !== undefined) {
          invitesRepo.rollbackInviteConsumption(consumedInvitePlain, swarmReq.did);
        }
        const msg = e instanceof Error ? e.message : String(e);
        const usernameTaken = msg.includes("USERNAME_TAKEN");
        if (!usernameTaken) {
          // Reservation may have been performed by the build handler before the later failure.
          // Restore the prior name (re-register path) or release entirely (new registration).
          const current = ctx.usernamesRepo.lookupByDid(swarmReq.did);
          if (priorUsername === undefined) {
            ctx.usernamesRepo.release(swarmReq.did);
          } else if (current !== undefined && current.username !== priorUsername) {
            ctx.usernamesRepo.rename(swarmReq.did, priorUsername);
          }
        }
        if (usernameTaken) {
          return Response.json(
            { error: "Username is already taken", code: "username_taken" },
            { status: 409 },
          );
        }
        console.error("[atrium] registration error", e);
        return registrationOpaqueJson(400);
      }
    }

    if (req.method === "POST" && url.pathname === "/v1/invite/preview") {
      const prevRl = rlInvitePreviewIp(`ip:${ip}`);
      if (!prevRl.ok) return rateLimitedResponse(prevRl.retryAfterSec);
      if (invitesRepo === undefined) {
        return inviteOpaqueNotFound();
      }
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return inviteOpaqueNotFound();
      }
      const parsed = zInvitePreviewBody.safeParse(raw);
      if (!parsed.success) {
        return inviteOpaqueNotFound();
      }
      const pr = invitesRepo.previewInviteToken(parsed.data.token, loadPublicProfileForDid);
      if (!pr.ok) {
        return inviteOpaqueNotFound();
      }
      const out = zAtriumInvitePreviewResponse.parse({
        inviter: pr.inviter,
        source: pr.source,
      });
      return Response.json(out);
    }

    if (req.method === "GET" && url.pathname === "/v1/invites") {
      let did: string;
      try {
        ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
      } catch (e) {
        return authErrorResponse(e);
      }
      const listRl = rlInvitesListDid(`did:${did}`);
      if (!listRl.ok) return rateLimitedResponse(listRl.retryAfterSec);
      const invites = invitesRepo === undefined ? [] : invitesRepo.listInvitesMintedForDid(did);
      const payload = zAtriumInviteListResponse.parse({ invites });
      return Response.json(payload);
    }

    if (req.method === "GET" && url.pathname === "/v1/inbox/ws") {
      let did: string;
      try {
        ({ did } = await ctx.auth.requireInboxAccess(req, url, []));
      } catch (e) {
        return authErrorResponse(e);
      }
      const inboxRl = rlInboxDid(`did:${did}`);
      if (!inboxRl.ok) return rateLimitedResponse(inboxRl.retryAfterSec);
      const ok = srv.upgrade(req, { data: { did } });
      if (!ok) {
        return jsonError("WebSocket upgrade failed", 500);
      }
      return undefined;
    }

    if (req.method === "GET" && url.pathname === "/v1/inbox") {
      let did: string;
      try {
        ({ did } = await ctx.auth.requireInboxAccess(req, url, ["limit", "markRead"]));
      } catch (e) {
        return authErrorResponse(e);
      }
      const inboxRl = rlInboxDid(`did:${did}`);
      if (!inboxRl.ok) return rateLimitedResponse(inboxRl.retryAfterSec);
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

    if (req.method === "GET" && url.pathname === "/v1/agent/sync") {
      let did: string;
      try {
        ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
      } catch (e) {
        return authErrorResponse(e);
      }
      const syncRl = rlAgentSyncDid(`did:${did}`);
      if (!syncRl.ok) return rateLimitedResponse(syncRl.retryAfterSec);
      const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
      if (profileId === undefined) {
        return jsonError("Register before sync", 400);
      }
      const profileRow = ctx.host.persistenceClient.getProfileById(profileId);
      if (profileRow === undefined) {
        return jsonError("Profile not found", 404);
      }
      try {
        const profile = zAtriumProfile.parse(JSON.parse(profileRow.bodyJson));
        const topicSlugs = ctx.host.persistenceClient.listTopicSlugsForAgentDid(did);
        const probeRows = ctx.host.persistenceClient.listPostRowsByAuthorProfileIdAndKind({
          authorProfileId: profileId,
          kind: "probe",
          limit: envAgentSyncProbeLimit(),
        });
        const probes = probeRows.flatMap((row) => {
          try {
            return [zAtriumPost.parse(JSON.parse(row.bodyJson))];
          } catch {
            return [];
          }
        });
        const payload = zAgentSyncResponse.parse({ profile, topicSlugs, probes });
        return Response.json(payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
      }
    }

    if (req.method === "GET" && url.pathname === "/v1/agent/status") {
      let did: string;
      try {
        ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
      } catch (e) {
        return authErrorResponse(e);
      }
      const syncRl = rlAgentSyncDid(`did:${did}`);
      if (!syncRl.ok) return rateLimitedResponse(syncRl.retryAfterSec);
      const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
      if (profileId === undefined) {
        return jsonError("Register before fetching status", 400);
      }
      try {
        const rows = ctx.host.persistenceClient.listPostRowsByAuthorProfileIdAndKind({
          authorProfileId: profileId,
          kind: "status",
          limit: 1,
        });
        const first = rows[0];
        if (first === undefined) {
          return Response.json(zAgentStatusResponse.parse({ status: null }));
        }
        const status = zAtriumPost.parse(JSON.parse(first.bodyJson));
        return Response.json(zAgentStatusResponse.parse({ status }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
      }
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
      let did: string;
      try {
        ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
      } catch (e) {
        return authErrorResponse(e);
      }
      const tRl = rlTopicsDid(`did:${did}`);
      if (!tRl.ok) return rateLimitedResponse(tRl.retryAfterSec);
      if (req.method === "POST") {
        ctx.host.persistenceClient.subscribeAgentTopic(did, slug);
        return Response.json({ ok: true, topicSlug: slug });
      }
      if (req.method === "DELETE") {
        ctx.host.persistenceClient.unsubscribeAgentTopic(did, slug);
        return new Response(null, { status: 204 });
      }
    }

    const byUsernameMatch = /^\/v1\/profile\/by-username\/([^/]+)$/.exec(url.pathname);
    if (req.method === "GET" && byUsernameMatch !== null) {
      const rawUsername = decodeURIComponent(byUsernameMatch[1] ?? "");
      let normalized: string;
      try {
        normalized = normalizeUsername(rawUsername);
      } catch {
        return jsonError("Username not found", 404);
      }
      const lookup = ctx.usernamesRepo.lookupByUsername(normalized);
      if (lookup === undefined) return jsonError("Username not found", 404);
      const profile = loadPublicProfileForDid(lookup.did);
      if (profile === null) return jsonError("Profile not found", 404);
      return Response.json({ did: lookup.did, profile });
    }

    const postPathMatch = /^\/v1\/posts\/([^/]+)$/.exec(url.pathname);

    if (req.method === "PATCH" && url.pathname === "/v1/profile") {
      const bodyText = await req.text();
      let did: string;
      try {
        ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
      } catch (e) {
        return authErrorResponse(e);
      }
      let renamed: { from: string; to: string } | undefined;
      try {
        const pRl = rlProfileDid(`did:${did}`);
        if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
        const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
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
          return jsonError("Provide at least one of username, displayName, bio", 400);
        }
        if (patch.username !== undefined && patch.username !== previous.username) {
          const r = ctx.usernamesRepo.rename(did, patch.username);
          if (!r.ok) {
            if (r.reason === "taken") {
              return Response.json(
                { error: "Username is already taken", code: "username_taken" },
                { status: 409 },
              );
            }
            return jsonError("Username reservation missing for this DID", 500);
          }
          renamed = { from: previous.username, to: patch.username };
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
        if (renamed !== undefined) {
          ctx.usernamesRepo.rename(did, renamed.from);
        }
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(msg, e instanceof z.ZodError ? 400 : 500);
      }
    }

    if (req.method === "POST" && url.pathname === "/v1/posts") {
      const bodyText = await req.text();
      let did: string;
      try {
        ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
      } catch (e) {
        return authErrorResponse(e);
      }
      try {
        const pRl = rlPostsDid(`did:${did}`);
        if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
        const profileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
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
        if (post.kind === "status") {
          await deleteOtherStatusPostsForAuthor(ctx, profileId, post.id);
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
        const bodyText = await req.text();
        let did: string;
        try {
          ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
        } catch (e) {
          return authErrorResponse(e);
        }
        try {
          const pRl = rlPostsDid(`did:${did}`);
          if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
          const agentProfileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
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
          if (post.kind === "status") {
            await deleteOtherStatusPostsForAuthor(ctx, agentProfileId, post.id);
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
        let did: string;
        try {
          ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, "", []));
        } catch (e) {
          return authErrorResponse(e);
        }
        try {
          const pRl = rlPostsDid(`did:${did}`);
          if (!pRl.ok) return rateLimitedResponse(pRl.retryAfterSec);
          const agentProfileId = ctx.host.persistenceClient.profileIdForAgentDid(did);
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
