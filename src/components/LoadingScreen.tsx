import LaunchSplash from "./LaunchSplash";

/**
 * Layar loading seragam untuk aplikasi & web.
 *
 * Memakai tampilan yang sama persis dengan splash (logo 120pt, judul, subtitle,
 * garis progres) tetapi statis: dipakai saat sesi/akun sedang dimuat setelah
 * splash pembuka selesai, atau saat halaman dimuat ulang. Karena layoutnya
 * identik, peralihan dari splash ke layar ini tidak berkedip atau bertumpuk.
 */
export default function LoadingScreen() {
  return <LaunchSplash inline />;
}
