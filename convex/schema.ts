import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const AREA = v.union(v.literal("SOLO"), v.literal("DIY"), v.literal("SEMARANG"));

// ← FASE 1: status pekerjaan (review supervisor)
// OPEN = belum dikerjakan · INPG = sudah diisi, menunggu review · CLSD = sudah disetujui
const WORKFLOW = v.union(v.literal("OPEN"), v.literal("INPG"), v.literal("CLSD"));

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
    role: v.optional(v.union(
      v.literal("owner"),
      v.literal("field"),
      v.literal("telemarketing"),
      v.literal("supervisor"),
      v.literal("ppic"),
    )),
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
  })
    .index("by_area", ["area"])
    .index("by_status", ["status"])
    .index("by_phone", ["phone"])
    .index("by_status_name", ["status", "name"])
    .index("by_area_status_name", ["area", "status", "name"])
    .searchIndex("by_name", { searchField: "name", filterFields: ["status", "area"] }),

  // ===== SATU KUNJUNGAN =====
  visits: defineTable({
    salesId: v.id("users"),
    storeId: v.id("stores"),
    area: AREA,
    checkinAt: v.number(),
    checkinLat: v.number(),
    checkinLng: v.number(),
    isMock: v.optional(v.boolean()),
    source: v.optional(v.string()),
    manualNote: v.optional(v.string()),
    checkoutAt: v.optional(v.number()),
    checkoutLat: v.optional(v.number()),
    checkoutLng: v.optional(v.number()),
    durationMin: v.optional(v.number()),
    status: v.union(v.literal("ongoing"), v.literal("done")),
    // ← FASE 1: ongoing | (checkout) INPG | (review supervisor) CLSD
    workflowStatus: v.optional(WORKFLOW),
    closedBySupervisor: v.optional(v.boolean()),
    metWith: v.optional(v.union(
      v.literal("owner"), v.literal("karyawan"), v.literal("pic"),
      v.literal("keluarga"), v.literal("toko_tutup")
    )),
    paid: v.optional(v.boolean()),
    noDebt: v.optional(v.boolean()),
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
    productSearched: v.optional(v.string()),
    notes: v.optional(v.string()),
    photoStock: v.optional(v.array(v.string())),
    photoSelfie: v.optional(v.string()),
    // ← FASE 1: jejak review supervisor
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
  }).index("by_sales_checkin", ["salesId", "checkinAt"])
    .index("by_store", ["storeId"])
    .index("by_status", ["status"])
    .index("by_status_checkout", ["status", "checkoutAt"])
    .index("by_workflow", ["workflowStatus"])
    .index("by_store_checkin", ["storeId", "checkinAt"]),


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
    retur: v.optional(v.number()),
    usia: v.optional(v.number()),
    day: v.string(),
    status: v.union(v.literal("pending"), v.literal("done")),
    // ← FASE 1: OPEN (status pending) · INPG (status pending) · CLSD (status done → riwayat)
    workflowStatus: v.optional(WORKFLOW),
    hasil: v.optional(v.union(v.literal("janji_bayar"), v.literal("lunas"), v.literal("cicil"), v.literal("no_respon"))),
    promiseDate: v.optional(v.string()),
    payMethod: v.optional(v.union(v.literal("tunai"), v.literal("transfer"))),
    notes: v.optional(v.string()),
    screenshot: v.optional(v.string()),
    doneBy: v.optional(v.id("users")),
    doneAt: v.optional(v.number()),
    // ← FASE 1: jejak review supervisor
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_area_status", ["area", "status"])
    .index("by_status", ["status"])
    .index("by_day", ["day"])
    .index("by_storeName", ["storeName"])
    // daftar/badge per hari → tidak menyusuri riwayat lama
    .index("by_day_status", ["day", "status"])
    .index("by_area_day_status", ["area", "day", "status"])
    // ← FASE 1: antrean review (semua INPG lintas hari) + janji bayar jatuh tempo
    .index("by_workflow", ["workflowStatus"])
    .index("by_promise", ["promiseDate"])
    // riwayat + ekspor per rentang tanggal
    .index("by_status_done", ["status", "doneAt"])
    .index("by_area_status_done", ["area", "status", "doneAt"]),

  // ===== FOLLOW-UP ORDERAN (otomatis dari kunjungan sales) =====
  order_followups: defineTable({
    area: AREA,
    storeId: v.id("stores"),
    storeName: v.string(),
    nameKey: v.string(),
    day: v.string(),
    visitId: v.id("visits"),
    visitDay: v.string(),
    visitCount: v.number(),
    visitedAt: v.number(),
    salesName: v.string(),
    ordered: v.optional(v.boolean()),
    orderItems: v.optional(v.array(v.object({
      product: v.string(),
      qty: v.optional(v.number()),
    }))),
    visitReason: v.optional(v.string()),
    visitNotes: v.optional(v.string()),
    visitMetWith: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("done")),
    // ← FASE 1: aturan sama seperti piutang
    workflowStatus: v.optional(WORKFLOW),
    hasil: v.optional(v.union(
      v.literal("order_masuk"), v.literal("order_tambah"),
      v.literal("tidak_order"), v.literal("no_respon")
    )),
    notes: v.optional(v.string()),
    screenshot: v.optional(v.string()),
    doneBy: v.optional(v.id("users")),
    doneAt: v.optional(v.number()),
    // ← FASE 1
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    dedupeKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_dedupe", ["dedupeKey"])
    .index("by_day_status", ["day", "status"])
    .index("by_area_status", ["area", "status"])
    .index("by_status", ["status"])
    .index("by_workflow", ["workflowStatus"]) // ← FASE 1
    .index("by_status_done", ["status", "doneAt"])
    .index("by_area_status_done", ["area", "status", "doneAt"]),

  // ===== QUICK-EDIT LAPORAN EKSPEDISI (supervisor & PPIC) =====
  ekspedisi_edits: defineTable({
    key: v.string(),
    checked: v.optional(v.boolean()),
    tunai: v.optional(v.union(v.null(), v.number())),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }),

  // ===== NOTIFIKASI INTERNAL =====
  notifications: defineTable({
    userId: v.id("users"),
    // opsional, karena notifikasi dari sistem/cron tidak punya pengirim
    fromUserId: v.optional(v.id("users")),
    fromName: v.string(),
    title: v.string(),
    body: v.string(),
    kind: v.optional(v.string()),   // jenis notif (dipakai anti-dobel)
    link: v.optional(v.string()),   // tujuan saat kartu diklik
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  }).index("by_user_created", ["userId", "createdAt"]),

  // ===== CHAT & PUSH NOTIFICATION =====
  push_tokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  chat_rooms: defineTable({
    name: v.optional(v.string()),
    isGroup: v.boolean(),
    memberIds: v.array(v.id("users")),
    lastMessage: v.optional(v.string()),
    lastSenderName: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }),

  chat_messages: defineTable({
    roomId: v.id("chat_rooms"),
    senderId: v.id("users"),
    senderName: v.string(),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_room_created", ["roomId", "createdAt"]),

  chat_reads: defineTable({
    userId: v.id("users"),
    roomId: v.id("chat_rooms"),
    lastReadAt: v.number(),
  }).index("by_user_room", ["userId", "roomId"]),

  // ===== STATUS SINKRON PIUTANG =====
  // Satu baris = satu kali tekanan tombol "Sinkronkan".
  // requestedByRole dipakai supaya indikator "terakhir sinkron" bisa mengacu
  // ke supervisor saja (sync telemarketing tidak menimpa waktunya).
  piutang_sync_runs: defineTable({
    requestedBy: v.id("users"),
    requestedByRole: v.union(v.literal("supervisor"), v.literal("telemarketing")),
    requestedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal("running"), v.literal("success"), v.literal("failed")),
    importedCount: v.optional(v.number()),
    validCount: v.optional(v.number()),
    rejectedCount: v.optional(v.number()),
    error: v.optional(v.string()),
    source: v.optional(v.string()),
  })
    .index("by_role_requested", ["requestedByRole", "requestedAt"])
    .index("by_requested_by", ["requestedBy", "requestedAt"])
    .index("by_status", ["status", "requestedAt"]),

  // ===== DEDUP REMINDER HARIAN =====
  // Satu reminder per (jenis + hari + penerima + subjek).
  // Sebelum mengirim notifikasi, cek by_dedupe dulu → tidak dobel walaupun cron terpanggil ulang.
  reminder_deliveries: defineTable({
    dedupeKey: v.string(),
    day: v.string(),
    kind: v.string(),
    recipientId: v.id("users"),
    subjectUserId: v.optional(v.id("users")),
    entityId: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("failed")),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_dedupe", ["dedupeKey"])
    .index("by_day_kind", ["day", "kind"])
    .index("by_recipient_day", ["recipientId", "day"])
    .index("by_created", ["createdAt"]),

  // ===== AUDIT TRAIL =====
  // Dicatat dari dalam mutation (lewat convex/lib/audit.ts) supaya
  // perubahan utama + catatan audit satu transaksi.
  // Jangan simpan password, token, atau screenshot di sini.
  audit_events: defineTable({
    actorId: v.optional(v.id("users")),
    actorName: v.string(),
    actorRole: v.optional(v.string()),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    area: v.optional(AREA),
    summary: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_actor_created", ["actorId", "createdAt"])
    .index("by_entity_created", ["entityType", "entityId", "createdAt"])
    .index("by_area_created", ["area", "createdAt"])
    .index("by_action_created", ["action", "createdAt"]),

  // ===== IZIN / TIDAK KELILING (per sales per hari) =====
  sales_leaves: defineTable({
    salesId: v.id("users"),
    area: AREA,                                 // snapshot area saat izin dibuat
    day: v.string(),                            // YYYY-MM-DD (WIB)
    type: v.union(
      v.literal("sakit"),
      v.literal("izin"),
      v.literal("cuti"),
      v.literal("dinas_luar"),
      v.literal("libur"),
    ),
    scope: v.union(v.literal("tidak_masuk"), v.literal("tidak_keliling")),
    note: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_day", ["day"])
    .index("by_user_day", ["salesId", "day"])
    .index("by_area_day", ["area", "day"]),

  // ===== FASE 2: FU TOKO BELUM AKTIF (tab "Toko_aktif") =====
  // Sumber: Google Sheet tab Toko_aktif, dibaca Apps Script lewat
  //   .../exec?sheet=toko_aktif
  // Satu baris = satu toko per bulan (monthKey). Sheet TIDAK pernah ditulis balik,
  // jadi kolom STATUS (LANCAR / PASIF / TOKO BARU) di sheet tetap utuh.
  //
  // Alur: OPEN (belum dikerjakan) --Call--> tetap OPEN
  //       --isi identifikasi + bukti WA + hasil--> INPG (antrean review supervisor)
  //       --CLSD--> terkunci. Supervisor juga bisa kembalikan INPG --> OPEN.
  // Sync hanya menyentuh baris OPEN. INPG/CLSD tidak pernah dihapus/ditimpa.
  active_store_tasks: defineTable({
    monthKey: v.string(),                    // "YYYY-MM" (WIB) — periode kerja
    area: AREA,
    storeKey: v.string(),                    // "SOLO||28 petshop solo" (area + nama dinormalisasi)
    storeName: v.string(),
    storeClass: v.optional(v.string()),      // KELAS TOKO (dari sheet)
    paymentClass: v.optional(v.string()),    // KELAS BYR (dari sheet)
    target: v.optional(v.number()),          // TARGET: "Rp1.043.429" → 1043429
    sourceStatus: v.optional(v.string()),    // STATUS sheet (LANCAR / PASIF / ...) — hanya tampil
    workflowStatus: WORKFLOW,

    calledAt: v.optional(v.number()),        // jejak tombol "Call" (yang terakhir)
    calledBy: v.optional(v.id("users")),
    callCount: v.optional(v.number()),       // berapa kali sudah dihubungi

    identification: v.optional(v.string()),  // identifikasi — wajib saat simpan
    chatProof: v.optional(v.string()),        // storageId bukti chat WA (1 foto) — wajib saat simpan
        result: v.optional(v.union(
          v.literal("order_masuk"), v.literal("plan_order"), v.literal("belum_order"),
          v.literal("tidak_potensi"), v.literal("history_jelek"), v.literal("no_respon"),
          v.literal("tutup_permanen"), v.literal("toko_ganti_nama"), v.literal("ganti_nama"),
          v.literal("kalah_harga"), v.literal("kebutuhan_pribadi"), v.literal("pengambilan_retail"),
          // deprecated — data lama tetap valid
          v.literal("belum_ambil"), v.literal("stok_cukup"),
        )),

    plannedOrderDate: v.optional(v.string()), // "DD-MM-YYYY" — wajib kalau result = plan_order
    note: v.optional(v.string()),
    doneBy: v.optional(v.id("users")),
    doneAt: v.optional(v.number()),

    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_month", ["monthKey"])
    .index("by_month_area", ["monthKey", "area"])
    .index("by_month_workflow", ["monthKey", "workflowStatus"])
    .index("by_month_area_workflow", ["monthKey", "area", "workflowStatus"])
    .index("by_month_store_key", ["monthKey", "storeKey"])
    .index("by_workflow", ["workflowStatus"]),

  // ===== STATUS SINKRON FU TOKO =====
  // Satu baris = satu tekanan tombol "Sinkron Toko_aktif" (hanya supervisor).
  active_store_sync_runs: defineTable({
    requestedBy: v.id("users"),
    requestedByRole: v.literal("supervisor"),
    monthKey: v.string(),
    source: v.string(),                       // nama tab sheet, mis. "Toko_aktif"
    requestedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal("running"), v.literal("success"), v.literal("failed")),
    importedCount: v.optional(v.number()),    // baris baru
    updatedCount: v.optional(v.number()),     // baris OPEN yang diperbarui dari sheet
    deletedOpenCount: v.optional(v.number()), // baris OPEN yang dihapus (sudah tidak ada di sheet)
    skippedCount: v.optional(v.number()),     // dilewati (INPG/CLSD, atau baris tidak valid)
    error: v.optional(v.string()),
  })
    .index("by_month_requested", ["monthKey", "requestedAt"])
    .index("by_status", ["status", "requestedAt"])
    .index("by_requested", ["requestedAt"]),
  // ===== FASE 3: JADWAL KUNJUNGAN SALES (tab "JADWAL") =====
  // Sumber: Google Sheet tab JADWAL lewat Apps Script  →  .../exec?sheet=jadwal
  // Satu baris = satu toko yang dijadwalkan pada satu tanggal.
  // Aturan: 1 toko = 1x kunjungan per BULAN (dijaga di mutation).
  // Sync harian hanya menyentuh baris PLANNED. ONGOING/DONE tidak pernah
  // dihapus atau ditimpa. Sheet tidak pernah ditulis balik.
  visit_schedules: defineTable({
    monthKey: v.string(),                   // "YYYY-MM" (WIB)
    dateKey: v.string(),                    // "YYYY-MM-DD" (WIB) — kunci urut & filter hari
    tanggal: v.string(),                    // "dd-mm-yyyy" apa adanya dari sheet (tampilan)
    area: AREA,
    salesId: v.optional(v.id("users")),     // diisi saat sync: area → sales lapangan
    storeId: v.optional(v.id("stores")),    // KOSONG = "belum terhubung" (nama tidak ketemu)
    storeName: v.string(),                  // apa adanya dari sheet
    nameKey: v.string(),                    // nama dinormalisasi (kunci pencocokan)
    storeKey: v.string(),                   // "SOLO||nama ternormalisasi" — pola sama FU Toko
    urutan: v.optional(v.number()),         // kolom NO di sheet — hanya nomor tampilan
    target: v.optional(v.number()),         // TARGET (integer polos)
    act: v.optional(v.number()),            // ACT = omset bulan berjalan
    catatan: v.optional(v.string()),
    status: v.union(
      v.literal("PLANNED"),                 // terjadwal, belum dikunjungi
      v.literal("ONGOING"),                 // sudah check-in, belum check-out
      v.literal("DONE"),                    // kunjungan selesai
      v.literal("CANCELLED"),               // hilang dari sheet / dibatalkan
    ),
    visitId: v.optional(v.id("visits")),
    isAdHoc: v.optional(v.boolean()),       // true = kunjungan luar jadwal (dibuat dari app)
    noSpk: v.optional(v.string()),          // mis. "SPK-20261005-SOLO-03"
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_month_store_key", ["monthKey", "storeKey"])
    .index("by_month", ["monthKey"])
    .index("by_date", ["dateKey"])
    .index("by_date_sales", ["dateKey", "salesId"])
    .index("by_date_area", ["dateKey", "area"])
    .index("by_store_month", ["storeId", "monthKey"])
    .index("by_visit", ["visitId"]),

  // ===== STATUS SINKRON JADWAL (cron 08.00 WIB + tombol manual supervisor) =====
  visit_schedule_sync_runs: defineTable({
    requestedBy: v.optional(v.id("users")), // kosong = dijalankan cron
    requestedByRole: v.optional(v.string()),
    source: v.string(),                     // nama tab sheet, mis. "JADWAL"
    requestedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal("running"), v.literal("success"), v.literal("failed")),
    insertedCount: v.optional(v.number()),
    updatedCount: v.optional(v.number()),
    cancelledCount: v.optional(v.number()),
    rejectedCount: v.optional(v.number()),
    unlinkedCount: v.optional(v.number()),  // nama toko tidak ketemu di master
    unlinkedNames: v.optional(v.array(v.string())), // daftar "belum terhubung"
    error: v.optional(v.string()),
  })
    .index("by_requested", ["requestedAt"])
    .index("by_status", ["status", "requestedAt"]),
});
