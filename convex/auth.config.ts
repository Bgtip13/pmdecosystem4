// `process` tersedia di runtime Convex, tetapi proyek ini tidak memakai
// @types/node — deklarasikan seperlunya agar tetap lolos typecheck.
declare const process: { env: Record<string, string | undefined> };

export default {
  providers: [
    {
      // Ikut deployment yang sedang dipakai (dev/preview maupun production).
      // Sebelumnya URL dev di-hardcode sehingga token dari deployment lain
      // gagal diverifikasi dan halaman berakhir kosong.
      domain: process.env.CONVEX_SITE_URL ?? "https://vibrant-dotterel-990.convex.site",
      applicationID: "convex",
    },
  ],
};
