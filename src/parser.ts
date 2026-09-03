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
            '[data-testid="ad_description"]',
            '[data-testid="description"]'
        ];

        for (const selector of selectors) {
            const description = $(selector).first().text().trim();
            if (description) return description;
        }

        return null;
    }

    private parseCard($: cheerio.CheerioAPI, element: Element): Flat | null {
        const card = $(element);
        const url = card.find('a[data-testid="card-title-link"]').attr('href');
        if (!url) return null;

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
        const match = text.match(/(\d{1,2})\s*(?:pokoje?|pok[óo]j)/i)
            || text.match(/(?:pokoje?|pok[óo]j|pomieszczenia)\s*[:\-]\s*(\d{1,2})/i);
        return match ? Number(match[1]) : null;
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

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default Parser;