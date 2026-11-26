import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";
import { ChannelSource } from "@cekdulu/shared";
import { createApp } from "../src/app";
import { parseCorsOrigins } from "../src/config/env";
import { openApiSpec } from "../src/docs/openapi";
import { resolveSourceChannel } from "../src/middlewares/auth";

describe("Unified Web & Bot API Layer", () => {
  it("normalisasi CORS_ORIGIN menghapus trailing slash dan whitespace", () => {
    const origins = parseCorsOrigins(
      "http://localhost:3000, https://cekdulu.rafiikhwan.my.id/ ",
    );
    assert.deepEqual(origins, [
      "http://localhost:3000",
      "https://cekdulu.rafiikhwan.my.id",
    ]);
  });

  it("resolveSourceChannel memprioritaskan parameter eksplisit, source_channel snake_case, lalu channel user", () => {
    const reqWeb = {
      body: {},
      query: {},
      user: { sourceChannel: ChannelSource.WEB },
    } as unknown as Request;
    assert.equal(resolveSourceChannel(reqWeb), ChannelSource.WEB);

    const reqSnakeBody = {
      body: { source_channel: "wa_bot" },
      query: {},
      user: { sourceChannel: ChannelSource.WEB },
    } as unknown as Request;
    assert.equal(resolveSourceChannel(reqSnakeBody), ChannelSource.WA_BOT);

    const reqQueryChannel = {
      body: {},
      query: { source_channel: "wa_bot" },
    } as unknown as Request;
    assert.equal(resolveSourceChannel(reqQueryChannel), ChannelSource.WA_BOT);
  });

  it("mendaftarkan seluruh route terpadu termasuk nested /locations/:id/questions, /watch, dan /bot/webhook", () => {
    const app = createApp();
    assert.equal(typeof app.use, "function");

    const paths = Object.keys(openApiSpec.paths);
    assert.ok(paths.includes("/api/v1/locations"));
    assert.ok(paths.includes("/api/v1/locations/{id}"));
    assert.ok(paths.includes("/api/v1/locations/{id}/questions"));
    assert.ok(paths.includes("/api/v1/locations/{id}/watch"));
    assert.ok(paths.includes("/api/v1/questions/{id}/answers"));
    assert.ok(paths.includes("/api/v1/bot/status-check"));
    assert.ok(paths.includes("/api/v1/bot/webhook"));
  });
});
