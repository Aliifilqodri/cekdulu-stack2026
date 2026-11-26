# api (express.js + mikro-orm + redis + socket.io)

Backend utama **cekdulu** yang melayani aplikasi Web (`apps/web`) dan WhatsApp Bot (`apps/bot`).

## cara menjalankan

1. Salin `.env.example` di root repo menjadi `.env`, lalu sesuaikan `DATABASE_URL` dan `REDIS_URL`.
2. Terapkan skema database dan data demo (opsional):
   ```bash
   npm run db:sql
   npm run db:seed
   ```
3. Jalankan server development:
   ```bash
   npm run dev:api
   ```
   - Server API: `http://localhost:4000/api/v1/health`
   - Swagger UI: `http://localhost:4000/api/docs`
   - OpenAPI JSON: `http://localhost:4000/api/docs.json`
