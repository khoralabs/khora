import type { SearchNamespaceScope } from "@khoralabs/memories-core";
import { canonicalizeNamespacePrefixes, namespacePath } from "@khoralabs/memories-core";
import type { QueryCtx } from "../_generated/server.js";

/**
 * Memory ids allowed by DAG scope attachment (+ closure). Undefined means caller should use
 * namespace-prefix filtering only ({@link SearchNamespaceScope} `pathSubtree` / `unscoped`).
 */
export async function memoryIdsMatchingScope(
  ctx: QueryCtx,
  scope: SearchNamespaceScope,
): Promise<string[] | undefined> {
  if (scope.kind === "unscoped" || scope.kind === "pathSubtree") return undefined;

  if (scope.kind === "exactScope") {
    const idsOut = new Set<string>();
    const scopes = scope.scopes.map((s) => namespacePath(s));
    if (scopes.length === 0) return [];
    for (const sid of scopes) {
      const rows = await ctx.db
        .query("memory_scopes")
        .withIndex("by_scope", (q) => q.eq("scopeId", sid))
        .collect();
      for (const r of rows) idsOut.add(r.memoryId);
    }
    return [...idsOut];
  }

  const roots = canonicalizeNamespacePrefixes(scope.roots.map((r) => namespacePath(r)));
  if (roots.length === 0) return [];

  const descendantScopes = new Set<string>();
  for (const r of roots) {
    const rows = await ctx.db
      .query("scope_closure")
      .withIndex("by_ancestor", (q) => q.eq("ancestorScopeId", r))
      .collect();
    for (const row of rows) descendantScopes.add(row.descendantScopeId);
  }

  const idsOut = new Set<string>();
  for (const sid of descendantScopes) {
    const rows = await ctx.db
      .query("memory_scopes")
      .withIndex("by_scope", (q) => q.eq("scopeId", sid))
      .collect();
    for (const r of rows) idsOut.add(r.memoryId);
  }
  return [...idsOut];
}

/** Intersect optional caller allowlist with scope-derived ids (both must match). */
export function intersectMemoryAllowlists(
  callerIds: string[] | undefined,
  scopeIds: string[],
): string[] {
  if (scopeIds.length === 0) return [];
  if (callerIds === undefined) return scopeIds;
  const allowed = new Set(scopeIds);
  return callerIds.filter((id) => allowed.has(id));
}
