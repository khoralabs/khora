import type { SearchNamespaceScope } from "@cfd/memories-core";
import {
  canonicalizeNamespacePrefixes,
  isPrefixOf,
  namespacePath,
  namespacePrefixFieldForDepthCamel,
  namespaceSegments,
} from "@cfd/memories-core";
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { action } from "./_generated/server.js";
import { intersectMemoryAllowlists } from "./lib/scopeSearchConvex.js";
import { isConvexVectorDimension, vectorTableNameForDim } from "./lib/vectorConfig.js";

const VECTOR_OVERSAMPLE = 8;

function scopeFromValidator(scope: {
  kind: "unscoped" | "pathSubtree" | "scopeDag" | "exactScope";
  namespaces?: string[];
  roots?: string[];
  scopes?: string[];
}): SearchNamespaceScope {
  if (scope.kind === "unscoped") return { kind: "unscoped" };
  if (scope.kind === "pathSubtree") {
    return { kind: "pathSubtree", namespaces: scope.namespaces ?? [] };
  }
  if (scope.kind === "scopeDag") {
    return { kind: "scopeDag", roots: scope.roots ?? [] };
  }
  return { kind: "exactScope", scopes: scope.scopes ?? [] };
}

export const searchVectorSourceMapIds = action({
  args: {
    scope: v.object({
      kind: v.union(
        v.literal("unscoped"),
        v.literal("pathSubtree"),
        v.literal("scopeDag"),
        v.literal("exactScope"),
      ),
      namespaces: v.optional(v.array(v.string())),
      roots: v.optional(v.array(v.string())),
      scopes: v.optional(v.array(v.string())),
    }),
    vector: v.array(v.number()),
    limit: v.number(),
    memoryIds: v.optional(v.array(v.string())),
    /** Approximate cutoff: skip hits whose cosine distance `1 - _score` exceeds this (aligns loosely with SQLite vec distance caps). */
    maxVectorDistance: v.optional(v.number()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, raw) => {
    const scope = scopeFromValidator(raw.scope);
    if (raw.memoryIds !== undefined && raw.memoryIds.length === 0) return [];
    if (scope.kind === "pathSubtree" && scope.namespaces.length === 0) return [];
    if (scope.kind === "scopeDag" && scope.roots.length === 0) return [];
    if (scope.kind === "exactScope" && scope.scopes.length === 0) return [];

    if (!isConvexVectorDimension(raw.vector.length)) {
      throw new Error(`searchVectorSourceMapIds: invalid embedding dimension ${raw.vector.length}`);
    }
    const dim = raw.vector.length;
    const table = vectorTableNameForDim(dim);

    const scopedIds =
      scope.kind === "scopeDag"
        ? await ctx.runQuery(internal.queries.memoryIdsMatchingScopeInternal, {
            kind: "scopeDag",
            roots: [...scope.roots],
          })
        : scope.kind === "exactScope"
          ? await ctx.runQuery(internal.queries.memoryIdsMatchingScopeInternal, {
              kind: "exactScope",
              scopes: [...scope.scopes],
            })
          : undefined;

    let memoryFilterIds = raw.memoryIds;
    if (scopedIds !== undefined) {
      const merged = intersectMemoryAllowlists(raw.memoryIds, scopedIds);
      if (merged.length === 0) return [];
      memoryFilterIds = merged;
    }

    const roots =
      scope.kind === "pathSubtree"
        ? canonicalizeNamespacePrefixes(scope.namespaces.map((ns) => namespacePath(ns)))
        : [];

    const memoryIdSet = memoryFilterIds === undefined ? undefined : new Set(memoryFilterIds);

    const knnLimit = Math.min(256, Math.max(raw.limit * VECTOR_OVERSAMPLE, 50));

    const unscopedNoAllowlist =
      scope.kind === "unscoped" && (memoryFilterIds === undefined || memoryFilterIds.length === 0);

    const hits = await ctx.vectorSearch(
      table,
      "search_vector",
      unscopedNoAllowlist
        ? {
            vector: raw.vector,
            limit: knnLimit,
          }
        : {
            vector: raw.vector,
            limit: knnLimit,
            filter: (q) => {
              if (scope.kind === "unscoped") {
                const mids = memoryFilterIds!;
                const idClauses = mids.map((id) => q.eq("memoryId", id));
                const first = idClauses[0];
                if (first === undefined) throw new Error("searchVectorSourceMapIds: empty filter");
                return idClauses.length === 1 ? first : q.or(...idClauses);
              }
              if (scope.kind === "scopeDag" || scope.kind === "exactScope") {
                const mids = memoryFilterIds!;
                const idClauses = mids.slice(0, 64).map((id) => q.eq("memoryId", id));
                const first = idClauses[0];
                if (first === undefined) throw new Error("searchVectorSourceMapIds: empty filter");
                return idClauses.length === 1 ? first : q.or(...idClauses);
              }
              const nsClauses = roots.map((r) => {
                const depth = namespaceSegments(r).length;
                const field = namespacePrefixFieldForDepthCamel(depth);
                return q.eq(field, r);
              });
              const idClauses =
                memoryFilterIds !== undefined &&
                memoryFilterIds.length > 0 &&
                memoryFilterIds.length <= 64
                  ? memoryFilterIds.map((id) => q.eq("memoryId", id))
                  : [];
              const all = [...nsClauses, ...idClauses];
              if (all.length === 0) {
                throw new Error("searchVectorSourceMapIds: empty filter");
              }
              const first = all[0];
              if (first === undefined) {
                throw new Error("searchVectorSourceMapIds: empty filter");
              }
              if (all.length === 1) return first;
              return q.or(...all);
            },
          },
    );

    const rows = await ctx.runQuery(internal.queries.getVectorFeatureRowsByIds, {
      dimension: dim,
      ids: hits.map((h) => String(h._id)),
    });

    const maxDist = raw.maxVectorDistance;
    const out: string[] = [];
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const row = rows[i];
      if (!hit || !row) continue;
      if (maxDist !== undefined && Number.isFinite(maxDist)) {
        const score = (hit as { _score?: number })._score;
        if (score !== undefined && 1 - score > maxDist) continue;
      }
      const docNs = namespacePath(row.namespace);
      const inNs =
        scope.kind === "unscoped"
          ? true
          : scope.kind === "pathSubtree"
            ? roots.some((r) => isPrefixOf(r, docNs))
            : true;
      if (!inNs) continue;
      if (memoryIdSet !== undefined && !memoryIdSet.has(row.memoryId)) continue;
      out.push(row.sourceMapId);
      if (out.length >= raw.limit) break;
    }
    return out;
  },
});
