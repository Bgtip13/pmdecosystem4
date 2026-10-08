/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activeStoreReminders from "../activeStoreReminders.js";
import type * as activeStoreSync from "../activeStoreSync.js";
import type * as activeStores from "../activeStores.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as backfillInpg from "../backfillInpg.js";
import type * as backfillWorkflow from "../backfillWorkflow.js";
import type * as chat from "../chat.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as jadwal from "../jadwal.js";
import type * as jadwalSync from "../jadwalSync.js";
import type * as laporan from "../laporan.js";
import type * as leaves from "../leaves.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_money from "../lib/money.js";
import type * as locationRequests from "../locationRequests.js";
import type * as notifications from "../notifications.js";
import type * as orderFollowups from "../orderFollowups.js";
import type * as piutang from "../piutang.js";
import type * as piutangSync from "../piutangSync.js";
import type * as reminderData from "../reminderData.js";
import type * as reminders from "../reminders.js";
import type * as spkReminders from "../spkReminders.js";
import type * as stores from "../stores.js";
import type * as users from "../users.js";
import type * as visits from "../visits.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activeStoreReminders: typeof activeStoreReminders;
  activeStoreSync: typeof activeStoreSync;
  activeStores: typeof activeStores;
  audit: typeof audit;
  auth: typeof auth;
  backfillInpg: typeof backfillInpg;
  backfillWorkflow: typeof backfillWorkflow;
  chat: typeof chat;
  crons: typeof crons;
  dashboard: typeof dashboard;
  files: typeof files;
  http: typeof http;
  jadwal: typeof jadwal;
  jadwalSync: typeof jadwalSync;
  laporan: typeof laporan;
  leaves: typeof leaves;
  "lib/audit": typeof lib_audit;
  "lib/money": typeof lib_money;
  locationRequests: typeof locationRequests;
  notifications: typeof notifications;
  orderFollowups: typeof orderFollowups;
  piutang: typeof piutang;
  piutangSync: typeof piutangSync;
  reminderData: typeof reminderData;
  reminders: typeof reminders;
  spkReminders: typeof spkReminders;
  stores: typeof stores;
  users: typeof users;
  visits: typeof visits;
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
