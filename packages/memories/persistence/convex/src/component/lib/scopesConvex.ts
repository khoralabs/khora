import { namespacePath, stableId } from "@cfd/memories-core";
import type { MutationCtx } from "../_generated/server.js";

async function parseAdjacency(ctx: MutationCtx): Promise<Map<string, string[]>> {
  const rows = await ctx.db.query("scope_edges").collect();
  const adj = new Map<string, string[]>();
  for (const r of rows) {
    const list = adj.get(r.parentScopeId) ?? [];
    list.push(r.childScopeId);
    adj.set(r.parentScopeId, list);
  }
  return adj;
}

function dfsReachable(start: string, adj: Map<string, string[]>): Set<string> {
  const stack = [start];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const u = stack.pop();
    if (u === undefined || seen.has(u)) continue;
    seen.add(u);
    for (const v of adj.get(u) ?? []) {
      if (!seen.has(v)) stack.push(v);
    }
  }
  return seen;
}

/** True if adding parent→child would create a cycle (existing edges only). */
async function pathWouldCreateCycle(
  ctx: MutationCtx,
  parent: string,
  child: string,
): Promise<boolean> {
  if (parent === child) return true;
  const adj = await parseAdjacency(ctx);
  return dfsReachable(child, adj).has(parent);
}

export async function rebuildScopeClosureImpl(ctx: MutationCtx, now: number): Promise<void> {
  const existing = await ctx.db.query("scope_closure").collect();
  for (const r of existing) {
    if (r._id !== undefined) await ctx.db.delete(r._id);
  }

  const scopes = await ctx.db.query("scopes").collect();
  if (scopes.length === 0) return;

  const adj = await parseAdjacency(ctx);

  for (const s of scopes) {
    const descendants = dfsReachable(s.scopeId, adj);
    for (const descendant of descendants) {
      const closureKey = stableId("sclo", s.scopeId, descendant);
      await ctx.db.insert("scope_closure", {
        closureKey,
        ancestorScopeId: s.scopeId,
        descendantScopeId: descendant,
        tsCreated: now,
      });
    }
  }
}

export async function upsertScopeImpl(
  ctx: MutationCtx,
  input: { scopeId: string; now: number },
): Promise<void> {
  const scopeId = namespacePath(input.scopeId);
  const existing = await ctx.db
    .query("scopes")
    .withIndex("by_scopeId", (q) => q.eq("scopeId", scopeId))
    .unique();
  if (!existing) {
    await ctx.db.insert("scopes", { scopeId, tsCreated: input.now });
  }
}

export async function linkScopesImpl(
  ctx: MutationCtx,
  input: { parentScopeId: string; childScopeId: string; now: number },
): Promise<void> {
  const parent = namespacePath(input.parentScopeId);
  const child = namespacePath(input.childScopeId);
  await upsertScopeImpl(ctx, { scopeId: parent, now: input.now });
  await upsertScopeImpl(ctx, { scopeId: child, now: input.now });

  const dup = await ctx.db
    .query("scope_edges")
    .withIndex("by_parent_child", (q) => q.eq("parentScopeId", parent).eq("childScopeId", child))
    .unique();
  if (dup) {
    await rebuildScopeClosureImpl(ctx, input.now);
    return;
  }

  if (await pathWouldCreateCycle(ctx, parent, child)) {
    throw new Error(`linkScopes: would create cycle (${parent} → ${child})`);
  }

  const edgeKey = stableId("sce", parent, child);
  await ctx.db.insert("scope_edges", {
    edgeKey,
    parentScopeId: parent,
    childScopeId: child,
    tsCreated: input.now,
  });
  await rebuildScopeClosureImpl(ctx, input.now);
}

export async function unlinkScopeEdgeImpl(
  ctx: MutationCtx,
  input: { parentScopeId: string; childScopeId: string; now: number },
): Promise<void> {
  const parent = namespacePath(input.parentScopeId);
  const child = namespacePath(input.childScopeId);
  const row = await ctx.db
    .query("scope_edges")
    .withIndex("by_parent_child", (q) => q.eq("parentScopeId", parent).eq("childScopeId", child))
    .unique();
  if (row?._id !== undefined) await ctx.db.delete(row._id);
  await rebuildScopeClosureImpl(ctx, input.now);
}

export async function replaceMemoryScopesImpl(
  ctx: MutationCtx,
  input: { memoryId: string; scopeIds: readonly string[]; now: number },
): Promise<void> {
  const existing = await ctx.db
    .query("memory_scopes")
    .withIndex("by_memory", (q) => q.eq("memoryId", input.memoryId))
    .collect();
  for (const r of existing) {
    if (r._id !== undefined) await ctx.db.delete(r._id);
  }

  for (const raw of input.scopeIds) {
    const scopeId = namespacePath(raw);
    await upsertScopeImpl(ctx, { scopeId, now: input.now });
    const attachmentKey = stableId("ms", input.memoryId, scopeId);
    await ctx.db.insert("memory_scopes", {
      attachmentKey,
      memoryId: input.memoryId,
      scopeId,
      tsCreated: input.now,
    });
  }
}

export async function deleteMemoryScopesForMemoryImpl(
  ctx: MutationCtx,
  memoryId: string,
): Promise<void> {
  const existing = await ctx.db
    .query("memory_scopes")
    .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
    .collect();
  for (const r of existing) {
    if (r._id !== undefined) await ctx.db.delete(r._id);
  }
}
