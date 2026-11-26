import { Platform, Type } from "@mikro-orm/core";

export class NumericFloatType extends Type<number, string> {
  convertToDatabaseValue(value: number | string, _platform: Platform): string {
    return typeof value === "number" ? value.toString() : value;
  }

  convertToJSValue(value: string | number, _platform: Platform): number {
    return typeof value === "string" ? parseFloat(value) : value;
  }

  getColumnType(prop: { precision?: number; scale?: number }): string {
    const p = prop.precision ?? 10;
    const s = prop.scale ?? 8;
    return `decimal(${p}, ${s})`;
  }
}
