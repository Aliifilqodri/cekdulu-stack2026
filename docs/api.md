# kontrak api web ↔ bot

Base URL default lokal: `http://localhost:4000/api/v1`

Autentikasi:
- **Web**: Header `Authorization: Bearer <jwt_token>` dari hasil `/auth/otp/verify`
- **WhatsApp Bot**: Header `x-bot-api-key: <BOT_API_KEY>` + `x-user-phone: <nomor_pengirim_wa>` (otomatis dipetakan ke 1 nomor = 1 akun dengan `source_channel = 'wa_bot'`)

## daftar endpoint

| method | path | dipake sama | isi |
|---|---|---|---|
| `GET` | `/api/v1/health` | web, bot, infra | Cek status PostgreSQL & Redis |
| `POST` | `/api/v1/auth/otp/request` | web, bot | Kirim OTP 6 digit ke nomor WA (`otp_verifications`) |
| `POST` | `/api/v1/auth/otp/verify` | web | Verifikasi OTP (maks 5 percobaan), buat/ambil `users` + `user_reputations`, kembalikan JWT |
| `GET` | `/api/v1/auth/me` | web | Profil user aktif + reputasi *Trusted Reporter* + penugasan RT |
| `PATCH` | `/api/v1/auth/me` | web | Update `fullName` & preferensi `waNotifEnabled` |
| `GET` | `/api/v1/locations` | web, bot | Daftar lokasi + filter `category`, `status`, `q`, `lat`, `lng`, `radiusKm` + ringkasan terkini |
| `GET` | `/api/v1/locations/:id` | web, bot | Detail lokasi lengkap: ringkasan status, jadwal RT hari ini, syarat berkas, laporan aktif, Q&A |
| `POST` | `/api/v1/locations` | admin, rt | Tambah lokasi layanan baru |
| `PATCH` | `/api/v1/locations/:id` | admin, rt | Update lokasi (termasuk titik pindah unit keliling) |
| `GET` | `/api/v1/locations/:id/requirements` | web, bot | Daftar syarat dokumen layanan (`location_requirements`) |
| `POST` | `/api/v1/locations/:id/requirements` | admin, rt | Tambah syarat dokumen (`JSONB` checklist) |
| `PUT` | `/api/v1/locations/:id/requirements/:reqId` | admin, rt | Perbarui syarat dokumen |
| `DELETE` | `/api/v1/locations/:id/requirements/:reqId` | admin, rt | Hapus syarat dokumen |
| `POST` | `/api/v1/locations/:id/officials` | admin | Daftarkan pengurus resmi lokasi RT (`rt_officials`) |
| `GET` | `/api/v1/reports` | web, bot | Daftar laporan aktif (belum lewat 2 jam & tidak di-hide) |
| `POST` | `/api/v1/reports` | web, bot | Kirim laporan kondisi layanan, jadwalkan auto-expired 2 jam di Redis, hitung konsensus 2-3 laporan, broadcast Socket.io |
| `PATCH` | `/api/v1/reports/:id/moderate` | admin, rt | Sembunyikan/tampilkan laporan spam (`is_hidden`) & hitung ulang status |
| `GET` | `/api/v1/schedules` | web, bot | Cek slot jam tanda tangan pengurus RT (`rt_schedules`) |
| `POST` | `/api/v1/schedules` | rt (web/bot) | Input slot jam tanda tangan surat oleh pengurus RT |
| `PATCH` | `/api/v1/schedules/:id` | rt (web/bot) | Ubah ketersediaan jadwal RT |
| `GET` | `/api/v1/questions` | web | Daftar tanya jawab warga di lokasi (`questions` + `answers`) |
| `POST` | `/api/v1/questions` | web, bot | Warga kirim pertanyaan ke lokasi |
| `POST` | `/api/v1/questions/:id/answers` | web, rt | Jawab pertanyaan (otomatis berlabel `isOfficialRt` bila dijawab pengurus lokasi) |
| `GET` | `/api/v1/watchlist` | web | Daftar lokasi yang dipantau user (`watched_locations`) |
| `POST` | `/api/v1/watchlist/:locationId` | web, bot | Pantau perubahan status lokasi |
| `DELETE` | `/api/v1/watchlist/:locationId` | web, bot | Berhenti memantau lokasi |
| `GET` | `/api/v1/notifications` | web | Daftar notifikasi & jumlah belum dibaca (`notifications`) |
| `PATCH` | `/api/v1/notifications/:id/read` | web | Tandai 1 notifikasi sudah dibaca |
| `POST` | `/api/v1/notifications/read-all` | web | Tandai semua notifikasi sudah dibaca |
| `GET` | `/api/v1/bot/status-check` | bot | Cari lokasi via kata kunci + teks balasan WA siap kirim |

## event websocket (`socket.io`)

- Client otomatis bergabung ke room `map:global`:
  - `location:status_updated` — perubahan status marker peta secara live
  - `location:schedule_updated` — perubahan jadwal layanan pengurus RT
- Emit `subscribe:location` (`locationId`) untuk halaman detail lokasi:
  - `location:detail_updated`, `report:created`, `question:created`, `answer:created`, `schedule:updated`
- Emit `subscribe:user` (`jwtToken`) untuk notifikasi live:
  - `notification:new`
