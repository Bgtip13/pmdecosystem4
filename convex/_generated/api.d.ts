/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activeStoreSync from "../activeStoreSync.js";
import type * as activeStores from "../activeStores.js";
import type * as activity from "../activity.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as backfillInpg from "../backfillInpg.js";
import type * as backfillWorkflow from "../backfillWorkflow.js";
import type * as bersihkanOpen from "../bersihkanOpen.js";
import type * as chat from "../chat.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as diagOrder from "../diagOrder.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as jadwal from "../jadwal.js";
import type * as jadwalEdit from "../jadwalEdit.js";
import type * as jadwalRequests from "../jadwalRequests.js";
import type * as jadwalSync from "../jadwalSync.js";
import type * as laporan from "../laporan.js";
import type * as leaves from "../leaves.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_fuTokoAct from "../lib/fuTokoAct.js";
import type * as lib_jadwalOps from "../lib/jadwalOps.js";
import type * as lib_jadwalRules from "../lib/jadwalRules.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_roles from "../lib/roles.js";
import type * as locationRequests from "../locationRequests.js";
import type * as notifications from "../notifications.js";
import type * as orderFollowups from "../orderFollowups.js";
import type * as penilaian from "../penilaian.js";
import type * as piutang from "../piutang.js";
import type * as piutangAll from "../piutangAll.js";
import type * as piutangSync from "../piutangSync.js";
import type * as produk from "../produk.js";
import type * as produkSync from "../produkSync.js";
import type * as reminderData from "../reminderData.js";
import type * as reminders from "../reminders.js";
import type * as stores from "../stores.js";
import type * as users from "../users.js";
import type * as visitEvents from "../visitEvents.js";
import type * as visits from "../visits.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activeStoreSync: typeof activeStoreSync;
  activeStores: typeof activeStores;
  activity: typeof activity;
  audit: typeof audit;
  auth: typeof auth;
  backfillInpg: typeof backfillInpg;
  backfillWorkflow: typeof backfillWorkflow;
  bersihkanOpen: typeof bersihkanOpen;
  chat: typeof chat;
  crons: typeof crons;
  dashboard: typeof dashboard;
  diagOrder: typeof diagOrder;
  files: typeof files;
  http: typeof http;
  jadwal: typeof jadwal;
  jadwalEdit: typeof jadwalEdit;
  jadwalRequests: typeof jadwalRequests;
  jadwalSync: typeof jadwalSync;
  laporan: typeof laporan;
  leaves: typeof leaves;
  "lib/audit": typeof lib_audit;
  "lib/fuTokoAct": typeof lib_fuTokoAct;
  "lib/jadwalOps": typeof lib_jadwalOps;
  "lib/jadwalRules": typeof lib_jadwalRules;
  "lib/money": typeof lib_money;
  "lib/roles": typeof lib_roles;
  locationRequests: typeof locationRequests;
  notifications: typeof notifications;
  orderFollowups: typeof orderFollowups;
  penilaian: typeof penilaian;
  piutang: typeof piutang;
  piutangAll: typeof piutangAll;
  piutangSync: typeof piutangSync;
  produk: typeof produk;
  produkSync: typeof produkSync;
  reminderData: typeof reminderData;
  reminders: typeof reminders;
  stores: typeof stores;
  users: typeof users;
  visitEvents: typeof visitEvents;
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
