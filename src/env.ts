import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import type { RuntimeConfig } from "./types.js";

dotenv.config();

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return parsed;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const intervalSeconds = numberFromEnv("CHECK_INTERVAL_SECONDS", 60);

  return {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    pincodes: (process.env.PINCODES ?? process.env.PINCODE ?? "360001")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
    checkIntervalMs: intervalSeconds * 1000,
    headless: (process.env.HEADLESS ?? "true").toLowerCase() !== "false",
    stateFile: path.resolve(process.env.STATE_FILE ?? ".stock-state.json"),
    configFile: path.resolve(process.env.CONFIG_FILE ?? "config/sites.json"),
    runOnce: (process.env.RUN_ONCE ?? "false").toLowerCase() === "true" || process.argv.includes("--once")
  };
}
