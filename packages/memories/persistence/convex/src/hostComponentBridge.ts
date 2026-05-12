import type { MemoriesPersistenceAsync } from "@khoralabs/memories-core";
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import {
  type ConvexMemoriesClient,
  createConvexMemoriesPersistence,
  type MemoriesConvexApiSlice,
} from "./createConvexMemoriesPersistence.js";

/**
 * Minimal shape to call into a mounted Convex **component** from a host handler.
 * Prefer {@link hostComponentBridgeFromQueryCtx} / {@link hostComponentBridgeFromMutationCtx} /
 * {@link hostComponentBridgeFromActionCtx} instead of casting `ctx`.
 */
export type HostComponentBridge = {
  runMutation: (ref: unknown, args: unknown) => Promise<unknown>;
  runQuery: (ref: unknown, args: unknown) => Promise<unknown>;
  runAction?: (ref: unknown, args: unknown) => Promise<unknown>;
};

/**
 * From a **query** handler: only {@link GenericQueryCtx.runQuery} exists. Mutations and actions
 * are stubbed to throw (vector search from a query is not supported — use an **action** entry).
 */
export function hostComponentBridgeFromQueryCtx<DataModel extends GenericDataModel>(
  ctx: Pick<GenericQueryCtx<DataModel>, "runQuery">,
): HostComponentBridge {
  return {
    runQuery: (ref, args) => ctx.runQuery(ref as never, args as never),
    runMutation: async () => {
      throw new Error(
        "hostComponentBridgeFromQueryCtx: Convex query handlers cannot run mutations",
      );
    },
    runAction: async () => {
      throw new Error(
        "hostComponentBridgeFromQueryCtx: Convex query handlers cannot run actions; use an action entry point for vector search",
      );
    },
  };
}

/**
 * From a **mutation** handler: {@link GenericMutationCtx.runQuery} and `runMutation`.
 * `runAction` is stubbed — Convex mutations do not expose `ctx.runAction` (use an action or scheduler for vector search).
 */
export function hostComponentBridgeFromMutationCtx<DataModel extends GenericDataModel>(
  ctx: Pick<GenericMutationCtx<DataModel>, "runQuery" | "runMutation">,
): HostComponentBridge {
  return {
    runQuery: (ref, args) => ctx.runQuery(ref as never, args as never),
    runMutation: (ref, args) => ctx.runMutation(ref as never, args as never),
    runAction: async () => {
      throw new Error(
        "hostComponentBridgeFromMutationCtx: Convex mutation handlers cannot run actions; use an action entry point or ctx.scheduler for vector search",
      );
    },
  };
}

/**
 * From an **action** handler: `runQuery`, `runMutation`, and `runAction` (e.g. component vector search).
 */
export function hostComponentBridgeFromActionCtx<DataModel extends GenericDataModel>(
  ctx: Pick<GenericActionCtx<DataModel>, "runQuery" | "runMutation" | "runAction">,
): HostComponentBridge {
  return {
    runQuery: (ref, args) => ctx.runQuery(ref as never, args as never),
    runMutation: (ref, args) => ctx.runMutation(ref as never, args as never),
    runAction: (ref, args) => ctx.runAction(ref as never, args as never),
  };
}

function ctxHasRunAction(
  ctx: object,
): ctx is Pick<GenericActionCtx<GenericDataModel>, "runQuery" | "runMutation" | "runAction"> {
  return typeof (ctx as { runAction?: unknown }).runAction === "function";
}

function ctxHasRunMutation(
  ctx: object,
): ctx is Pick<GenericMutationCtx<GenericDataModel>, "runQuery" | "runMutation"> {
  return typeof (ctx as { runMutation?: unknown }).runMutation === "function";
}

/**
 * Picks the correct host bridge for the handler kind (query vs mutation vs action) from `ctx`.
 * Prefer this when you need a {@link HostComponentBridge} without calling the `hostComponentBridgeFrom*Ctx` helpers directly.
 */
export function hostComponentBridgeFromCtx<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel> | GenericActionCtx<DataModel>,
): HostComponentBridge {
  if (ctxHasRunAction(ctx)) {
    return hostComponentBridgeFromActionCtx(ctx);
  }
  if (ctxHasRunMutation(ctx)) {
    return hostComponentBridgeFromMutationCtx(ctx);
  }
  return hostComponentBridgeFromQueryCtx(ctx);
}

/**
 * Full component client: mutations, queries, and actions (vector search).
 * Cast is required because host refs are untyped `unknown` at the bridge boundary.
 */
export function convexMemoriesClientFromHostBridge(
  bridge: HostComponentBridge,
): ConvexMemoriesClient {
  return {
    mutation: (ref: unknown, a: unknown) => bridge.runMutation(ref, a),
    query: (ref: unknown, a: unknown) => bridge.runQuery(ref, a),
    action: (ref: unknown, a: unknown) =>
      bridge.runAction?.(ref, a) ??
      Promise.reject(new Error("Host bridge must provide runAction for vector search")),
  } as unknown as ConvexMemoriesClient;
}

/**
 * Query-only client: use inside **queries** that must not run mutations (e.g. `search()`).
 */
export function convexMemoriesClientFromHostBridgeQueryOnly(
  bridge: HostComponentBridge,
): ConvexMemoriesClient {
  return {
    mutation: async () => {
      throw new Error(
        "convexMemoriesClientFromHostBridgeQueryOnly: mutation not allowed in this context",
      );
    },
    query: (ref: unknown, a: unknown) => bridge.runQuery(ref, a),
    action: (ref: unknown, a: unknown) =>
      bridge.runAction?.(ref, a) ??
      Promise.reject(new Error("Host bridge must provide runAction for vector search")),
  } as unknown as ConvexMemoriesClient;
}

/**
 * Wired to a mounted memories component slice from the host (`components.<name>` from `_generated/api`).
 */
export function createConvexMemoriesPersistenceFromHostBridge(
  bridge: HostComponentBridge,
  apiSlice: MemoriesConvexApiSlice,
  mode: "read-write" | "query-only" = "read-write",
): MemoriesPersistenceAsync {
  const client =
    mode === "query-only"
      ? convexMemoriesClientFromHostBridgeQueryOnly(bridge)
      : convexMemoriesClientFromHostBridge(bridge);
  return createConvexMemoriesPersistence(client, apiSlice);
}

export type ConvexMemoriesPersistenceFromHostCtx = {
  persistence: MemoriesPersistenceAsync;
  bridge: HostComponentBridge;
};

/**
 * Builds a host bridge from `ctx` and wires persistence. Mode is derived: **query** handlers use
 * a query-only client; **mutation** / **action** handlers use the full client.
 * Returns `bridge` so callers can reuse it (e.g. {@link createConvexLexicalTextStore}) without a second adaptation.
 */
export function createMemoriesPersistence<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel> | GenericActionCtx<DataModel>,
  apiSlice: MemoriesConvexApiSlice,
): ConvexMemoriesPersistenceFromHostCtx {
  const bridge = hostComponentBridgeFromCtx(ctx);
  const mode = ctxHasRunMutation(ctx) ? "read-write" : "query-only";
  return {
    persistence: createConvexMemoriesPersistenceFromHostBridge(bridge, apiSlice, mode),
    bridge,
  };
}
