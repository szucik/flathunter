import Browser from './browser';
import Parser from './parser';
import type { Flat, ListingSource } from './types';
import { isWithinAge } from './listing-date';

class OlxScraper implements ListingSource {
    readonly name = 'olx';
    private readonly browser = new Browser();
    private readonly parser = new Parser();

    async scrape(targetUrl: string, maxPages = 3, knownUrls: ReadonlySet<string> = new Set(), maxAgeDays = 7): Promise<Flat[]> {
        await this.browser.launch();
        const page = await this.browser.newPage();
        const allFlats: Flat[] = [];

        try {
            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                const pageUrl = pageNum === 1
                    ? targetUrl
                    : `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}page=${pageNum}`;

                console.log(`Scrapuje strone ${pageNum}: ${pageUrl}`);
                await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('[data-cy="l-card"]', { timeout: 10000 });

                const flats = this.parser.parseListingPage(await page.content())
                    .map(flat => ({ ...flat, source: this.name }));
                const newFlats = flats
                    .filter(flat => isWithinAge(flat.createdAt, maxAgeDays))
                    .filter(flat => !allFlats.some(existing => existing.url === flat.url));
                allFlats.push(...newFlats);
                console.log(`Znaleziono ${newFlats.length} unikalnych ogloszen na stronie ${pageNum}`);

                for (const flat of newFlats) {
                    const details = await this.fetchDetails(page, flat.url);
                    Object.assign(flat, details, { imageUrl: flat.imageUrl ?? details.imageUrl ?? null });
                }

                if (pageNum < maxPages) {
                    await this.randomDelay(parseInt(process.env.REQUEST_DELAY || '2000', 10));
                }
            }

            console.log(`Lacznie znaleziono ${allFlats.length} ogloszen`);
            return allFlats;
        } catch (error) {
            console.error('Blad podczas scrapowania:', getErrorMessage(error));
            throw error;
        } finally {
            await this.browser.close();
        }
    }

    private async fetchDetails(page: import('playwright').Page, url: string): Promise<Partial<Flat>> {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.dismissCookieConsent(page);
            await page.waitForSelector(
                '[data-sentry-component="AdDetailsBase"], [data-cy="ad_description"], [data-cy="adPageAdDescription"], [data-testid="ad_description"]',
                { timeout: 15000 }
            );
            return this.parser.parseDetailPage(await page.content());
        } catch (error) {
            console.warn(`Nie udalo sie pobrac opisu ${url}:`, getErrorMessage(error));
            return {};
        }
    }

    // Otodom/OLX pokazują baner CMP, który przesłania treść i blokuje waitForSelector.
    private async dismissCookieConsent(page: import('playwright').Page): Promise<void> {
        const consentButton = page.getByRole('button', { name: 'Akceptuj wszystkie' });
        try {
            await consentButton.click({ timeout: 3000 });
        } catch {
            // Baner nie pojawił się lub już został zamknięty - nic do zrobienia.
        }
    }

    private async randomDelay(baseDelay: number): Promise<void> {
        const randomFactor = 0.5 + Math.random();
        await new Promise(resolve => setTimeout(resolve, baseDelay * randomFactor));
    }
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default OlxScraper;