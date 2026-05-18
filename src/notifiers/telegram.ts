import type { CheckResult, RuntimeConfig } from "../types.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export class TelegramNotifier {
  constructor(private readonly config: RuntimeConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.telegramBotToken && this.config.telegramChatId);
  }

  async sendStockAlert(result: CheckResult): Promise<boolean> {
    if (!this.enabled) {
      console.warn("Telegram is not configured; skipping alert.");
      return false;
    }

    const title = result.title ? `\nProduct: ${escapeHtml(result.title)}` : "";
    const matched = result.matchedPattern ? `\nMatched: ${escapeHtml(result.matchedPattern)}` : "";
    const text = [
      "<b>PS5 STOCK ALERT</b>",
      "",
      `Site: ${escapeHtml(result.siteName)}`,
      `Status: ${result.status}`,
      `Pincodes: ${this.config.pincodes.map(escapeHtml).join(", ")}`,
      `Checked: ${escapeHtml(result.checkedAt)}`,
      `${title}${matched}`,
      "",
      escapeHtml(result.url)
    ].join("\n");

    const endpoint = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: this.config.telegramChatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram alert failed: ${response.status} ${body}`);
    }

    return true;
  }
}
