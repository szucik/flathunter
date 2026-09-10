"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const scraper_1 = __importDefault(require("./scraper"));
const database_1 = __importDefault(require("./database"));
const listing_analyzer_1 = __importDefault(require("./listing-analyzer"));
const property_matcher_1 = __importDefault(require("./property-matcher"));
const telegram_notifier_1 = __importDefault(require("./telegram-notifier"));
const listing_filters_1 = require("./listing-filters");
async function main() {
    console.log('OLX Scraper - Start');
    console.log('='.repeat(50));
    const targetUrl = process.env.TARGET_URL;
    if (!targetUrl)
        throw new Error('Brak TARGET_URL w pliku .env.');
    const maxPages = parseInt(process.env.MAX_PAGES || '3', 10);
    const maxAgeDays = parseNonNegativeInt(process.env.MAX_AGE_DAYS, 7);
    const requireElevator = process.env.REQUIRE_ELEVATOR !== 'false';
    const requireGarage = process.env.REQUIRE_GARAGE !== 'false';
    const requireBalcony = process.env.REQUIRE_BALCONY !== 'false';
    const allowedDistricts = parseList(process.env.ALLOWED_DISTRICTS);
    const excludedDistricts = parseList(process.env.EXCLUDED_DISTRICTS || 'Ursus,Białołęka,Wawer');
    const excludedBuildingTypes = parseList(process.env.EXCLUDED_BUILDING_TYPES || 'wielka plyta');
    const minPrice = parseInt(process.env.MIN_PRICE || '0', 10);
    const maxPrice = parseInt(process.env.MAX_PRICE || String(Number.MAX_SAFE_INTEGER), 10);
    const minArea = parseInt(process.env.MIN_AREA || '0', 10);
    const source = new scraper_1.default();
    const analyzer = new listing_analyzer_1.default();
    const matcher = new property_matcher_1.default();
    const notifier = createNotifier();
    const db = new database_1.default();
    const scrapeRunId = db.startScrapeRun(source.name);
    try {
        console.log(`URL: ${targetUrl}`);
        console.log(`Max stron: ${maxPages}`);
        console.log(`Maksymalny wiek ofert: ${maxAgeDays} dni`);
        console.log(`Winda wymagana: ${requireElevator ? 'tak' : 'nie'}`);
        console.log(`Garaz wymagany: ${requireGarage ? 'tak' : 'nie'}`);
        console.log(`Balkon wymagany: ${requireBalcony ? 'tak' : 'nie'}`);
        console.log(`Dozwolone dzielnice: ${allowedDistricts.join(', ')}`);
        console.log(`Cena: ${minPrice} - ${maxPrice} zl`);
        console.log(`Min metraz: ${minArea} m2`);
        console.log(`Zrodlo: ${source.name}`);
        const knownUrls = new Set(db.getAllUrls());
        const flats = await source.scrape(targetUrl, maxPages, knownUrls, maxAgeDays);
        const storedFlats = db.getAllFlats();
        let newCount = 0;
        let uncertainCount = 0;
        let rejectedCount = 0;
        let acceptedCount = 0;
        for (const flat of flats) {
            const analyzedFlat = analyzer.analyze(flat);
            const matchesFilters = (0, listing_filters_1.matchesConfiguredFilters)(analyzedFlat);
            const uncertain = !matchesFilters && (0, listing_filters_1.isUncertainListing)(analyzedFlat);
            if (!matchesFilters && !uncertain) {
                rejectedCount++;
                const rejectionReason = (0, listing_filters_1.getRejectionReasons)(analyzedFlat).join(', ');
                const rejectedFlat = { ...analyzedFlat, rejectionReason, uncertaintyReason: null };
                db.updateFlat(rejectedFlat);
                db.insertFlat(rejectedFlat);
                const savedRejected = db.getFlatByUrl(analyzedFlat.url);
                if (savedRejected)
                    db.setRejectionReason(savedRejected.id, rejectionReason);
                continue;
            }
            const uncertaintyReason = uncertain ? (0, listing_filters_1.getUncertaintyReasons)(analyzedFlat).join(', ') : null;
            const acceptedFlat = { ...analyzedFlat, rejectionReason: null, uncertaintyReason };
            db.updateFlat(acceptedFlat);
            const inserted = db.insertFlat(acceptedFlat);
            if (uncertain) {
                uncertainCount++;
                continue;
            }
            acceptedCount++;
            if (inserted) {
                const savedFlat = db.getFlatByUrl(analyzedFlat.url);
                if (savedFlat) {
                    const match = matcher.findBestMatch(analyzedFlat, storedFlats);
                    if (match) {
                        const groupId = db.getPropertyGroupId(match.flat.id) ?? db.createPropertyGroup();
                        db.assignPropertyGroup(match.flat.id, groupId);
                        db.assignPropertyGroup(savedFlat.id, groupId);
                        console.log(`Mozliwe powiazanie z ${match.flat.source} (zgodnosc: ${match.score}/100)`);
                    }
                    storedFlats.push(savedFlat);
                }
                newCount++;
                printFlat(analyzedFlat);
                await notify(notifier, analyzedFlat);
            }
        }
        console.log('='.repeat(50));
        console.log(`Znaleziono: ${flats.length}`);
        console.log(`Zaakceptowanych: ${acceptedCount}`);
        console.log(`Niepewnych: ${uncertainCount}`);
        console.log(`Odrzuconych: ${rejectedCount}`);
        console.log(`Nowych zaakceptowanych: ${newCount}`);
        console.log('='.repeat(50));
        db.cleanup(30);
        db.completeScrapeRun(scrapeRunId, flats.length);
    }
    catch (error) {
        console.error('Blad:', getErrorMessage(error));
        db.failScrapeRun(scrapeRunId, getErrorMessage(error));
        throw error;
    }
    finally {
        db.close();
    }
}
function createNotifier() {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    return token && chatId ? new telegram_notifier_1.default(token, chatId) : null;
}
async function notify(notifier, flat) {
    if (!notifier)
        return;
    try {
        await notifier.sendNewListing(flat);
        console.log('Powiadomienie Telegram wyslane.');
    }
    catch (error) {
        console.error('Nie udalo sie wyslac powiadomienia Telegram:', getErrorMessage(error));
    }
}
function parseList(value) {
    return (value || '').split(',').map(item => item.trim()).filter(Boolean);
}
function parseNonNegativeInt(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
function printFlat(flat) {
    console.log(`NOWE: ${flat.title}`);
    console.log(`   ${flat.price ?? '-'} zl | ${flat.area ?? '-'} m2 | ${flat.district ?? '-'}`);
    console.log(`   ${flat.url}`);
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
exports.default = main;
if (require.main === module) {
    main().catch(() => {
        process.exitCode = 1;
    });
}
