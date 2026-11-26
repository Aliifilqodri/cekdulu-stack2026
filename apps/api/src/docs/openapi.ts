import {
  BlankoState,
  ChannelSource,
  LocationCategory,
  NetworkState,
  NotifType,
  OfficerState,
  QueueBucket,
  ReportCondition,
  SummaryStatus,
  UserRole,
  ValidationState,
} from "@cekdulu/shared";

const uuidSchema = { type: "string", format: "uuid" } as const;

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "CekDulu REST API",
    version: "0.1.0",
    description:
      "REST API backend CekDulu untuk Web Next.js dan WhatsApp Bot.\n\n" +
      "**Autentikasi:**\n" +
      "- **Web**: `Authorization: Bearer <jwt_token>` dari `/api/v1/auth/otp/verify`.\n" +
      "- **WhatsApp Bot**: Header `x-bot-api-key` dan `x-user-phone` (otomatis dipetakan ke 1 nomor = 1 akun).\n\n" +
      "**Realtime WebSocket (`socket.io`):** terhubung ke host yang sama (`map:global`, `subscribe:location`, `subscribe:user`).",
  },
  servers: [
    {
      url: "http://localhost:4000",
      description: "Local Development Server",
    },
  ],
  tags: [
    { name: "Health", description: "Status koneksi PostgreSQL & Redis" },
    { name: "Auth", description: "OTP WhatsApp (1 nomor 1 akun) & Profil User" },
    { name: "Locations", description: "Peta lokasi layanan, syarat dokumen, & pengurus RT" },
    { name: "Reports", description: "Laporan warga real-time, konsensus, & moderasi" },
    { name: "Schedules", description: "Slot jam tanda tangan pengurus RT" },
    { name: "Questions", description: "Tanya jawab warga & pengurus RT" },
    { name: "Watchlist", description: "Lokasi yang dipantau pengguna" },
    { name: "Notifications", description: "Notifikasi in-app & status kirim WhatsApp" },
    { name: "Bot", description: "Endpoint khusus WhatsApp Bot" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Token JWT dari POST /api/v1/auth/otp/verify",
      },
      botApiKey: {
        type: "apiKey",
        in: "header",
        name: "x-bot-api-key",
        description: "Kunci internal WhatsApp Bot (BOT_API_KEY)",
      },
      botUserPhone: {
        type: "apiKey",
        in: "header",
        name: "x-user-phone",
        description: "Nomor WhatsApp pengirim pesan (contoh: 6281234567890)",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string", example: "Input tidak valid" },
              details: { nullable: true },
            },
          },
        },
      },
      UserRole: { type: "string", enum: Object.values(UserRole) },
      LocationCategory: { type: "string", enum: Object.values(LocationCategory) },
      SummaryStatus: { type: "string", enum: Object.values(SummaryStatus) },
      BlankoState: { type: "string", enum: Object.values(BlankoState) },
      OfficerState: { type: "string", enum: Object.values(OfficerState) },
      NetworkState: { type: "string", enum: Object.values(NetworkState) },
      QueueBucket: { type: "string", enum: Object.values(QueueBucket) },
      ReportCondition: { type: "string", enum: Object.values(ReportCondition) },
      ValidationState: { type: "string", enum: Object.values(ValidationState) },
      ChannelSource: { type: "string", enum: Object.values(ChannelSource) },
      NotifType: { type: "string", enum: Object.values(NotifType) },
      LocationSummary: {
        type: "object",
        properties: {
          locationId: uuidSchema,
          currentStatus: { $ref: "#/components/schemas/SummaryStatus" },
          statusLabel: { type: "string", example: "Antre" },
          blankoStatus: { $ref: "#/components/schemas/BlankoState", nullable: true },
          queueEstimate: { $ref: "#/components/schemas/QueueBucket", nullable: true },
          officerStatus: { $ref: "#/components/schemas/OfficerState", nullable: true },
          networkStatus: { $ref: "#/components/schemas/NetworkState", nullable: true },
          confirmationCount: { type: "integer", example: 2 },
          lastUpdatedAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time", nullable: true },
        },
      },
    },
  },
  paths: {
    "/api/v1/health": {
      get: {
        tags: ["Health"],
        summary: "Cek kesehatan server, PostgreSQL, dan Redis",
        responses: {
          200: { description: "Server dan PostgreSQL terhubung" },
          503: { description: "PostgreSQL tidak terhubung" },
        },
      },
    },
    "/api/v1/auth/otp/request": {
      post: {
        tags: ["Auth"],
        summary: "Minta kode OTP 6 digit ke nomor WhatsApp",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["phoneNumber"],
                properties: {
                  phoneNumber: { type: "string", example: "081234567890" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "OTP berhasil dibuat dan dikirim (devOtp tampil di non-production)" },
          400: { description: "Format nomor tidak valid" },
          429: { description: "Rate limit permintaan OTP" },
        },
      },
    },
    "/api/v1/auth/otp/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verifikasi OTP dan dapatkan token JWT",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["phoneNumber", "otpCode"],
                properties: {
                  phoneNumber: { type: "string", example: "081234567890" },
                  otpCode: { type: "string", pattern: "^\\d{6}$", example: "123456" },
                  fullName: { type: "string", example: "Budi Santoso" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Login berhasil, mengembalikan JWT & profil user" },
          400: { description: "OTP salah atau kedaluwarsa" },
          429: { description: "Batas maksimal 5 percobaan tercapai" },
        },
      },
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Ambil profil user aktif, reputasi, dan penugasan RT",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        responses: {
          200: { description: "Profil user berhasil diambil" },
          401: { description: "Belum terautentikasi" },
        },
      },
      patch: {
        tags: ["Auth"],
        summary: "Perbarui nama tampilan atau preferensi notifikasi WhatsApp",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  fullName: { type: "string", nullable: true, example: "Budi S." },
                  waNotifEnabled: { type: "boolean", example: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Profil berhasil diperbarui" },
          401: { description: "Belum terautentikasi" },
        },
      },
    },
    "/api/v1/locations": {
      get: {
        tags: ["Locations"],
        summary: "Daftar lokasi layanan beserta ringkasan status terkini",
        parameters: [
          {
            name: "category",
            in: "query",
            schema: { $ref: "#/components/schemas/LocationCategory" },
          },
          {
            name: "status",
            in: "query",
            schema: { $ref: "#/components/schemas/SummaryStatus" },
          },
          { name: "q", in: "query", schema: { type: "string" }, description: "Kata kunci nama, alamat, atau jenis layanan" },
          { name: "lat", in: "query", schema: { type: "number" } },
          { name: "lng", in: "query", schema: { type: "number" } },
          { name: "radius", in: "query", schema: { type: "number" }, description: "Radius pencarian (km)" },
          { name: "radiusKm", in: "query", schema: { type: "number" }, description: "Alias radius (km)" },
          { name: "source_channel", in: "query", schema: { $ref: "#/components/schemas/ChannelSource" } },
        ],
        responses: {
          200: { description: "Daftar lokasi ditemukan" },
        },
      },
      post: {
        tags: ["Locations"],
        summary: "Tambah lokasi layanan baru (Admin / Pengurus RT)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "category", "latitude", "longitude"],
                properties: {
                  name: { type: "string", example: "Kelurahan Kebon Jeruk" },
                  category: { $ref: "#/components/schemas/LocationCategory" },
                  address: { type: "string", nullable: true },
                  latitude: { type: "number", example: -6.1924 },
                  longitude: { type: "number", example: 106.7695 },
                  openTime: { type: "string", example: "07:30:00" },
                  closeTime: { type: "string", example: "16:00:00" },
                  operationalDays: { type: "string", example: "Senin - Jumat" },
                  isMobileUnit: { type: "boolean", example: false },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Lokasi berhasil ditambahkan" },
          401: { description: "Belum terautentikasi" },
          403: { description: "Role tidak diizinkan" },
        },
      },
    },
    "/api/v1/locations/{id}": {
      get: {
        tags: ["Locations"],
        summary: "Detail lengkap lokasi (ringkasan, jadwal RT, syarat berkas, laporan aktif, tanya jawab)",
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        responses: {
          200: { description: "Detail lokasi berhasil diambil" },
          404: { description: "Lokasi tidak ditemukan" },
        },
      },
      patch: {
        tags: ["Locations"],
        summary: "Perbarui informasi lokasi (Admin / Pengurus resmi lokasi)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  address: { type: "string", nullable: true },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  openTime: { type: "string", nullable: true },
                  closeTime: { type: "string", nullable: true },
                  operationalDays: { type: "string", nullable: true },
                  isMobileUnit: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Lokasi diperbarui" },
          403: { description: "Tidak memiliki akses mengelola lokasi ini" },
          404: { description: "Lokasi tidak ditemukan" },
        },
      },
    },
    "/api/v1/locations/{id}/requirements": {
      get: {
        tags: ["Locations"],
        summary: "Daftar syarat berkas layanan di suatu lokasi",
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        responses: {
          200: { description: "Daftar syarat dokumen" },
        },
      },
      post: {
        tags: ["Locations"],
        summary: "Tambah syarat berkas layanan baru",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["serviceName", "checklistItems"],
                properties: {
                  serviceName: { type: "string", example: "Surat Pengantar Domisili" },
                  checklistItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string", example: "Fotokopi KTP" },
                        required: { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Syarat berkas ditambahkan" },
        },
      },
    },
    "/api/v1/locations/{id}/requirements/{reqId}": {
      put: {
        tags: ["Locations"],
        summary: "Perbarui syarat berkas layanan",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: uuidSchema },
          { name: "reqId", in: "path", required: true, schema: uuidSchema },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["serviceName", "checklistItems"],
                properties: {
                  serviceName: { type: "string" },
                  checklistItems: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Syarat berkas diperbarui" },
          404: { description: "Tidak ditemukan" },
        },
      },
      delete: {
        tags: ["Locations"],
        summary: "Hapus syarat berkas layanan",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: uuidSchema },
          { name: "reqId", in: "path", required: true, schema: uuidSchema },
        ],
        responses: {
          200: { description: "Syarat berkas dihapus" },
        },
      },
    },
    "/api/v1/locations/{id}/questions": {
      post: {
        tags: ["Questions"],
        summary: "Kirim pertanyaan baru pada lokasi terkait",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["questionText"],
                properties: {
                  questionText: { type: "string", example: "Blanko e-KTP hari ini ada?" },
                  source_channel: { $ref: "#/components/schemas/ChannelSource" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Pertanyaan terkirim" },
        },
      },
    },
    "/api/v1/locations/{id}/watch": {
      post: {
        tags: ["Watchlist"],
        summary: "Toggle pantauan status lokasi (otomatis kirim notif WA saat status berubah)",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  source_channel: { $ref: "#/components/schemas/ChannelSource" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Berhenti memantau lokasi (isWatching: false)" },
          201: { description: "Mulai memantau lokasi (isWatching: true)" },
        },
      },
    },
    "/api/v1/locations/{id}/officials": {
      post: {
        tags: ["Locations"],
        summary: "Tugaskan user sebagai pengurus resmi lokasi RT (Admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["userId", "rtRwCode"],
                properties: {
                  userId: uuidSchema,
                  rtRwCode: { type: "string", example: "RT 05 / RW 03" },
                  isActive: { type: "boolean", example: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Pengurus RT ditugaskan" },
        },
      },
    },
    "/api/v1/reports": {
      get: {
        tags: ["Reports"],
        summary: "Daftar laporan kondisi layanan warga",
        parameters: [
          { name: "locationId", in: "query", schema: uuidSchema },
          { name: "includeExpired", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "limit", in: "query", schema: { type: "integer", default: 30, minimum: 1, maximum: 100 } },
        ],
        responses: {
          200: { description: "Daftar laporan warga" },
        },
      },
      post: {
        tags: ["Reports"],
        summary: "Kirim laporan kondisi layanan (auto-expired 2 jam & hitung konsensus)",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["locationId", "conditionType"],
                properties: {
                  locationId: uuidSchema,
                  conditionType: { $ref: "#/components/schemas/ReportCondition" },
                  queueRange: { $ref: "#/components/schemas/QueueBucket", nullable: true },
                  notes: { type: "string", nullable: true, example: "Blanko e-KTP masih ada" },
                  sourceChannel: { $ref: "#/components/schemas/ChannelSource" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Laporan tercatat dan ringkasan lokasi diperbarui" },
          401: { description: "Belum terautentikasi" },
          429: { description: "Cooldown anti-spam 10 menit aktif" },
        },
      },
    },
    "/api/v1/reports/{id}/moderate": {
      patch: {
        tags: ["Reports"],
        summary: "Moderasi laporan spam/palsu (is_hidden) oleh Admin / Pengurus RT",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["isHidden"],
                properties: {
                  isHidden: { type: "boolean", example: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Status moderasi laporan diperbarui" },
        },
      },
    },
    "/api/v1/schedules": {
      get: {
        tags: ["Schedules"],
        summary: "Daftar slot jam tanda tangan pengurus RT",
        parameters: [
          { name: "locationId", in: "query", schema: uuidSchema },
          { name: "date", in: "query", schema: { type: "string", format: "date", example: "2026-11-26" } },
        ],
        responses: {
          200: { description: "Daftar jadwal RT" },
        },
      },
      post: {
        tags: ["Schedules"],
        summary: "Buat slot jam layanan tanda tangan pengurus RT",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["locationId", "startTime", "endTime"],
                properties: {
                  locationId: uuidSchema,
                  scheduleDate: { type: "string", format: "date", example: "2026-11-26" },
                  startTime: { type: "string", example: "19:00:00" },
                  endTime: { type: "string", example: "20:30:00" },
                  isAvailable: { type: "boolean", example: true },
                  sourceChannel: { $ref: "#/components/schemas/ChannelSource" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Jadwal berhasil disimpan & disiarkan" },
        },
      },
    },
    "/api/v1/schedules/{id}": {
      patch: {
        tags: ["Schedules"],
        summary: "Perbarui ketersediaan atau jam jadwal RT",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  startTime: { type: "string", example: "19:30:00" },
                  endTime: { type: "string", example: "21:00:00" },
                  isAvailable: { type: "boolean", example: false },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Jadwal diperbarui" },
        },
      },
    },
    "/api/v1/questions": {
      get: {
        tags: ["Questions"],
        summary: "Daftar pertanyaan dan jawaban warga",
        parameters: [
          { name: "locationId", in: "query", schema: uuidSchema },
          { name: "limit", in: "query", schema: { type: "integer", default: 25 } },
        ],
        responses: {
          200: { description: "Daftar pertanyaan" },
        },
      },
      post: {
        tags: ["Questions"],
        summary: "Kirim pertanyaan pada suatu lokasi",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["locationId", "questionText"],
                properties: {
                  locationId: uuidSchema,
                  questionText: {
                    type: "string",
                    example: "Apakah hari ini blanko e-KTP masih tersedia?",
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Pertanyaan terkirim" },
        },
      },
    },
    "/api/v1/questions/{id}/answers": {
      post: {
        tags: ["Questions"],
        summary: "Jawab pertanyaan warga (otomatis berlabel Pengurus RT jika resmi)",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["answerText"],
                properties: {
                  answerText: { type: "string", example: "Masih tersedia, antrean sekitar 5 orang." },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Jawaban tersimpan" },
        },
      },
    },
    "/api/v1/watchlist": {
      get: {
        tags: ["Watchlist"],
        summary: "Daftar lokasi yang dipantau user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Daftar pantauan lokasi" },
        },
      },
    },
    "/api/v1/watchlist/{locationId}": {
      post: {
        tags: ["Watchlist"],
        summary: "Mulai pantau perubahan status lokasi",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        parameters: [{ name: "locationId", in: "path", required: true, schema: uuidSchema }],
        responses: {
          201: { description: "Lokasi ditambahkan ke pantauan" },
        },
      },
      delete: {
        tags: ["Watchlist"],
        summary: "Berhenti memantau lokasi",
        security: [{ bearerAuth: [] }, { botApiKey: [], botUserPhone: [] }],
        parameters: [{ name: "locationId", in: "path", required: true, schema: uuidSchema }],
        responses: {
          200: { description: "Lokasi dihapus dari pantauan" },
        },
      },
    },
    "/api/v1/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Daftar notifikasi user beserta jumlah yang belum dibaca",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "unreadOnly", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "limit", in: "query", schema: { type: "integer", default: 30 } },
        ],
        responses: {
          200: { description: "Daftar notifikasi" },
        },
      },
    },
    "/api/v1/notifications/{id}/read": {
      patch: {
        tags: ["Notifications"],
        summary: "Tandai satu notifikasi sudah dibaca",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: uuidSchema }],
        responses: {
          200: { description: "Notifikasi ditandai terbaca" },
        },
      },
    },
    "/api/v1/notifications/read-all": {
      post: {
        tags: ["Notifications"],
        summary: "Tandai seluruh notifikasi sudah dibaca",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Seluruh notifikasi ditandai terbaca" },
        },
      },
    },
    "/api/v1/bot/status-check": {
      get: {
        tags: ["Bot"],
        summary: "Cari lokasi via kata kunci untuk balasan otomatis WhatsApp Bot",
        parameters: [
          { name: "keyword", in: "query", required: true, schema: { type: "string" }, example: "Kebon Jeruk" },
          { name: "category", in: "query", schema: { $ref: "#/components/schemas/LocationCategory" } },
          { name: "source_channel", in: "query", schema: { $ref: "#/components/schemas/ChannelSource" } },
        ],
        responses: {
          200: { description: "Daftar lokasi + teks balasan siap kirim WA" },
        },
      },
    },
    "/api/v1/bot/webhook": {
      post: {
        tags: ["Bot"],
        summary: "Webhook internal terpadu WhatsApp Bot Gateway",
        security: [{ botApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action"],
                properties: {
                  action: { type: "string", enum: ["check_status", "ask_question", "toggle_watch"] },
                  phoneNumber: { type: "string", example: "6281234567890" },
                  keyword: { type: "string", example: "Kebon Jeruk" },
                  locationId: uuidSchema,
                  questionText: { type: "string" },
                  source_channel: { $ref: "#/components/schemas/ChannelSource" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Hasil aksi webhook bot dalam format JSON ringkas" },
          201: { description: "Resource baru terbuat via webhook bot" },
        },
      },
    },
  },
};
