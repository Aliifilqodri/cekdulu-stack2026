import fs from "node:fs";
import path from "node:path";
import { initDb, closeDb } from "../index";

async function main() {
  const orm = await initDb();
  try {
    const sqlPath = path.resolve(__dirname, "../../schema.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await orm.em.getConnection().execute(sql);
    console.log("[db] schema.sql berhasil dieksekusi ke PostgreSQL.");
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error("[db] Gagal mengeksekusi schema.sql:", err);
  process.exit(1);
});
