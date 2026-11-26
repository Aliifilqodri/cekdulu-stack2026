# kontrak api web ↔ bot

Base URL lokal: `http://localhost:4000/api/v1`  
Swagger UI interaktif: `http://localhost:4000/api/docs` (OpenAPI JSON: `http://localhost:4000/api/docs.json`)

## Autentikasi & Kanal (`source_channel`)

Seluruh endpoint mutasi dan query mendukung parameter `source_channel` (`web` | `wa_bot`):
- **Web Next.js (`web`)**: Header `Authorization: Bearer <jwt_token>` hasil dari `POST /api/v1/auth/otp/verify`.
- **WhatsApp Bot Gateway (`wa_bot`)**: Header `x-bot-api-key: <BOT_API_KEY>` + `x-user-phone: <nomor_wa>`. Nomor pengirim otomatis dipetakan ke 1 nomor = 1 akun di tabel `users` (`source_channel = 'wa_bot'`).

Format respons konsisten:
```json
{
  "success": true,
  "data": { }
}
```
Format error:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Pesan error singkat"
  }
}
```

## Daftar Endpoint

| method | path | dipake sama | ringkasan & kontrak |
|---|---|---|---|
| `GET` | `/api/v1/health` | web, bot, infra | Cek status PostgreSQL & Redis |
| `POST` | `/api/v1/auth/otp/request` | web, bot | Kirim OTP 6 digit (hash `SHA-256`, TTL 5 menit, cooldown 60 dtk) |
| `POST` | `/api/v1/auth/otp/verify` | web | Verifikasi OTP (maks 5 percobaan), inisialisasi `users` + `user_reputations`, return JWT |
| `GET` | `/api/v1/auth/me` | web | Profil user aktif, reputasi *Trusted Reporter*, & penugasan RT |
| `PATCH` | `/api/v1/auth/me` | web | Update `fullName` & preferensi `waNotifEnabled` |
| `GET` | `/api/v1/locations` | web, bot | Filter `lat`, `lng`, `radius` (`radiusKm`), `category`, `status`, `q` (nama, alamat, atau jenis layanan) + status terkini dari Redis `location:status:{id}` / PostgreSQL. Lokasi `kantor_rt` memakai koordinat balai warga/centroid (`coordType: "balai_warga_centroid"`). |
| `GET` | `/api/v1/locations/:id` | web, bot | Detail lokasi: `summary`, `requirements`, `schedules` hari ini, `activeReports`, `questions` & `answers`, serta agregasi jam ramai 28 hari terakhir (`busyHours` via `GROUP BY EXTRACT(HOUR FROM created_at)`) |
| `POST` | `/api/v1/locations` | admin, rt | Tambah lokasi layanan baru |
| `PATCH` | `/api/v1/locations/:id` | admin, rt | Update metadata/koordinat lokasi |
| `GET` | `/api/v1/locations/:id/requirements` | web, bot | Daftar syarat dokumen layanan (`location_requirements`) |
| `POST` | `/api/v1/locations/:id/requirements` | admin, rt | Tambah syarat dokumen (`JSONB` checklist) |
| `PUT` | `/api/v1/locations/:id/requirements/:reqId` | admin, rt | Perbarui syarat dokumen |
| `DELETE` | `/api/v1/locations/:id/requirements/:reqId` | admin, rt | Hapus syarat dokumen |
| `POST` | `/api/v1/locations/:id/questions` | web, bot | Kirim pertanyaan baru pada lokasi terkait (`questionText`, `source_channel`) |
| `POST` | `/api/v1/locations/:id/watch` | web, bot | **Toggle** pantauan lokasi (`watched_locations`) -> `{ isWatching: boolean }`, memicu notifikasi WA otomatis saat status berubah |
| `POST` | `/api/v1/locations/:id/officials` | admin | Daftarkan pengurus resmi lokasi RT (`rt_officials`) |
| `GET` | `/api/v1/reports` | web, bot | Daftar laporan aktif (`is_hidden = FALSE` & belum expired 2 jam) |
| `POST` | `/api/v1/reports` | web, bot | Kirim laporan kondisi (`conditionType`, `queueRange`, `notes`, `source_channel`). Bobot: warga=1, Trusted Reporter=2, pengurus/admin=3. Konsensus `>= 3` mengonfirmasi status, cache Redis TTL 7200s, broadcast Socket.io. |
| `PATCH` | `/api/v1/reports/:id/moderate` | admin, rt | Sembunyikan/tampilkan laporan (`is_hidden`) & hitung ulang status |
| `GET` | `/api/v1/schedules` | web, bot | Cek slot jam tanda tangan pengurus RT (`rt_schedules`) |
| `POST` | `/api/v1/schedules` | rt (web/bot) | Input slot jam tanda tangan surat oleh pengurus RT (`source_channel`) |
| `PATCH` | `/api/v1/schedules/:id` | rt (web/bot) | Ubah ketersediaan jadwal RT |
| `GET` | `/api/v1/questions` | web | Daftar tanya jawab warga (`questions` + `answers`) |
| `POST` | `/api/v1/questions` | web, bot | Alternatif kirim pertanyaan (`locationId`, `questionText`, `source_channel`) |
| `POST` | `/api/v1/questions/:id/answers` | web, rt | Jawab pertanyaan (`isOfficialRt = true` otomatis bila penjawab terdaftar di `rt_officials` lokasi tsb + notifikasi WA ke penanya) |
| `GET` | `/api/v1/watchlist` | web | Daftar lokasi yang dipantau user (`watched_locations`) |
| `POST` | `/api/v1/watchlist/:locationId` | web, bot | Tambahkan lokasi ke pantauan |
| `DELETE` | `/api/v1/watchlist/:locationId` | web, bot | Hapus lokasi dari pantauan |
| `GET` | `/api/v1/notifications` | web | Daftar notifikasi & jumlah belum dibaca (`notifications`) |
| `PATCH` | `/api/v1/notifications/:id/read` | web | Tandai 1 notifikasi sudah dibaca |
| `POST` | `/api/v1/notifications/read-all` | web | Tandai seluruh notifikasi sudah dibaca |
| `GET` | `/api/v1/bot/status-check` | bot | Cari lokasi (`keyword`, `category`, `source_channel`) -> data ringkas + `waFormattedReply` |
| `POST` | `/api/v1/bot/webhook` | bot | Webhook terpadu WhatsApp Bot Gateway (`x-bot-api-key`) untuk `check_status`, `ask_question`, `toggle_watch` |

## Contoh Request & Response

### 1. Pencarian Lokasi (`GET /api/v1/locations?lat=-6.192&lng=106.769&radius=3&q=e-KTP`)
```json
{
  "success": true,
  "sourceChannel": "web",
  "data": [
    {
      "id": "uuid-lokasi",
      "name": "Kelurahan Kebon Jeruk",
      "category": "kelurahan",
      "coordType": "exact",
      "distanceKm": 0.07,
      "summary": {
        "currentStatus": "antre",
        "blankoStatus": "ada",
        "queueEstimate": "5-15",
        "officerStatus": "di_loket",
        "networkStatus": "normal",
        "lastUpdatedAt": "2026-11-26T05:00:00.000Z"
      }
    }
  ]
}
```

### 2. Toggle Pantau Lokasi (`POST /api/v1/locations/:id/watch`)
```json
{
  "source_channel": "wa_bot"
}
```
Response (`201` saat aktif, `200` saat berhenti):
```json
{
  "success": true,
  "data": {
    "userId": "uuid-user",
    "locationId": "uuid-lokasi",
    "isWatching": true,
    "sourceChannel": "wa_bot"
  }
}
```

## Event WebSocket (`socket.io`)

- Room global **`map:global`** (otomatis join):
  - `location:status_updated` — perubahan status marker peta (terkonfirmasi atau expired 2 jam)
  - `location:schedule_updated` — perubahan jadwal layanan pengurus RT
- Room per lokasi **`location:{location_id}`** (via `subscribe:location` / `unsubscribe:location`):
  - `location:status_updated`, `location:detail_updated`, `report:created`, `question:created`, `answer:created`, `schedule:updated`
- Room user **`user:{user_id}`** (via `subscribe:user` dengan JWT):
  - `notification:new`
