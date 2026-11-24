const fs = require("fs");
const p = "src/app/spk/index.tsx";
let s = fs.readFileSync(p, "utf8");
let gagal = false;

const rep = (a, b) => {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.log("LEWAT (" + n + "x): " + a.slice(0, 45)); gagal = true; return; }
  s = s.split(a).join(b);
};

// 1) state kata kunci tertunda
rep('const [q, setQ] = useState("");',
    'const [q, setQ] = useState("");\n  const [qDeb, setQDeb] = useState(""); // kata kunci yang dikirim ke server (setelah berhenti mengetik)');

// 2) debounce 700 ms
rep('const [mvBusy, setMvBusy] = useState(false);',
    'const [mvBusy, setMvBusy] = useState(false);\n\n  // Tunggu 700 ms setelah berhenti mengetik, baru cari ke server\n  useEffect(() => {\n    const t = setTimeout(() => setQDeb(q.trim()), 700);\n    return () => clearTimeout(t);\n  }, [q]);');

// 3) yang dipakai = nilai yang sudah tertunda
rep('const storeQ = q.trim();', 'const storeQ = qDeb;');

// 4) Enter / tombol Cari di keyboard = langsung cari
rep('value={q} onChangeText={(v) => { setQ(v); setStoreTake(30); }}',
    'value={q} onChangeText={(v) => { setQ(v); setStoreTake(30); }}\n                onSubmitEditing={() => setQDeb(q.trim())} returnKeyType="search"');

if (gagal) { console.log("ADA POLA YANG TIDAK KETEMU — file TIDAK diubah."); process.exit(1); }
fs.writeFileSync(p, s);
console.log("SELESAI — 4 bagian berhasil diubah.");
