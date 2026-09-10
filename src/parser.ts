import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { Flat } from './types';

class Parser {
    parseListingPage(html: string): Flat[] {
        const $ = cheerio.load(html);
        const flats: Flat[] = [];

        $('[data-cy="l-card"]').each((index, element) => {
            try {
                const flat = this.parseCard($, element);
                if (flat) flats.push(flat);
            } catch (error) {
                console.warn(`Blad parsowania karty ${index}:`, getErrorMessage(error));
            }
        });

        return flats;
    }

    parseDescriptionPage(html: string): string | null {
        const $ = cheerio.load(html);
        const selectors = [
            '[data-cy="ad_description"]',
            '[data-cy="adPageAdDescription"]',
            '[data-testid="ad_description"]',
            '[data-testid="description"]'
        ];

        for (const selector of selectors) {
            const descriptionElement = $(selector).first().clone();
            descriptionElement.find('script, style, noscript').remove();
            const description = descriptionElement.text().trim();
            if (isPollutedDescription(description)) continue;
            if (description) return description;
        }

        return null;
    }

    parseDetailPage(html: string): Partial<Flat> {
        const $ = cheerio.load(html);
        const details = new Map<string, string>();

        $('[data-sentry-element="ItemGridContainer"]').each((_index, element) => {
            const items = $(element).children('div');
            const label = items.eq(0).text().replace(':', '').trim();
            const value = items.eq(1).text().trim();
            if (label && value) details.set(label, value);
        });

        const detailText = $('[data-sentry-component="AdDetailsBase"]').text().toLocaleLowerCase('pl-PL');
        const floor = this.parseFloorValue(details.get('Piętro') || '');
        const buildingMaterial = details.get('Materiał budynku') || '';
        const buildingType = details.get('Rodzaj zabudowy') || null;
        const embeddedMaterial = this.readEmbeddedAttribute(html, 'building_material');
        const embeddedBuildYear = this.readEmbeddedNumber(html, 'build_year');
        const embeddedTotalFloors = this.readEmbeddedNumber(html, 'building_floors_num');
        const detailGarage = this.parseBoolean(details.get('Garaż'));
        const ogImage = $('meta[property="og:image"]').attr('content');

        return {
            description: this.parseDescriptionPage(html),
            imageUrl: isUsableImageUrl(ogImage) ? normalizeImageUrl(ogImage) : null,
            area: this.parseNumber(details.get('Powierzchnia') || ''),
            rooms: this.parseNumber(details.get('Liczba pokoi') || ''),
            floor: floor.floor,
            totalFloors: this.parseNumber(details.get('Liczba pięter') || '') ?? floor.totalFloors ?? embeddedTotalFloors,
            rent: this.parseNumber(details.get('Czynsz') || ''),
            ownershipType: details.get('Forma własności') || null,
            marketType: details.get('Rynek') || null,
            buildYear: this.parseNumber(details.get('Rok budowy') || '') ?? embeddedBuildYear,
            buildingType: /wielka płyta|wielkiej płyty|concrete_plate/i.test(`${buildingMaterial} ${embeddedMaterial}`)
                ? 'wielka plyta'
                : buildingType,
            hasElevator: this.parseBoolean(details.get('Winda'))
                ?? (detailText ? (/winda\s*:?\s*tak/.test(detailText) ? true : null) : null),
            hasGarage: detailGarage ?? this.parseGarageText(detailText),
            hasParkingSpace: this.parseParkingText(detailText),
            hasStorageUnit: /komórka lokatorska|komorka lokatorska/i.test(detailText) ? true : null,
            hasBasement: /piwnica|pomieszczenie piwniczne/i.test(detailText) ? true : null,
            hasBalcony: /balkon|loggia|taras/.test(detailText) ? true : null
            ,hasGarden: /ogródek|ogrodek/.test(detailText) ? true : null
        };
    }

    private parseCard($: cheerio.CheerioAPI, element: Element): Flat | null {
        const card = $(element);
        const url = card.find('a[data-testid="card-title-link"]').attr('href');
        if (!url) return null;

        const fullUrl = this.normalizeListingUrl(url.startsWith('http') ? url : `https://www.olx.pl${url}`);
        const imageUrl = this.parseImageUrl(card);
        const title = card.find('a[data-testid="card-title-link"] h4').text().trim();
        const price = this.parsePrice(card.find('[data-testid="ad-price"]').text().trim());
        const paramsText = card.find('[data-testid="blueprint-card-param-icon"]').parent().text().trim();
        const params = this.parseParams(paramsText);
        const location = this.parseLocation(card.find('[data-testid="location-date"]').text().trim());

        return {
            source: 'unknown',
            url: fullUrl,
            imageUrl,
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
            hasGarden: null,
            buildYear: null
        };
    }

    private parseImageUrl(card: cheerio.Cheerio<Element>): string | null {
        let imageUrl: string | null = null;
        card.find('img').each((index) => {
            if (imageUrl) return;
            const image = card.find('img').eq(index);
            const srcset = image.attr('srcset')?.split(',')[0]?.trim().split(/\s+/)[0];
            const candidates = [image.attr('data-src'), image.attr('data-lazy-src'), srcset, image.attr('src')];
            const source = candidates.find(value => isUsableImageUrl(value));
            if (source) imageUrl = normalizeImageUrl(source);
        });

        return imageUrl;
    }

    private parsePrice(priceText: string): number | null {
        const match = priceText.match(/[\d\s]+/);
        return match ? parseInt(match[0].replace(/\s/g, ''), 10) : null;
    }

    private normalizeListingUrl(value: string): string {
        const url = new URL(value);
        url.search = '';
        url.hash = '';
        return url.toString();
    }

    private parseParams(paramsText: string): Pick<Flat, 'area' | 'pricePerM2'> {
        const areaMatch = paramsText.match(/([\d,]+)\s*m²/);
        const pricePerM2Match = paramsText.match(/([\d,.]+)\s*zł\/m²/);

        return {
            area: areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null,
            pricePerM2: pricePerM2Match ? parseFloat(pricePerM2Match[1].replace(',', '.')) : null
        };
    }

    private parseRooms(text: string): number | null {
        const match = text.match(/(\d{1,2})\s*-?\s*pok(?:[óo]j(?:e|i|owy|owe|ów)?|\.?)?(?![a-z])/i)
            || text.match(/(?:pokoje?|pok[óo]j|pomieszczenia)\s*[:\-]\s*(\d{1,2})/i);
        return match ? Number(match[1]) : null;
    }

    private parseFloorValue(value: string): { floor: number | null; totalFloors: number | null } {
        const match = value.match(/(\d+)\s*\/\s*(\d+)/);
        return {
            floor: match ? Number(match[1]) : null,
            totalFloors: match ? Number(match[2]) : null
        };
    }

    private parseNumber(value: string): number | null {
        const match = value.match(/[\d\s]+(?:[,\.]\d+)?/);
        return match ? Number(match[0].replace(/\s/g, '').replace(',', '.')) : null;
    }

    private parseBoolean(value: string | undefined): boolean | null {
        if (!value) return null;
        if (/^tak$/i.test(value.trim())) return true;
        if (/^nie$/i.test(value.trim())) return false;
        return null;
    }

    private parseGarageText(text: string): boolean | null {
        if (/ogólnodostępne miejsca parkingowe|publiczny parking|garaż\s*\/\s*miejsce parkingowe|garaz\s*\/\s*miejsce parkingowe/i.test(text)) {
            return false;
        }
        if (/garaż podziemny|garaz podziemny|miejsce postojowe w garażu|miejsce postojowe w garazu/i.test(text)) {
            return true;
        }
        return null;
    }

    private parseParkingText(text: string): boolean | null {
        if (/garaż podziemny|garaz podziemny|miejsce postojowe|miejsce parkingowe|parking podziemny/i.test(text)) return true;
        if (/bez miejsca postojowego|brak miejsca postojowego|ogólnodostępne miejsca parkingowe|publiczny parking/i.test(text)) return false;
        return null;
    }

    private readEmbeddedAttribute(html: string, name: string): string | null {
        const match = html.match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`));
        return match?.[1] || null;
    }

    private readEmbeddedNumber(html: string, name: string): number | null {
        const value = this.readEmbeddedAttribute(html, name);
        return value ? Number(value) : null;
    }

    private parseLocation(locationText: string): Pick<Flat, 'district' | 'createdAt' | 'publishedAt' | 'refreshedAt'> {
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

function isUsableImageUrl(value: string | undefined): value is string {
    return Boolean(value && /^https?:\/\//i.test(value) && !/no_thumbnail|placeholder/i.test(value));
}

function normalizeImageUrl(value: string): string {
    return value.startsWith('//') ? `https:${value}` : value;
}

function isPollutedDescription(value: string): boolean {
    return /\.css-[\w-]+\s*\{|--font(?:Size|Family|Weight)|line-height:\s*var\(/i.test(value);
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default Parser;