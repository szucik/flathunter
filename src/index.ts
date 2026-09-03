import 'dotenv/config';
import OlxScraper from './scraper';
import FlatsDatabase from './database';
import ListingAnalyzer from './listing-analyzer';
import type { Flat, ListingSource } from './types';

async function main(): Promise<void> {
    console.log('OLX Scraper - Start');
    console.log('='.repeat(50));

    const targetUrl = process.env.TARGET_URL;
    if (!targetUrl) throw new Error('Brak TARGET_URL w pliku .env.');

    const maxPages = parseInt(process.env.MAX_PAGES || '3', 10);
    const maxAgeDays = parseNonNegativeInt(process.env.MAX_AGE_DAYS, 7);
    const allowedDistricts = parseList(process.env.ALLOWED_DISTRICTS);
    const excludedDistricts = parseList(process.env.EXCLUDED_DISTRICTS || 'Ursus,Białołęka');
    const minPrice = parseInt(process.env.MIN_PRICE || '0', 10);
    const maxPrice = parseInt(process.env.MAX_PRICE || String(Number.MAX_SAFE_INTEGER), 10);
    const minArea = parseInt(process.env.MIN_AREA || '0', 10);
    const source: ListingSource = new OlxScraper();
    const analyzer = new ListingAnalyzer();
    const db = new FlatsDatabase();

    try {
        console.log(`URL: ${targetUrl}`);
        console.log(`Max stron: ${maxPages}`);
        console.log(`Maksymalny wiek ofert: ${maxAgeDays} dni`);
        console.log(`Dozwolone dzielnice: ${allowedDistricts.join(', ')}`);
        console.log(`Cena: ${minPrice} - ${maxPrice} zl`);
        console.log(`Min metraz: ${minArea} m2`);

        console.log(`Zrodlo: ${source.name}`);
        const knownUrls = new Set(db.getAllUrls());
        const flats = await source.scrape(targetUrl, maxPages, knownUrls, maxAgeDays);
        let newCount = 0;
        let filteredCount = 0;

        for (const flat of flats) {
            const analyzedFlat = analyzer.analyze(flat);
            if (excludedDistricts.includes(analyzedFlat.district || '')) {
                filteredCount++;
                continue;
            }
            if (allowedDistricts.length > 0 && !allowedDistricts.includes(analyzedFlat.district || '')) {
                filteredCount++;
                continue;
            }
            if (analyzedFlat.price !== null && (analyzedFlat.price < minPrice || analyzedFlat.price > maxPrice)) {
                filteredCount++;
                continue;
            }
            if (analyzedFlat.area !== null && analyzedFlat.area < minArea) {
                filteredCount++;
                continue;
            }

            if (db.insertFlat(analyzedFlat)) {
                newCount++;
                printFlat(analyzedFlat);
            }
        }

        console.log('='.repeat(50));
        console.log(`Znaleziono: ${flats.length}`);
        console.log(`Nowych: ${newCount}`);
        console.log(`Odfiltrowanych: ${filteredCount}`);
        console.log('='.repeat(50));
        db.cleanup(30);
    } catch (error) {
        console.error('Blad:', getErrorMessage(error));
        throw error;
    } finally {
        db.close();
    }
}

function parseList(value: string | undefined): string[] {
    return (value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function printFlat(flat: Flat): void {
    console.log(`NOWE: ${flat.title}`);
    console.log(`   ${flat.price ?? '-'} zl | ${flat.area ?? '-'} m2 | ${flat.district ?? '-'}`);
    console.log(`   ${flat.url}`);
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default main;

if (require.main === module) {
    main().catch(() => {
        process.exitCode = 1;
    });
}