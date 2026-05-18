import { readFile } from "node:fs/promises";
import type { AppConfig, PincodeConfig, SiteConfig } from "./types.js";

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${field} must be a non-empty string array`);
  }
}

function validatePincode(raw: unknown, path: string): PincodeConfig | undefined {
  if (raw == null) return undefined;
  const obj = raw as Partial<PincodeConfig>;
  if (!obj.inputSelector || !obj.submitSelector) {
    throw new Error(`${path}.pincode requires inputSelector and submitSelector`);
  }
  return {
    inputSelector: obj.inputSelector,
    submitSelector: obj.submitSelector,
    confirmSelector: obj.confirmSelector ?? undefined,
  };
}

function validateSite(site: Partial<SiteConfig>, index: number): SiteConfig {
  if (!site.id || !site.name) {
    throw new Error(`sites[${index}] must include id and name`);
  }

  assertStringArray(site.urls, `sites[${index}].urls`);
  assertStringArray(site.inStockPatterns, `sites[${index}].inStockPatterns`);
  assertStringArray(site.outOfStockPatterns, `sites[${index}].outOfStockPatterns`);

  if (site.titleMustContain != null) {
    assertStringArray(site.titleMustContain, `sites[${index}].titleMustContain`);
  }

  return {
    id: site.id,
    name: site.name,
    enabled: site.enabled !== false,
    urls: site.urls,
    inStockPatterns: site.inStockPatterns,
    outOfStockPatterns: site.outOfStockPatterns,
    productCardSelector: site.productCardSelector ?? undefined,
    titleMustContain: site.titleMustContain ?? undefined,
    pincode: validatePincode(site.pincode, `sites[${index}]`),
  };
}

export async function loadAppConfig(configFile: string): Promise<AppConfig> {
  const raw = await readFile(configFile, "utf8");
  const parsed = JSON.parse(raw) as Partial<AppConfig>;

  if (!Array.isArray(parsed.sites)) {
    throw new Error("config must include a sites array");
  }

  const sites = parsed.sites.map((site, index) => validateSite(site, index));
  if (sites.filter((site) => site.enabled).length === 0) {
    throw new Error("at least one site must be enabled");
  }

  return { sites };
}
