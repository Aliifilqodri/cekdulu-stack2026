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
