import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { SeedManager } from "@mikro-orm/seeder";
import { ALL_ENTITIES } from "./entities";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/cekdulu";

const useSsl =
  /sslmode=(require|verify-ca|verify-full)/.test(databaseUrl) ||
  process.env.DB_SSL === "true";

export default defineConfig({
  clientUrl: databaseUrl,
  driverOptions: useSsl ? { connection: { ssl: true } } : {},
  entities: ALL_ENTITIES,
  debug: process.env.NODE_ENV === "development",
  extensions: [Migrator, SeedManager],
  migrations: {
    path: path.resolve(__dirname, "./migrations"),
    pathTs: path.resolve(__dirname, "./migrations"),
  },
  seeder: {
    path: path.resolve(__dirname, "./seeders"),
    pathTs: path.resolve(__dirname, "./seeders"),
  },
  pool: {
    min: 2,
    max: 15,
  },
});
