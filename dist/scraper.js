"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const browser_1 = __importDefault(require("./browser"));
const parser_1 = __importDefault(require("./parser"));
const listing_date_1 = require("./listing-date");
class OlxScraper {
    name = 'olx';
    browser = new browser_1.default();
    parser = new parser_1.default();
    async scrape(targetUrl, maxPages = 3, knownUrls = new Set(), maxAgeDays = 7) {
        await this.browser.launch();
        const page = await this.browser.newPage();
        const allFlats = [];
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
                    .filter(flat => (0, listing_date_1.isWithinAge)(flat.createdAt, maxAgeDays))
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
        }
        catch (error) {
            console.error('Blad podczas scrapowania:', getErrorMessage(error));
            throw error;
        }
        finally {
            await this.browser.close();
        }
    }
    async fetchDescription(page, url) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return this.parser.parseDescriptionPage(await page.content());
        }
        catch (error) {
            console.warn(`Nie udalo sie pobrac opisu ${url}:`, getErrorMessage(error));
            return null;
        }
    }
    async randomDelay(baseDelay) {
        const randomFactor = 0.5 + Math.random();
        await new Promise(resolve => setTimeout(resolve, baseDelay * randomFactor));
    }
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
exports.default = OlxScraper;
