# PS5 Stock Notifier India

Browser-based PS5 stock notifier for Indian retailers. It checks configured retailer pages, remembers the last known state, and sends a Telegram alert only when a page changes to in stock.

## Why This Setup

- Uses Playwright because Amazon, Flipkart, Croma, Reliance Digital, Vijay Sales, and quick-commerce pages often render stock text with JavaScript.
- Uses Telegram because alerts arrive quickly on mobile and the Bot API is simple.
- Uses config files for retailer URLs and keywords so you can update selectors without changing code.
- Stores state locally to avoid repeated duplicate alerts.

## Setup

```powershell
cd D:\Coding-Workspace\typescript\ps5-stock-notifier-india
npm.cmd install
npm.cmd run install:browsers
Copy-Item .env.example .env
```

Create a Telegram bot with `@BotFather`, put the token in `.env`, then get your chat id using:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

Send your bot one message first, then open that URL in a browser and copy `message.chat.id` into `TELEGRAM_CHAT_ID`.

## Run

```powershell
npm.cmd run dev
```

One-time smoke test:

```powershell
$env:RUN_ONCE="true"
npm.cmd run dev
```

For long-running use on Windows:

```powershell
npm.cmd install -g pm2
pm2 start "npm.cmd" --name ps5-stock -- run dev
pm2 logs ps5-stock
```

## Configure Retailers

Edit `config/sites.json`.

The default config uses search/listing URLs because individual PS5 URLs change often in India. For highest reliability, add direct product URLs whenever you find them. Direct product pages produce fewer false positives than search pages.

Use your Rajkot pincode in `.env`:

```env
PINCODE=360001
```

Some sites require a logged-in session or app-only location state. Blinkit is the hardest one to automate reliably from a browser, so it is disabled by default. Enable it only after you add a direct product URL or a browser profile/session that already has your Rajkot location saved.

## Alert Logic

The checker marks a page:

- `in_stock` when any in-stock phrase appears and no stronger out-of-stock phrase appears.
- `out_of_stock` when out-of-stock phrases appear.
- `unknown` when the page loads but stock state is unclear.

Only transitions into `in_stock` trigger Telegram alerts.

## Responsible Use

Keep intervals reasonable. `CHECK_INTERVAL_SECONDS=60` is a good default. Lower values can cause retailer blocking and unreliable results.
