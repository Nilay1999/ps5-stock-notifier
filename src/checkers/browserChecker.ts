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

/**
 * Classify stock from a single text block.
 *
 * If BOTH in-stock and out-of-stock patterns match the same text, the result
 * is "unknown" so we don't silently mask a genuine in-stock signal (e.g. a
 * page footer saying "some items are out of stock" alongside an "Add to Cart"
 * button on the actual product).
 */
function classifyStock(text: string, site: SiteConfig): Match {
  const normalized = normalize(text);
  const outOfStockPattern = findPattern(normalized, site.outOfStockPatterns);
  const inStockPattern = findPattern(normalized, site.inStockPatterns);

  if (inStockPattern && outOfStockPattern) {
    // Conflicting signals — don't suppress either, flag for review
    console.log(
      `[warn] ${site.name}: conflicting patterns — in-stock: "${inStockPattern}", out-of-stock: "${outOfStockPattern}"`
    );
    return { status: "unknown", pattern: `conflict: ${inStockPattern} vs ${outOfStockPattern}` };
  }
  if (inStockPattern) return { status: "in_stock", pattern: inStockPattern };
  if (outOfStockPattern) return { status: "out_of_stock", pattern: outOfStockPattern };
  return { status: "unknown" };
}

/**
 * Check if a product card's text is relevant based on titleMustContain.
 * All specified substrings must appear (case-insensitive).
 */
function isRelevantProduct(cardText: string, mustContain?: string[]): boolean {
  if (!mustContain || mustContain.length === 0) return true;
  const lower = cardText.toLowerCase();
  return mustContain.every((term) => lower.includes(term.toLowerCase()));
}

async function dismissCommonPopups(page: Page): Promise<void> {
  const selectors = [
    "button:has-text('✕')",
    "button:has-text('×')",
    "button:has-text('Close')",
    "button:has-text('No thanks')",
    "button:has-text('Not now')",
    "button:has-text('Skip')",
    "button:has-text('Accept All')",
    "button:has-text('Accept all cookies')",
    "button:has-text('Accept')",
    "button:has-text('Got it')",
    "button:has-text('I Agree')",
    "button:has-text('Agree')",
    "button:has-text('OK')",
  ];

  for (const selector of selectors) {
    const button = page.locator(selector).first();
    try {
      if (await button.isVisible({ timeout: 500 })) {
        await button.click({ timeout: 1000 });
      }
    } catch {
      // Non-critical
    }
  }
}

/**
 * Attempt to set the delivery pincode on the page.
 * Failures are logged but non-fatal — stock check continues with default location.
 */
async function enterPincode(page: Page, site: SiteConfig, pincode: string): Promise<void> {
  if (!site.pincode) return;

  try {
    const input = page.locator(site.pincode.inputSelector).first();
    if (!(await input.isVisible({ timeout: 3000 }))) {
      console.log(`[pincode] ${site.name}: input not visible, skipping`);
      return;
    }

    await input.clear();
    await input.fill(pincode);

    const submit = page.locator(site.pincode.submitSelector).first();
    if (await submit.isVisible({ timeout: 2000 })) {
      await submit.click({ timeout: 3000 });
    }

    // Wait for the page to reflect the pincode change
    if (site.pincode.confirmSelector) {
      await page
        .locator(site.pincode.confirmSelector)
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {
          console.log(`[pincode] ${site.name}: confirm selector not found after submit`);
        });
    } else {
      // Give the page a moment to re-render stock info
      await page.waitForTimeout(2000);
    }

    console.log(`[pincode] ${site.name}: set pincode to ${pincode}`);
  } catch (error) {
    console.log(
      `[pincode] ${site.name}: failed to set pincode — ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract text from scoped product cards, filtering by titleMustContain.
 * Falls back to full body text if no productCardSelector is configured or no cards are found.
 */
async function extractProductTexts(page: Page, site: SiteConfig): Promise<string[]> {
  if (!site.productCardSelector) {
    const bodyText = await page.locator("body").innerText({ timeout: 10000 });
    return [bodyText];
  }

  const cards = page.locator(site.productCardSelector);
  const count = await cards.count();

  if (count === 0) {
    console.log(`[debug] ${site.name}: no elements matched "${site.productCardSelector}", falling back to body`);
    const bodyText = await page.locator("body").innerText({ timeout: 10000 });
    return [bodyText];
  }

  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const cardText = await cards.nth(i).innerText({ timeout: 5000 });
      if (isRelevantProduct(cardText, site.titleMustContain)) {
        texts.push(cardText);
      }
    } catch {
      // Individual card extraction failure is non-fatal
    }
  }

  if (texts.length === 0) {
    console.log(
      `[debug] ${site.name}: ${count} cards found but none matched titleMustContain [${site.titleMustContain?.join(", ")}]`
    );
  }

  return texts;
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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    });
  }

  async stop(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }

  async check(site: SiteConfig, url: string, pincode?: string): Promise<CheckResult> {
    if (!this.context) {
      throw new Error("BrowserChecker.start() must be called before check()");
    }

    const checkedAt = new Date().toISOString();
    const page = await this.context.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await dismissCommonPopups(page);

      // Wait for network to settle — use a generous but bounded timeout
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {
        console.log(`[debug] ${site.name}: networkidle timed out, proceeding`);
      });

      // Enter pincode before reading stock (if configured)
      if (pincode) {
        await enterPincode(page, site, pincode);
      }

      // Scroll progressively to trigger lazy-loaded content
      await page.evaluate(async () => {
        const step = Math.floor(window.innerHeight * 0.8);
        const maxScroll = document.body.scrollHeight;
        for (let y = 0; y < maxScroll; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 400));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1500);

      await page.locator("body").waitFor({ state: "visible", timeout: 10000 });

      const title = await page.title().catch(() => undefined);
      const productTexts = await extractProductTexts(page, site);

      if (productTexts.length === 0) {
        console.log(`[debug] ${site.name} title: ${title ?? "(none)"}`);
        return {
          siteId: site.id,
          siteName: site.name,
          url,
          status: "unknown",
          title,
          checkedAt,
        };
      }

      // Classify each relevant product card individually.
      // If ANY card is in-stock, the overall result is in-stock.
      let bestResult: Match = { status: "unknown" };
      for (const text of productTexts) {
        const match = classifyStock(text, site);
        if (match.status === "in_stock") {
          bestResult = match;
          break; // One in-stock card is enough to alert
        }
        if (match.status === "out_of_stock" && bestResult.status === "unknown") {
          bestResult = match;
        }
      }

      if (bestResult.status === "unknown") {
        const fullSnippet = productTexts.map((t) => normalize(t).slice(0, 300)).join(" | ");
        console.log(`[debug] ${site.name} title: ${title ?? "(none)"}`);
        console.log(`[debug] ${site.name} snippets: ${fullSnippet.slice(0, 600)}`);
      }

      return {
        siteId: site.id,
        siteName: site.name,
        url,
        status: bestResult.status,
        matchedPattern: bestResult.pattern,
        title,
        checkedAt,
      };
    } catch (error) {
      return {
        siteId: site.id,
        siteName: site.name,
        url,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        checkedAt,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}
