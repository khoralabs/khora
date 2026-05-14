import type { MemorySearchHit } from "@khoralabs/memories-core/helpers";
import type { SwarmHostSearchScope } from "@khoralabs/swarm-host";
import z from "zod";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError, rateLimitedResponse } from "./responses.ts";

const zSwarmHostMemoryEntityKind = z.enum(["profiles", "posts", "topics", "probes"]);

const zSwarmHostSearchScope: z.ZodType<SwarmHostSearchScope> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("profiles"),
    withRelatedPosts: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("posts") }),
  z.object({ kind: z.literal("topics") }),
  z.object({ kind: z.literal("probes") }),
  z.object({
    kind: z.literal("multi"),
    includes: z.array(zSwarmHostMemoryEntityKind).min(1),
  }),
  z.object({
    kind: z.literal("raw"),
    namespace: z.string().trim().min(1),
    additionalNamespaces: z.array(z.string().trim().min(1)).optional(),
  }),
]);

const zSearchScopeMode = z.enum(["pathSubtree", "scopeDag", "exactScope"]);

const zMemoriesSearchBody = z.object({
  query: z.string().trim().min(1),
  scope: zSwarmHostSearchScope,
  limit: z.number().int().min(1).max(100).optional(),
  minScore: z.number().min(0).max(1).optional(),
  searchScopeMode: zSearchScopeMode.optional(),
});

function scopeReferencesTopics(scope: SwarmHostSearchScope): boolean {
  if (scope.kind === "topics") return true;
  if (scope.kind === "multi") {
    return scope.includes.includes("topics");
  }
  return false;
}

/**
 * Hybrid memory search (`POST /v1/memories/search`).
 *
 * **Scope DAG reads:** primary rows stay in `atrium/profiles`, `atrium/posts`, etc. For buckets like
 * `atrium/<profileId>` or `atrium/<topicSlug>`, merges attach DAG scopes and the host links the scope graph.
 * Search with `{ "scope": { "kind": "raw", "namespace": "atrium/<profileId>" }, "searchScopeMode": "scopeDag" }`
 * (default mode is `pathSubtree`, which only prefixes the primary `namespace` column).
 * Re-touch: run a profile/post update (or reindex) so merges refresh `attachScopes` on existing rows.
 */
export async function handleMemoriesSearch(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const { ctx, rateLimiters } = deps;
  const bodyText = await req.text();
  let did: string;
  try {
    ({ did } = await ctx.auth.requireAuthenticatedRequest(req, url, bodyText, []));
  } catch (e) {
    return authErrorResponse(e);
  }

  const rl = rateLimiters.memoriesSearchDid(`did:${did}`);
  if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);

  const profileId = ctx.host.persistenceClient.profileIdForPrincipal(did);
  if (profileId === undefined) {
    return jsonError("Register before searching memories", 400);
  }

  let body: z.infer<typeof zMemoriesSearchBody>;
  try {
    const raw: unknown = JSON.parse(bodyText) as unknown;
    body = zMemoriesSearchBody.parse(raw);
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.message : "Invalid JSON body";
    return jsonError(msg, 400);
  }

  if (scopeReferencesTopics(body.scope) && ctx.config.topicNamespace === undefined) {
    return jsonError(
      "Topic memory search is not configured on this host (topicNamespace unset)",
      400,
    );
  }

  const hasEmbedding = ctx.config.embeddingModel !== undefined;
  let hits: MemorySearchHit[];
  try {
    hits = await ctx.host.search({
      scope: body.scope,
      content: { text: body.query },
      options: {
        topK: body.limit ?? 20,
        ...(body.minScore !== undefined ? { minScore: body.minScore } : {}),
        ...(!hasEmbedding ? { arms: { lexical: 1, vector: 0 } } : {}),
      },
      ...(body.searchScopeMode !== undefined ? { searchScopeMode: body.searchScopeMode } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("topicNamespace")) {
      return jsonError(msg, 400);
    }
    return jsonError(msg, 500);
  }

  return Response.json(hits);
}
