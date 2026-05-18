import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import type { CheckResult, RuntimeConfig, SiteConfig, StockStatus } from "../types.js";

type Match = {
  status: StockStatus;
  pattern?: string;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function findPattern(text: string, patterns: string[]): string | undefined {
  return patterns.find((pattern) => text.includes(normalize(pattern)));
}

function classifyStock(text: string, site: SiteConfig): Match {
  const normalized = normalize(text);
  const outOfStockPattern = findPattern(normalized, site.outOfStockPatterns);
  const inStockPattern = findPattern(normalized, site.inStockPatterns);

  if (outOfStockPattern) return { status: "out_of_stock", pattern: outOfStockPattern };
  if (inStockPattern) return { status: "in_stock", pattern: inStockPattern };
  return { status: "unknown" };
}

async function dismissCommonPopups(page: Page): Promise<void> {
  const selectors = [
    "button:has-text('✕')",
    "button:has-text('×')",
    "button:has-text('Close')",
    "button:has-text('No thanks')",
    "button:has-text('Not now')",
    "button:has-text('Skip')",
    // Cookie consent banners (common on Indian retail sites)
    "button:has-text('Accept All')",
    "button:has-text('Accept all cookies')",
    "button:has-text('Accept')",
    "button:has-text('Got it')",
    "button:has-text('I Agree')",
    "button:has-text('Agree')",
    "button:has-text('OK')"
  ];

  for (const selector of selectors) {
    const button = page.locator(selector).first();
    try {
      if (await button.isVisible({ timeout: 500 })) {
        await button.click({ timeout: 1000 });
      }
    } catch {
      // Popups differ per site and are non-critical.
    }
  }
}

export class BrowserChecker {
  private browser?: Browser;
  private context?: BrowserContext;

  constructor(private readonly runtime: RuntimeConfig) {}

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.runtime.headless });
    this.context = await this.browser.newContext({
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      geolocation: { latitude: 22.3039, longitude: 70.8022 },
      permissions: ["geolocation"],
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    });
  }

  async stop(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }

  async check(site: SiteConfig, url: string): Promise<CheckResult> {
    if (!this.context) {
      throw new Error("BrowserChecker.start() must be called before check()");
    }

    const checkedAt = new Date().toISOString();
    const page = await this.context.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await dismissCommonPopups(page);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

      // Scroll to mid-page and back to trigger lazy-loaded product cards on JS-heavy SPAs
      await page.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight / 2)));
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, 0));

      await page.locator("body").waitFor({ state: "visible", timeout: 10000 });

      const title = await page.title().catch(() => undefined);
      const bodyText = await page.locator("body").innerText({ timeout: 10000 });
      const match = classifyStock(bodyText, site);

      return {
        siteId: site.id,
        siteName: site.name,
        url,
        status: match.status,
        matchedPattern: match.pattern,
        title,
        checkedAt
      };
    } catch (error) {
      return {
        siteId: site.id,
        siteName: site.name,
        url,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        checkedAt
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}
