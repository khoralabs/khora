/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as memories from "../memories.js";
import type * as memoriesHostActions from "../memoriesHostActions.js";
import type * as memoriesHostMutations from "../memoriesHostMutations.js";
import type * as memoriesHostQueries from "../memoriesHostQueries.js";

declare const fullApi: ApiFromModules<{
  memories: typeof memories;
  memoriesHostActions: typeof memoriesHostActions;
  memoriesHostMutations: typeof memoriesHostMutations;
  memoriesHostQueries: typeof memoriesHostQueries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

export declare const components: {
  memories: import("../../src/component/_generated/component.js").ComponentApi<"memories">;
};
