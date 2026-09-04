import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const AREA = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));

export default defineSchema({
  ...authTables,

  // ===== USER =====
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.float64()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("field"), v.literal("telemarketing"), v.literal("supervisor"))),
    area: v.optional(AREA),
    mustChangePassword: v.optional(v.boolean()),
  }),

  // ===== TOKO =====
  stores: defineTable({
    name: v.string(),
    address: v.string(),
    phone: v.optional(v.string()),
    pic: v.optional(v.string()),
    area: AREA,
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    latSource: v.optional(v.union(
      v.literal("sales_registered"), v.literal("supervisor"),
      v.literal("approved"), v.literal("unverified")
    )),
    code: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("disabled")),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_area", ["area"]).index("by_status", ["status"]),

  // ===== SATU KUNJUNGAN =====
  visits: defineTable({
    salesId: v.id("users"),
    storeId: v.id("stores"),
    area: AREA,
    checkinAt: v.number(),
    checkinLat: v.number(),
    checkinLng: v.number(),
    checkoutAt: v.optional(v.number()),
    checkoutLat: v.optional(v.number()),
    checkoutLng: v.optional(v.number()),
    durationMin: v.optional(v.number()),
    status: v.union(v.literal("ongoing"), v.literal("done")),
    closedBySupervisor: v.optional(v.boolean()),
    metWith: v.optional(v.union(
      v.literal("owner"), v.literal("karyawan"), v.literal("pic"),
      v.literal("keluarga"), v.literal("toko_tutup")
    )),
    paid: v.optional(v.boolean()),
    paidAmount: v.optional(v.number()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    promiseDate: v.optional(v.string()),
    ordered: v.optional(v.boolean()),
    orderItems: v.optional(v.array(v.object({
      product: v.string(),
      qty: v.optional(v.number()),
    }))),
    noOrderReason: v.optional(v.union(
      v.literal("stok_cukup"), v.literal("baru_order"), v.literal("kalah_harga"),
      v.literal("harga_dipelajari"), v.literal("owner_tidak_ada"), v.literal("piutang")
    )),
    productTrend: v.optional(v.string()),
    notes: v.optional(v.string()),
    photoStock: v.optional(v.array(v.string())),
    photoSelfie: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  }).index("by_sales_checkin", ["salesId", "checkinAt"])
    .index("by_store", ["storeId"])
    .index("by_status", ["status"]),

  // ===== PERMINTAAN PERBARUI LOKASI =====
  store_location_requests: defineTable({
    storeId: v.id("stores"),
    requestedBy: v.id("users"),
    area: AREA,
    proposedLat: v.number(),
    proposedLng: v.number(),
    oldLat: v.optional(v.number()),
    oldLng: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectReason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_status", ["status"]).index("by_store", ["storeId"]),

  // ===== PIUTANG HARIAN (SPK TELEMARKETING) =====
  piutang_tasks: defineTable({
    area: AREA,
    storeName: v.string(),
    tanggal: v.optional(v.string()),
    total: v.optional(v.number()),
    piutang: v.optional(v.number()),
    cicil: v.optional(v.number()),
    usia: v.optional(v.number()),
    day: v.string(), // YYYY-MM-DD hari data ditarik (zona WIB)
    status: v.union(v.literal("pending"), v.literal("done")),
    hasil: v.optional(v.union(v.literal("janji_bayar"), v.literal("lunas"), v.literal("cicil"))),
    promiseDate: v.optional(v.string()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    notes: v.optional(v.string()),
    screenshot: v.optional(v.string()),
    doneBy: v.optional(v.id("users")),
    doneAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_area_status", ["area", "status"]).index("by_status", ["status"]).index("by_day", ["day"]),
});
