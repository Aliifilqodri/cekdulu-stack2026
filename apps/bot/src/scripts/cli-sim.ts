import readline from "node:readline";
import { SimulationGatewayAdapter } from "../adapters/gateway";
import { env } from "../config/env";
import { HttpCekduluApiClient } from "../lib/api-client";
import { InMemorySessionStore } from "../lib/session";
import { BotConversationEngine } from "../services/conversation.engine";

async function main() {
  const defaultPhone = process.argv[2] || "6281200000003";
  let activePhone = defaultPhone;

  const sessionStore = new InMemorySessionStore();
  const gateway = new SimulationGatewayAdapter("cli-sim");
  const apiClient = new HttpCekduluApiClient(env.API_BASE_URL, env.BOT_API_KEY);
  const engine = new BotConversationEngine(sessionStore, apiClient, gateway);

  console.log("=== Simulasi WhatsApp Bot CekDulu ===");
  console.log(`API Target : ${env.API_BASE_URL}`);
  console.log(`Pengirim   : ${activePhone}`);
  console.log(
    "Perintah CLI: /phone <no_hp> | /loc <lat> <lng> | ketik MENU / CEK / LAPOR / JADWAL RT\n",
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `[${activePhone}] > `,
  });

  rl.prompt();
  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed.startsWith("/phone ")) {
      activePhone = trimmed.slice(7).trim();
      rl.setPrompt(`[${activePhone}] > `);
      console.log(`Nomor pengirim diubah ke ${activePhone}\n`);
      rl.prompt();
      return;
    }

    if (trimmed.startsWith("/loc ")) {
      const [latStr, lngStr] = trimmed.slice(5).trim().split(/\s+/);
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        await engine.handleIncomingMessage({
          fromPhone: activePhone,
          location: { latitude: lat, longitude: lng },
        });
      } else {
        console.log("Format: /loc -6.1924 106.7695");
      }
      rl.prompt();
      return;
    }

    await engine.handleIncomingMessage({
      fromPhone: activePhone,
      text: trimmed,
    });
    rl.prompt();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
