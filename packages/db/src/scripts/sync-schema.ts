import { initDb, closeDb } from "../index";

async function main() {
  const orm = await initDb();
  try {
    await orm.schema.updateSchema();
    console.log("[db] Skema MikroORM berhasil disinkronkan.");
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error("[db] Gagal sinkronisasi skema:", err);
  process.exit(1);
});
