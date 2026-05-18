export type StockStatus = "in_stock" | "out_of_stock" | "unknown" | "error";

export type PincodeConfig = {
  /** CSS selector for the pincode input field */
  inputSelector: string;
  /** CSS selector for the button to submit the pincode */
  submitSelector: string;
  /** Optional selector that confirms the pincode was applied (e.g. delivery estimate text) */
  confirmSelector?: string;
};

export type SiteConfig = {
  id: string;
  name: string;
  enabled: boolean;
  urls: string[];
  inStockPatterns: string[];
  outOfStockPatterns: string[];
  /** CSS selector to scope text extraction to product cards instead of full body */
  productCardSelector?: string;
  /** Only consider a product card relevant if its text contains ALL of these substrings (case-insensitive) */
  titleMustContain?: string[];
  /** Pincode input config — if provided, the checker will enter the pincode before reading stock */
  pincode?: PincodeConfig;
};

export type AppConfig = {
  sites: SiteConfig[];
};

export type RuntimeConfig = {
  telegramBotToken?: string;
  telegramChatId?: string;
  pincodes: string[];
  checkIntervalMs: number;
  headless: boolean;
  stateFile: string;
  configFile: string;
  runOnce: boolean;
};

export type CheckResult = {
  siteId: string;
  siteName: string;
  url: string;
  status: StockStatus;
  matchedPattern?: string;
  title?: string;
  error?: string;
  checkedAt: string;
};

export type StoredState = {
  pages: Record<
    string,
    {
      status: StockStatus;
      matchedPattern?: string;
      title?: string;
      checkedAt: string;
      alertedAt?: string;
    }
  >;
};
