import { ids } from "@khoralabs/memories-core";
import {
  canonicalJson,
  type MemoryProvenanceEvent,
  nextProvenanceRoot,
} from "@khoralabs/memories-core/provenance";
import type { MutationCtx, QueryCtx } from "../_generated/server.js";

type DbReader = QueryCtx | MutationCtx;

export async function getProvenanceHeadRootHexImpl(ctx: DbReader): Promise<string | undefined> {
  const rows = await ctx.db.query("memory_provenance").collect();
  if (rows.length === 0) return undefined;
  const first = rows[0];
  if (first === undefined) return undefined;
  let best = first;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r === undefined) continue;
    if (
      r.tsCreated > best.tsCreated ||
      (r.tsCreated === best.tsCreated && r.provenanceId > best.provenanceId)
    ) {
      best = r;
    }
  }
  return best.rootHex;
}

export async function appendProvenanceEventImpl(
  ctx: MutationCtx,
  args: { now: number; event: MemoryProvenanceEvent },
): Promise<void> {
  const head = await getProvenanceHeadRootHexImpl(ctx);
  const { parent_root_hex, root_hex } = nextProvenanceRoot(head, args.event);
  const eventJson = canonicalJson(args.event);
  const provenanceId = ids.provenance(parent_root_hex, eventJson);
  await ctx.db.insert("memory_provenance", {
    provenanceId,
    parentRootHex: parent_root_hex,
    rootHex: root_hex,
    eventType: args.event.kind,
    eventJson,
    tsCreated: args.now,
  });
}

export async function updateSourceMapContentHashImpl(
  ctx: MutationCtx,
  args: { sourceMapId: string; contentHash: string },
): Promise<void> {
  const sm = await ctx.db
    .query("source_maps")
    .withIndex("by_sourceMapId", (q) => q.eq("sourceMapId", args.sourceMapId))
    .unique();
  if (!sm) {
    throw new Error("updateSourceMapContentHash: source map not found");
  }
  await ctx.db.patch(sm._id, { contentHash: args.contentHash });
}
