export type Status = "open" | "queue" | "closed" | "unknown";
export type Kategori = "Kantor RT" | "Kelurahan" | "Puskesmas" | "Samsat";

export type Lokasi = {
  id: string;
  nama: string;
  kategori: Kategori;
  status: Status;
  lat: number;
  lng: number;
  ringkasan: string;
  meta: string;
};

export const STATUS_LABEL: Record<Status, string> = {
  open: "Buka",
  queue: "Antre",
  closed: "Tutup",
  unknown: "Belum dicek",
};

export const contohLokasi: Lokasi[] = [
  {
    id: "kel-sukamaju",
    nama: "Kelurahan Sukamaju",
    kategori: "Kelurahan",
    status: "queue",
    lat: -6.1702,
    lng: 106.7905,
    ringkasan: "Blanko e-KTP ada, antre ±15 orang",
    meta: "4 warga konfirmasi · 12 mnt lalu",
  },
  {
    id: "rt05-rw03",
    nama: "RT 05 / RW 03",
    kategori: "Kantor RT",
    status: "open",
    lat: -6.1689,
    lng: 106.7881,
    ringkasan: "Tanda tangan surat 19.00–20.30",
    meta: "Dari pengurus RT · 1 jam lalu",
  },
  {
    id: "pkm-sukamaju",
    nama: "Puskesmas Sukamaju",
    kategori: "Puskesmas",
    status: "open",
    lat: -6.172,
    lng: 106.787,
    ringkasan: "Poli umum buka, antre ±6 orang",
    meta: "3 warga konfirmasi · 25 mnt lalu",
  },
  {
    id: "samsat-keliling",
    nama: "Samsat Keliling",
    kategori: "Samsat",
    status: "closed",
    lat: -6.168,
    lng: 106.793,
    ringkasan: "Hari ini pindah ke kantor kecamatan",
    meta: "5 warga konfirmasi · 40 mnt lalu",
  },
  {
    id: "rt07-rw03",
    nama: "RT 07 / RW 03",
    kategori: "Kantor RT",
    status: "unknown",
    lat: -6.1731,
    lng: 106.7892,
    ringkasan: "Pengurus belum update jam layanan",
    meta: "Jadi yang pertama lapor",
  },
];
