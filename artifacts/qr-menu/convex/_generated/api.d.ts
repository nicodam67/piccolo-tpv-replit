/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminAuth from "../adminAuth.js";
import type * as auth from "../auth.js";
import type * as branding from "../branding.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as importSupport from "../importSupport.js";
import type * as menu from "../menu.js";
import type * as seed from "../seed.js";
import type * as shared from "../shared.js";
import type * as translate from "../translate.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminAuth: typeof adminAuth;
  auth: typeof auth;
  branding: typeof branding;
  files: typeof files;
  http: typeof http;
  importSupport: typeof importSupport;
  menu: typeof menu;
  seed: typeof seed;
  shared: typeof shared;
  translate: typeof translate;
  users: typeof users;
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
