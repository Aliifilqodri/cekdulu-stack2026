import { test } from "node:test";
import assert from "node:assert/strict";
import { BaileysGatewayAdapter } from "../src/adapters/baileys";

function setup() {
  const a = new BaileysGatewayAdapter("test-session", "/tmp/cekdulu-test-sessions");
  const sent: { jid: string; text: string }[] = [];
  (a as any).sock = {
    sendMessage: async (jid: string, body: { text: string }) => { sent.push({ jid, text: body.text }); },
    readMessages: async () => undefined,
    sendPresenceUpdate: async () => undefined,
  };
  (a as any).connected = true;
  const got: any[] = [];
  a.setIncomingHandler(async (m) => { got.push(m); });
  return { a, sent, got };
}

test("pesan teks diteruskan ke handler dengan nomor hp", async () => {
  const { a, got } = setup();
  await (a as any).handleRaw({ key: { remoteJid: "6281200000003@s.whatsapp.net", fromMe: false, id: "1" }, message: { conversation: "menu" } });
  assert.equal(got.length, 1);
  assert.equal(got[0].fromPhone, "6281200000003");
  assert.equal(got[0].text, "menu");
});

test("pesan lid pakai nomor dari remoteJidAlt, balasan ke jid asal", async () => {
  const { a, got, sent } = setup();
  await (a as any).handleRaw({ key: { remoteJid: "123456789@lid", remoteJidAlt: "6281299990000@s.whatsapp.net", fromMe: false, id: "2" }, message: { extendedTextMessage: { text: "cek sukamaju" } } });
  assert.equal(got[0].fromPhone, "6281299990000");
  await a.sendMessage("6281299990000", "halo");
  assert.equal(sent[0].jid, "123456789@lid");
});

test("lokasi dikirim sebagai koordinat", async () => {
  const { a, got } = setup();
  await (a as any).handleRaw({ key: { remoteJid: "6281200000003@s.whatsapp.net", fromMe: false, id: "3" }, message: { locationMessage: { degreesLatitude: -6.19, degreesLongitude: 106.77 } } });
  assert.deepEqual(got[0].location, { latitude: -6.19, longitude: 106.77, name: undefined });
});

test("grup, status, dan pesan sendiri diabaikan", async () => {
  const { a, got } = setup();
  await (a as any).handleRaw({ key: { remoteJid: "1203@g.us", fromMe: false }, message: { conversation: "x" } });
  await (a as any).handleRaw({ key: { remoteJid: "status@broadcast", fromMe: false }, message: { conversation: "x" } });
  await (a as any).handleRaw({ key: { remoteJid: "6281@s.whatsapp.net", fromMe: true }, message: { conversation: "x" } });
  assert.equal(got.length, 0);
});
