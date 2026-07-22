/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as model from "../model.js";
import type * as players from "../players.js";
import type * as preparation from "../preparation.js";
import type * as preparationBridge from "../preparationBridge.js";
import type * as presence from "../presence.js";
import type * as rooms from "../rooms.js";
import type * as rounds from "../rounds.js";
import type * as scheduling from "../scheduling.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  model: typeof model;
  players: typeof players;
  preparation: typeof preparation;
  preparationBridge: typeof preparationBridge;
  presence: typeof presence;
  rooms: typeof rooms;
  rounds: typeof rounds;
  scheduling: typeof scheduling;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
