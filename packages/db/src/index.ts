import "reflect-metadata";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "./mikro-orm.config";

let ormInstance: MikroORM | null = null;

export async function initDb(): Promise<MikroORM> {
  if (!ormInstance) {
    ormInstance = await MikroORM.init(config);
  }
  return ormInstance;
}

export function getOrm(): MikroORM {
  if (!ormInstance) {
    throw new Error("Database MikroORM belum diinisialisasi. Panggil initDb() terlebih dahulu.");
  }
  return ormInstance;
}

export async function closeDb(): Promise<void> {
  if (ormInstance) {
    await ormInstance.close(true);
    ormInstance = null;
  }
}

export * from "./entities";
export * from "./types/NumericFloatType";
export { default as mikroOrmConfig } from "./mikro-orm.config";
export { MikroORM, RequestContext } from "@mikro-orm/postgresql";
