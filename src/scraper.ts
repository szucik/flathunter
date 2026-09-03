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
                await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
                await page.waitForSelector('[data-cy="l-card"]', { timeout: 10000 });

                const flats = this.parser.parseListingPage(await page.content())
                    .map(flat => ({ ...flat, source: this.name }));
                const newFlats = flats
                    .filter(flat => isWithinAge(flat.createdAt, maxAgeDays))
                    .filter(flat => !allFlats.some(existing => existing.url === flat.url));
                allFlats.push(...newFlats);
                console.log(`Znaleziono ${newFlats.length} unikalnych ogloszen na stronie ${pageNum}`);

                for (const flat of newFlats.filter(item => !knownUrls.has(item.url))) {
                    flat.description = await this.fetchDescription(page, flat.url);
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

    private async fetchDescription(page: import('playwright').Page, url: string): Promise<string | null> {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return this.parser.parseDescriptionPage(await page.content());
        } catch (error) {
            console.warn(`Nie udalo sie pobrac opisu ${url}:`, getErrorMessage(error));
            return null;
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