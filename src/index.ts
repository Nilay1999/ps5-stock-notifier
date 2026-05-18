import { loadAppConfig } from "./config.js";
import { BrowserChecker } from "./checkers/browserChecker.js";
import { loadRuntimeConfig } from "./env.js";
import { TelegramNotifier } from "./notifiers/telegram.js";
import { loadState, recordResult, saveState, shouldAlert } from "./state.js";
import type { CheckResult, SiteConfig, StoredState } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(baseMs: number): number {
  const spread = Math.floor(baseMs * 0.2);
  return baseMs + Math.floor(Math.random() * spread);
}

function formatResult(result: CheckResult): string {
  const suffix = result.matchedPattern ? ` (${result.matchedPattern})` : "";
  const error = result.error ? ` - ${result.error}` : "";
  return `${result.siteName}: ${result.status}${suffix} - ${result.url}${error}`;
}

async function checkSite(
  checker: BrowserChecker,
  notifier: TelegramNotifier,
  state: StoredState,
  site: SiteConfig,
  pincode: string | undefined
): Promise<void> {
  for (const url of site.urls) {
    const result = await checker.check(site, url, pincode);
    console.log(formatResult(result));

    let alertedAt: string | undefined;
    if (shouldAlert(result, state)) {
      const sent = await notifier.sendStockAlert(result);
      if (sent) {
        alertedAt = new Date().toISOString();
        console.log(`Alert sent for ${site.name}: ${url}`);
      }
    }

    recordResult(result, state, alertedAt);

    // Polite delay between URLs of the same site
    await sleep(1500 + Math.floor(Math.random() * 1500));
  }
}

async function main(): Promise<void> {
  const runtime = loadRuntimeConfig();
  const appConfig = await loadAppConfig(runtime.configFile);
  const state = await loadState(runtime.stateFile);
  const checker = new BrowserChecker(runtime);
  const notifier = new TelegramNotifier(runtime);
  const enabledSites = appConfig.sites.filter((site) => site.enabled);

  // Use the first pincode for delivery checks; undefined if none configured
  const pincode = runtime.pincodes[0] ?? undefined;

  if (!notifier.enabled) {
    console.warn("Telegram variables are missing. Checks will run, but alerts will be skipped.");
  }

  console.log(`Loaded ${enabledSites.length} enabled retailer configs.`);
  console.log(
    `Using pincode ${pincode ?? "(none)"}; interval ${runtime.checkIntervalMs / 1000}s.`
  );

  await checker.start();

  const shutdown = async (): Promise<void> => {
    console.log("Shutting down...");
    await saveState(runtime.stateFile, state);
    await checker.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  try {
    while (true) {
      const startedAt = Date.now();
      for (const site of enabledSites) {
        await checkSite(checker, notifier, state, site, pincode);
        await saveState(runtime.stateFile, state);
      }

      if (runtime.runOnce) {
        console.log("One-shot run complete.");
        return;
      }

      const elapsed = Date.now() - startedAt;
      const waitMs = Math.max(5000, jitter(runtime.checkIntervalMs) - elapsed);
      console.log(`Cycle complete. Waiting ${Math.round(waitMs / 1000)}s.`);
      await sleep(waitMs);
    }
  } finally {
    await checker.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
