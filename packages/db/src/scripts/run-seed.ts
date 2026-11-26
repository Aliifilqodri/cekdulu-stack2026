import { initDb, closeDb } from "../index";
import { DemoSeeder } from "../seeders/DemoSeeder";

async function main() {
  const orm = await initDb();
  try {
    await orm.seeder.seed(DemoSeeder);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error("[db] Gagal menjalankan seeder:", err);
  process.exit(1);
});
