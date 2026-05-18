export type StockStatus = "in_stock" | "out_of_stock" | "unknown" | "error";

export type SiteConfig = {
  id: string;
  name: string;
  enabled: boolean;
  urls: string[];
  inStockPatterns: string[];
  outOfStockPatterns: string[];
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
