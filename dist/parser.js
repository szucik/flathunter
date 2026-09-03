"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cheerio = __importStar(require("cheerio"));
class Parser {
    parseListingPage(html) {
        const $ = cheerio.load(html);
        const flats = [];
        $('[data-cy="l-card"]').each((index, element) => {
            try {
                const flat = this.parseCard($, element);
                if (flat)
                    flats.push(flat);
            }
            catch (error) {
                console.warn(`Blad parsowania karty ${index}:`, getErrorMessage(error));
            }
        });
        return flats;
    }
    parseDescriptionPage(html) {
        const $ = cheerio.load(html);
        const selectors = [
            '[data-cy="ad_description"]',
            '[data-testid="ad_description"]',
            '[data-testid="description"]'
        ];
        for (const selector of selectors) {
            const description = $(selector).first().text().trim();
            if (description)
                return description;
        }
        return null;
    }
    parseCard($, element) {
        const card = $(element);
        const url = card.find('a[data-testid="card-title-link"]').attr('href');
        if (!url)
            return null;
        const fullUrl = this.normalizeListingUrl(url.startsWith('http') ? url : `https://www.olx.pl${url}`);
        const title = card.find('a[data-testid="card-title-link"] h4').text().trim();
        const price = this.parsePrice(card.find('[data-testid="ad-price"]').text().trim());
        const paramsText = card.find('[data-testid="blueprint-card-param-icon"]').parent().text().trim();
        const params = this.parseParams(paramsText);
        const location = this.parseLocation(card.find('[data-testid="location-date"]').text().trim());
        return {
            source: 'unknown',
            url: fullUrl,
            title,
            description: null,
            price,
            rooms: this.parseRooms(`${title} ${paramsText}`),
            ...params,
            ...location,
            address: null,
            floor: null,
            totalFloors: null,
            ownershipType: null,
            rent: null,
            commission: null,
            listingStatus: null,
            buildingType: null,
            hasGarage: null,
            hasElevator: null,
            hasBalcony: null,
            buildYear: null
        };
    }
    parsePrice(priceText) {
        const match = priceText.match(/[\d\s]+/);
        return match ? parseInt(match[0].replace(/\s/g, ''), 10) : null;
    }
    normalizeListingUrl(value) {
        const url = new URL(value);
        url.search = '';
        url.hash = '';
        return url.toString();
    }
    parseParams(paramsText) {
        const areaMatch = paramsText.match(/([\d,]+)\s*m²/);
        const pricePerM2Match = paramsText.match(/([\d,.]+)\s*zł\/m²/);
        return {
            area: areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null,
            pricePerM2: pricePerM2Match ? parseFloat(pricePerM2Match[1].replace(',', '.')) : null
        };
    }
    parseRooms(text) {
        const match = text.match(/(\d{1,2})\s*(?:pokoje?|pok[óo]j)/i)
            || text.match(/(?:pokoje?|pok[óo]j|pomieszczenia)\s*[:\-]\s*(\d{1,2})/i);
        return match ? Number(match[1]) : null;
    }
    parseLocation(locationText) {
        const [locationPart = '', datePart = ''] = locationText.split(' - ');
        const locationParts = locationPart.split(', ');
        return {
            district: locationParts.length > 1 ? locationParts[1].trim() : null,
            createdAt: datePart || null,
            publishedAt: datePart && !/odświeżono|odswiezono/i.test(datePart) ? datePart : null,
            refreshedAt: datePart && /odświeżono|odswiezono/i.test(datePart) ? datePart : null
        };
    }
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
exports.default = Parser;
