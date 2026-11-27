# bot wa (`@cekdulu/bot`)

Service WhatsApp Bot Gateway untuk **cekdulu** dengan session state Redis (TTL 15 menit / 900 detik) dan dukungan multi-adapter (`simulation`, `cloud_api`, `multi_device`).

## Alur Percakapan
1. **Menu 1 / `CEK` / Share Live Location**: Cari lokasi berdasarkan nama atau koordinat GPS → balasan status buka/tutup, antrean, blanko, update terakhir, jadwal RT, dan syarat dokumen.
2. **Menu 2 / `LAPOR`**: Pilih lokasi → pilih kondisi (`1..6`) → pilih estimasi antrean (`< 5`, `5-15`, `15-30`, `> 30`) + catatan opsional → kirim ke `POST /api/v1/reports` (`source_channel: 'wa_bot'`).
3. **Pengurus RT (`JADWAL RT` / `ATUR SLOT`)**: Validasi nomor terdaftar aktif di `rt_officials` → atur jam tanda tangan hari ini (`19.00-20.30`), tandai libur (`is_available = FALSE`), atau jawab pertanyaan warga.

## Cara Menjalankan
```bash
# Jalankan backend API terlebih dahulu
npm run dev:api

# Di terminal terpisah, jalankan bot gateway (port 4001)
npm run dev:bot

# Atau chat interaktif di terminal (simulasi warga / pengurus RT)
npm run sim -w @cekdulu/bot
```

Endpoint simulasi HTTP untuk demo:
```bash
curl -X POST http://localhost:4001/webhook/simulate \
  -H "Content-Type: application/json" \
  -d '{"fromPhone":"081200000003","text":"Cek Kebon Jeruk"}'
```

## Nyambung ke WhatsApp asli (buat demo)

Pakai mode `baileys`: bot login ke nomor WA demo lewat scan QR, kayak WhatsApp Web.

1. Siapin **nomor WA khusus demo** (jangan nomor pribadi, ada risiko diblokir WhatsApp kalau dipakai bot).
2. Di `.env` isi `WA_GATEWAY_MODE=baileys`.
3. Jalanin API dulu (`npm run dev:api`), terus bot (`npm run dev:bot`).
4. QR muncul di terminal. Buka WhatsApp di HP nomor demo > **Perangkat tertaut** > **Tautkan perangkat**, scan QR-nya.
5. Kalau muncul `Tersambung ke WhatsApp`, coba chat nomor demo itu dari HP lain: ketik `menu`.

Sesi login disimpan di `apps/bot/sessions/` (udah masuk `.gitignore`, **jangan di-commit**). Kalau mau ganti nomor, hapus folder itu terus jalanin ulang.

Catatan: Baileys itu library nggak resmi. Buat demo lomba aman, tapi buat produksi tetap pakai `cloud_api` (WhatsApp Cloud API resmi).
