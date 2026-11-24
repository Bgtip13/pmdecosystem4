// SPK Sales (pilih toko) sudah dihapus. Tautan lama diarahkan ke SPK Jadwal.
import { Redirect } from "expo-router";

export default function SpkSalesDihapus() {
  return <Redirect href={"/jadwal" as any} />;
}
