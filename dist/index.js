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
async function main() {
    console.log('OLX Scraper - Start');
    console.log('='.repeat(50));
    const targetUrl = process.env.TARGET_URL;
    if (!targetUrl)
        throw new Error('Brak TARGET_URL w pliku .env.');
    const maxPages = parseInt(process.env.MAX_PAGES || '3', 10);
    const maxAgeDays = parseNonNegativeInt(process.env.MAX_AGE_DAYS, 7);
    const requireElevator = process.env.REQUIRE_ELEVATOR !== 'false';
    const requireGarage = process.env.REQUIRE_GARAGE === 'true';
    const requireBalcony = process.env.REQUIRE_BALCONY === 'true';
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
        let filteredCount = 0;
        for (const flat of flats) {
            const analyzedFlat = analyzer.analyze(flat);
            db.updateFlat(analyzedFlat);
            if (excludedDistricts.some(district => sameDistrict(district, analyzedFlat.district))) {
                filteredCount++;
                continue;
            }
            if (excludedBuildingTypes.some(type => sameNormalizedValue(type, analyzedFlat.buildingType))) {
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
            if (requireElevator && analyzedFlat.hasElevator !== true) {
                filteredCount++;
                continue;
            }
            if (requireGarage && analyzedFlat.hasGarage !== true) {
                filteredCount++;
                continue;
            }
            if (requireBalcony && analyzedFlat.hasBalcony !== true) {
                filteredCount++;
                continue;
            }
            if (db.insertFlat(analyzedFlat)) {
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
        console.log(`Nowych: ${newCount}`);
        console.log(`Odfiltrowanych: ${filteredCount}`);
        console.log('='.repeat(50));
        db.cleanup(30);
    }
    catch (error) {
        console.error('Blad:', getErrorMessage(error));
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
function sameDistrict(left, right) {
    if (!right)
        return false;
    return sameNormalizedValue(left, right);
}
function sameNormalizedValue(left, right) {
    return right !== null && normalizeValue(left) === normalizeValue(right);
}
function normalizeValue(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pl-PL');
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
