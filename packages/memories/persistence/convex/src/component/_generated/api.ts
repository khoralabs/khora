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
import { anyApi, componentsGeneric } from "convex/server";
import type * as actions from "../actions.js";
import type * as lib_graphReads from "../lib/graphReads.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_labelPropsSearch from "../lib/labelPropsSearch.js";
import type * as lib_mergeAtomicRunner from "../lib/mergeAtomicRunner.js";
import type * as lib_mergeWrites from "../lib/mergeWrites.js";
import type * as lib_neighborReads from "../lib/neighborReads.js";
import type * as lib_provenanceConvex from "../lib/provenanceConvex.js";
import type * as lib_vectorConfig from "../lib/vectorConfig.js";
import type * as mutations from "../mutations.js";
import type * as queries from "../queries.js";

const fullApi: ApiFromModules<{
  actions: typeof actions;
  "lib/graphReads": typeof lib_graphReads;
  "lib/helpers": typeof lib_helpers;
  "lib/labelPropsSearch": typeof lib_labelPropsSearch;
  "lib/mergeAtomicRunner": typeof lib_mergeAtomicRunner;
  "lib/mergeWrites": typeof lib_mergeWrites;
  "lib/neighborReads": typeof lib_neighborReads;
  "lib/provenanceConvex": typeof lib_provenanceConvex;
  "lib/vectorConfig": typeof lib_vectorConfig;
  mutations: typeof mutations;
  queries: typeof queries;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<typeof fullApi, FunctionReference<any, "public">> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
