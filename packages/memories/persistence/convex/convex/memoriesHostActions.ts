import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { action } from "./_generated/server.js";

const ca = components.memories.actions;

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
    maxVectorDistance: v.optional(v.number()),
  },
  handler: async (ctx, args) => ctx.runAction(ca.searchVectorSourceMapIds, args),
});
