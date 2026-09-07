import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import FlatsDatabase from './database';

const port = Number(process.env.API_PORT || 3000);
const publicDirectory = path.join(__dirname, '..', 'public');

async function requestHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    try {
        if (requestUrl.pathname === '/api/listings') {
            await sendListings(requestUrl, response);
            return;
        }

        if (requestUrl.pathname === '/api/properties') {
            await sendProperties(requestUrl, response);
            return;
        }

        if (requestUrl.pathname === '/api/health') {
            sendJson(response, 200, { ok: true });
            return;
        }

        if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
            await sendFile(response, 'index.html', 'text/html; charset=utf-8');
            return;
        }

        sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
        console.error('API error:', error);
        sendJson(response, 500, { error: 'Internal server error' });
    }
}

async function sendListings(requestUrl: URL, response: ServerResponse): Promise<void> {
    const db = new FlatsDatabase();
    try {
        const district = requestUrl.searchParams.get('district');
        const source = requestUrl.searchParams.get('source');
        const portal = requestUrl.searchParams.get('portal') || source;
        const includeExcludedBuildingTypes = requestUrl.searchParams.get('includeExcludedBuildingTypes') === 'true';
        const page = parsePage(requestUrl.searchParams.get('page'));
        const pageSize = parsePageSize(requestUrl.searchParams.get('pageSize') || requestUrl.searchParams.get('limit'));
        const filteredListings = db.getAllFlats()
            .filter(flat => !isExcludedDistrict(flat.district))
            .filter(flat => includeExcludedBuildingTypes || !isExcludedBuildingType(flat.buildingType))
            .filter(flat => !district || flat.district === district)
            .filter(flat => !portal || getPortalName(flat.url) === portal)
            .map(flat => ({ ...flat, description: cleanDescription(flat.description), portal: getPortalName(flat.url) }));
        const listings = filteredListings.slice((page - 1) * pageSize, page * pageSize);

        sendJson(response, 200, { count: listings.length, total: filteredListings.length, page, pageSize, listings });
    } finally {
        db.close();
    }
}

async function sendProperties(requestUrl: URL, response: ServerResponse): Promise<void> {
    const db = new FlatsDatabase();
    try {
        const district = requestUrl.searchParams.get('district');
        const source = requestUrl.searchParams.get('source');
        const portal = requestUrl.searchParams.get('portal') || source;
        const includeExcludedBuildingTypes = requestUrl.searchParams.get('includeExcludedBuildingTypes') === 'true';
        const page = parsePage(requestUrl.searchParams.get('page'));
        const pageSize = parsePageSize(requestUrl.searchParams.get('pageSize') || requestUrl.searchParams.get('limit'));
        const listings = db.getAllFlats()
            .filter(flat => !isExcludedDistrict(flat.district))
            .filter(flat => includeExcludedBuildingTypes || !isExcludedBuildingType(flat.buildingType))
            .filter(flat => !district || flat.district === district)
            .filter(flat => !portal || getPortalName(flat.url) === portal)
            .map(flat => ({ ...flat, description: cleanDescription(flat.description), portal: getPortalName(flat.url) }));
        const groups = new Map<string, typeof listings>();

        for (const listing of listings) {
            const key = listing.propertyGroupId === null ? `listing:${listing.id}` : `group:${listing.propertyGroupId}`;
            const group = groups.get(key) || [];
            group.push(listing);
            groups.set(key, group);
        }

        const allProperties = [...groups.values()]
            .map(group => ({
                id: group[0].propertyGroupId ?? group[0].id,
                listings: group,
                lowestPrice: Math.min(...group.map(listing => listing.price ?? Number.MAX_SAFE_INTEGER)),
                sources: [...new Set(group.map(listing => listing.portal))]
            }))
            .sort((left, right) => right.listings[0].lastSeenAt.localeCompare(left.listings[0].lastSeenAt));
        const properties = allProperties.slice((page - 1) * pageSize, page * pageSize);

        sendJson(response, 200, { count: properties.length, total: allProperties.length, page, pageSize, properties });
    } finally {
        db.close();
    }
}

function getPortalName(value: string): string {
    try {
        const hostname = new URL(value).hostname.toLowerCase();
        if (hostname.includes('otodom')) return 'otodom';
        if (hostname.includes('olx')) return 'olx';
    } catch {
        return 'inne';
    }

    return 'inne';
}

function cleanDescription(value: string | null): string | null {
    if (!value || /\.css-[\w-]+\s*\{|--font(?:Size|Family|Weight)|line-height:\s*var\(/i.test(value)) {
        return null;
    }

    return value;
}

function isExcludedDistrict(value: string | null): boolean {
    const excluded = (process.env.EXCLUDED_DISTRICTS || 'Ursus,Białołęka,Wawer')
        .split(',')
        .map(item => normalizeValue(item));
    return value !== null && excluded.includes(normalizeValue(value));
}

function isExcludedBuildingType(value: string | null): boolean {
    const excluded = (process.env.EXCLUDED_BUILDING_TYPES || 'wielka plyta')
        .split(',')
        .map(item => normalizeValue(item));
    return value !== null && excluded.includes(normalizeValue(value));
}

function normalizeValue(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pl-PL');
}

function parsePage(value: string | null): number {
    const page = Number(value || 1);
    return Number.isInteger(page) && page > 0 ? page : 1;
}

function parsePageSize(value: string | null): number {
    const pageSize = Number(value || 20);
    return Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20;
}

async function sendFile(response: ServerResponse, fileName: string, contentType: string): Promise<void> {
    const content = await readFile(path.join(publicDirectory, fileName));
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
    });
    response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
    void requestHandler(request, response);
});

server.listen(port, () => {
    console.log(`FlatHunter API: http://localhost:${port}`);
    console.log(`Listings endpoint: http://localhost:${port}/api/listings`);
});

function shutdown(): void {
    server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);