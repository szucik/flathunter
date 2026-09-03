"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_extra_1 = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");
playwright_extra_1.chromium.use(stealth());
class Browser {
    browser = null;
    context = null;
    async launch() {
        console.log('Uruchamiam przegladarke z stealth mode...');
        this.browser = await playwright_extra_1.chromium.launch({
            headless: process.env.HEADLESS !== 'false',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage'
            ]
        });
        this.context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'pl-PL',
            timezoneId: 'Europe/Warsaw',
            permissions: [],
            extraHTTPHeaders: {
                'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        await this.context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        console.log('Przegladarka uruchomiona');
    }
    async newPage() {
        if (!this.context) {
            throw new Error('Przegladarka nie zostala uruchomiona.');
        }
        const page = await this.context.newPage();
        await page.route('**/*', route => {
            const resourceType = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                return route.abort();
            }
            return route.continue();
        });
        return page;
    }
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            console.log('Przegladarka zamknieta');
        }
    }
}
exports.default = Browser;
