# Real Estate Listing Scraper

A personal Node.js and TypeScript scraper for collecting apartment listings from OLX. It uses Playwright to load listing pages, Cheerio to parse listing cards, and SQLite to store the results locally.

The project is intended for personal apartment hunting. It currently implements the OLX adapter. Otodom support is planned but is not implemented yet.

The scraper uses a source adapter abstraction. Application code depends on the `ListingSource` contract instead of a specific website. Each future portal should have its own adapter and parser, while filtering, persistence, scheduling, and notifications remain shared.

## Features

- Scrapes multiple result pages from an OLX search URL.
- Extracts the listing URL, title, price, area, price per square meter, district, and displayed creation date.
- Filters listings by district, price, and minimum area.
- Stores listings in a local SQLite database.
- Avoids inserting the same URL more than once.
- Groups probable cross-portal duplicates into one property group while keeping each listing separate.
- Runs manually or on a schedule three times per day.
- Optionally sends newly saved listings to Telegram.
- Uses TypeScript with strict type checking.
- Keeps the browser headless by default.

## Requirements

- Node.js 20 or newer.
- npm.
- Chromium dependencies required by Playwright.
- Optional: the `sqlite3` command or DB Browser for SQLite for inspecting the database.

Check your installed versions:

```bash
node --version
npm --version
```

## Installation

Clone or open the project, then install dependencies:

```bash
npm install
```

Install the Playwright Chromium browser and its Linux dependencies:

```bash
npx playwright install --with-deps chromium
```

If the system does not allow installing operating-system packages, ask an administrator to install the missing dependencies, or install Chromium dependencies separately for your Linux distribution.

## Configuration

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Then edit `.env`:

```dotenv
# OLX search URL. Build this URL in your browser using the desired filters.
TARGET_URL=https://www.olx.pl/nieruchomosci/mieszkania/sprzedaz/warszawa/

# Optional application-level filters
ALLOWED_DISTRICTS=Bemowo,Ochota,Targówek,Bielany,Mokotów
EXCLUDED_DISTRICTS=Ursus,Białołęka,Wawer
EXCLUDED_BUILDING_TYPES=wielka plyta
MIN_PRICE=700000
MAX_PRICE=1200000
MIN_AREA=55

# Scraping settings
HEADLESS=true
MAX_PAGES=3
REQUEST_DELAY=2000
MAX_AGE_DAYS=7
REQUIRE_ELEVATOR=true
REQUIRE_GARAGE=false
REQUIRE_BALCONY=false

# Optional Telegram notifications for new listings
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=
```

### Configuration variables

| Variable | Required | Description | Default |
|---|---:|---|---:|
| `TARGET_URL` | Yes | OLX search results URL | none |
| `ALLOWED_DISTRICTS` | No | Comma-separated list of accepted districts | all |
| `EXCLUDED_DISTRICTS` | No | Comma-separated list of rejected districts | `Ursus,Białołęka,Wawer` |
| `EXCLUDED_BUILDING_TYPES` | No | Comma-separated list of rejected building types | `wielka plyta` |
| `MIN_PRICE` | No | Minimum price in PLN | `0` |
| `MAX_PRICE` | No | Maximum price in PLN | no practical limit |
| `MIN_AREA` | No | Minimum area in square meters | `0` |
| `HEADLESS` | No | Set to `false` to show Chromium | `true` |
| `MAX_PAGES` | No | Number of result pages to visit | `3` |
| `REQUEST_DELAY` | No | Base delay between pages in milliseconds | `2000` |
| `MAX_AGE_DAYS` | No | Maximum age of a listing, measured from the OLX displayed date | `7` |
| `REQUIRE_ELEVATOR` | No | Keep only listings where an elevator is explicitly detected | `true` |
| `REQUIRE_GARAGE` | No | Keep only listings where a garage or parking place is explicitly detected | `false` |
| `REQUIRE_BALCONY` | No | Keep only listings where a balcony, loggia, or terrace is explicitly detected | `false` |
| `TELEGRAM_TOKEN` | No | Bot token from BotFather | empty |
| `TELEGRAM_CHAT_ID` | No | Target chat or user ID | empty |

`TARGET_URL` should be a URL for the search and sorting options you want. The scraper adds `page=2`, `page=3`, and so on for subsequent pages.

## Commands

### Development run

Runs the TypeScript entrypoint directly with `tsx`:

```bash
npm run dev
```

### Type checking

Checks the project without creating output files:

```bash
npm run typecheck
```

### Build

Compiles TypeScript from `src/` to JavaScript in `dist/`:

```bash
npm run build
```

### Run the compiled scraper once

```bash
npm start
```

This command loads `.env`, scrapes the configured pages, applies filters, and writes accepted listings to `data/flats.db`.

### Telegram notifications

To receive new listings in Telegram:

1. Create a bot with `@BotFather` and copy its token to `TELEGRAM_TOKEN`.
2. Open a conversation with the bot and send it at least one message.
3. Find your chat ID using Telegram's `getUpdates` endpoint or a trusted bot that displays chat IDs.
4. Set `TELEGRAM_CHAT_ID` in `.env`.
5. Run the scraper normally with `npm start` or `npm run scheduler`.

Only listings that are newly inserted into the database trigger a notification. Telegram errors are logged and do not stop the scraper.

### Run the scheduler

Build first, then start the scheduler:

```bash
npm run build
npm run scheduler
```

The scheduler runs the scraper every day at:

- 08:00
- 14:00
- 20:00

The scheduler process must remain running. Press `Ctrl+C` to stop it. For reliable unattended operation, run it under `systemd`, Docker, or another process manager.

### Test command

```bash
npm test
```

This runs the TypeScript type check and the scheduler tests. The scheduler tests verify the cron expression, prevent overlapping runs, and allow a new run after a failed job. They use a fake scheduler callback, so they do not wait for a real clock interval. Unit tests for the parser and database are not implemented yet.

## Viewing collected listings

The database is stored at:

```text
data/flats.db
```

Show the number of saved listings:

```bash
sqlite3 data/flats.db "SELECT COUNT(*) FROM flats;"
```

Show the newest listings:

```bash
sqlite3 data/flats.db \
  "SELECT title, price, area, district, url FROM flats ORDER BY scraped_at DESC LIMIT 20;"
```

For a more readable interactive view:

```bash
sqlite3 data/flats.db
```

Then run:

```sql
.headers on
.mode column
SELECT title, price, area, district, url
FROM flats
ORDER BY scraped_at DESC;
.quit
```

You can also open `data/flats.db` with DB Browser for SQLite.

## Database schema

The `flats` table currently contains:

- `url`: unique listing URL.
- `title`: listing title.
- `price`: price in PLN.
- `area`: area in square meters.
- `rooms`: detected number of rooms.
- `price_per_m2`: price per square meter.
- `district`: parsed district name.
- `created_at`: date text displayed by OLX.
- `description`: text collected from the listing detail page for new listings.
- `building_type`: detected type such as `wielka plyta`, `cegla`, or `kamienica`.
- `has_garage`, `has_elevator`, `has_balcony`: detected boolean values.
- `build_year`: detected construction year.
- `property_group_id`: identifier of a probable matching property across portals.
- `scraped_at`: local database insertion timestamp.

The database file and logs are ignored by Git. The `.env` file is also ignored and must not be committed.

## Project structure

```text
.
├── data/
│   └── flats.db                 # Local SQLite database
├── dist/                        # Generated JavaScript, created by npm run build
├── logs/                        # Local logs
├── src/
│   ├── browser.ts               # Playwright browser lifecycle
│   ├── database.ts              # SQLite persistence
│   ├── index.ts                 # Application entrypoint and filtering
│   ├── parser.ts                # OLX listing parser
│   ├── scheduler.ts             # 08:00, 14:00, 20:00 schedule
│   ├── scraper.ts               # OLX ListingSource adapter
│   ├── telegram-notifier.ts     # Telegram notification channel
│   └── types.ts                 # Shared TypeScript types
├── .env.example                 # Configuration template
├── package.json                 # Dependencies and npm scripts
└── tsconfig.json                # TypeScript compiler configuration
```

## How the application works

1. `src/index.ts` reads configuration from `.env`.
2. `src/scraper.ts` launches Chromium and visits the configured OLX pages.
3. `src/parser.ts` extracts listing data from the HTML.
4. New listings are opened once to collect their descriptions.
5. `src/listing-analyzer.ts` detects building type, garage, elevator, balcony, and construction year.
6. `src/index.ts` applies district, price, area, and excluded-district filters.
7. `src/database.ts` inserts new URLs into SQLite.
8. A new listing is compared with listings from other sources and may be assigned to a property group.
9. Listings older than 30 days, based on `scraped_at`, are removed.

The analyzer uses rules and Polish keywords, not an AI model yet. A value of `null` means that the listing does not provide enough information. It does not mean that the feature is absent. This is important for decisions such as requiring an elevator.

## Cross-portal duplicate detection

Listings are never deleted when a probable duplicate is found. OLX and Otodom listings remain separate rows, so their different prices, titles, and URLs are preserved. The matcher only considers listings from different sources and assigns a group when the score is at least 75/100.

The score uses:

- matching district,
- area difference of at most 1.5 square meters,
- matching room count,
- matching construction year,
- overlapping meaningful words in the title and description.

Known, different districts immediately prevent a match. A group is a probable match, not a legal or factual guarantee; verify the address and photos before making a decision.

## Adding another website

Create a new class that implements `ListingSource` from `src/types.ts`:

```typescript
import type { Flat, ListingSource } from './types';

class OtodomSource implements ListingSource {
  readonly name = 'otodom';

  async scrape(targetUrl: string, maxPages = 3): Promise<Flat[]> {
    // Use Otodom-specific navigation and parsing here.
    return [];
  }
}
```

The new adapter should own only website-specific concerns:

- URL and pagination rules,
- selectors or API response parsing,
- website-specific field normalization,
- website-specific errors and rate limits.

Do not copy filtering or database logic into the adapter. Register the selected source in `src/index.ts`, or later run a list of sources through the same application workflow.

## Troubleshooting

### Playwright cannot launch Chromium

Typical error:

```text
error while loading shared libraries: libnspr4.so
```

Install Chromium and its dependencies again:

```bash
npx playwright install --with-deps chromium
```

### No listings are found

Check the following:

- `TARGET_URL` opens correctly in a normal browser.
- The search still contains results.
- The OLX page structure has not changed.
- Your configured filters are not excluding every result.
- The scraper is using a URL that belongs to OLX, not Otodom.

### The scheduler appears to do nothing

That is expected between scheduled times. It is a long-running process that waits for 08:00, 14:00, or 20:00. Start it with:

```bash
npm run build
npm run scheduler
```

### The same listing is not shown as new

The database uses the listing URL as a unique key. An already stored URL is ignored. The current implementation does not yet maintain a price-change history for existing listings.

## Responsible use

Use this project only for personal, low-volume collection and respect the target websites' terms of use and `robots.txt` rules. Do not bypass CAPTCHA, authentication, rate limits, or other access controls. Do not redistribute scraped listing content or personal data. Keep request rates low and stop the scraper if the website blocks or rejects the requests.

The scraper is not an official OLX or Otodom integration. Website markup, URLs, and access rules can change at any time.

## License

This project does not currently declare a production license. Treat it as private project code unless a license is added.
