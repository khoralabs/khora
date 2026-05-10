import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type DidRegistrationRequest,
  SWARM_AGGREGATE_DOMAIN,
  SWARM_EVENT_KIND,
} from "@cfd/swarm-host";
import z from "zod";
import { mergeAtriumPostPatch, zAtriumPost, zAtriumPostPatch } from "./atrium-post.ts";
import { createAtriumHostContext } from "./create-atrium-host.ts";

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

function devSkipDid(): boolean {
  return process.env.ATRIUM_DEV_SKIP_DID_VERIFY === "1";
}

function jsonError(msg: string, status: number): Response {
  return Response.json({ error: msg }, { status });
}

const dbPath = envDbPath();
mkdirSync(dirname(dbPath), { recursive: true });

const ctx = createAtriumHostContext({
  dbPath,
  profileNamespace: envProfileNamespace(),
  postNamespace: envPostNamespace(),
});

const server = Bun.serve({
  port: envPort(),
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    if (req.method === "POST" && url.pathname === "/v1/register") {
      try {
        const body = (await req.json()) as DidRegistrationRequest;
        const payload = devSkipDid()
          ? ({ ...body, skipVerification: true as const } satisfies DidRegistrationRequest)
          : body;
        const result = await ctx.swarm.registerWithDid(payload);
        return Response.json(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status =
          /^(SwarmHost:|Atrium:)/.test(msg) || msg.includes("did:<method>") ? 400 : 500;
        return Response.json({ error: msg }, { status });
      }
    }

    const postPathMatch = /^\/v1\/posts\/([^/]+)$/.exec(url.pathname);

    if (req.method === "POST" && url.pathname === "/v1/posts") {
      try {
        const raw = (await req.json()) as unknown;
        const post = zAtriumPost.parse(raw);
        await ctx.swarm.notify({
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
          const row = ctx.hostPersistence.posts.getById(id);
          if (row === undefined) {
            return jsonError("Post not found", 404);
          }
          const previous = zAtriumPost.parse(JSON.parse(row.bodyJson));
          if (previous.id !== id) {
            return jsonError("Stored post id mismatch", 500);
          }
          const patchRaw = (await req.json()) as unknown;
          const patch = zAtriumPostPatch.parse(patchRaw);
          const post = mergeAtriumPostPatch(previous, patch);
          await ctx.swarm.notify({
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
          const row = ctx.hostPersistence.posts.getById(id);
          if (row === undefined) {
            return jsonError("Post not found", 404);
          }
          const post = zAtriumPost.parse(JSON.parse(row.bodyJson));
          await ctx.swarm.notify({
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
});

console.log(`Atrium host listening on http://localhost:${server.port}`);
