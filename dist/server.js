"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
require("dotenv/config");
const database_1 = __importDefault(require("./database"));
const port = Number(process.env.API_PORT || 3000);
const publicDirectory = node_path_1.default.join(__dirname, '..', 'public');
async function requestHandler(request, response) {
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
        const manualTypeMatch = requestUrl.pathname.match(/^\/api\/listings\/(\d+)\/building-type$/);
        if (manualTypeMatch && request.method === 'POST') {
            await updateManualBuildingType(Number(manualTypeMatch[1]), request, response);
            return;
        }
        const hiddenMatch = requestUrl.pathname.match(/^\/api\/listings\/(\d+)\/hidden$/);
        if (hiddenMatch && request.method === 'POST') {
            await updateHidden(Number(hiddenMatch[1]), request, response);
            return;
        }
        if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
            await sendFile(response, 'index.html', 'text/html; charset=utf-8');
            return;
        }
        sendJson(response, 404, { error: 'Not found' });
    }
    catch (error) {
        console.error('API error:', error);
        sendJson(response, 500, { error: 'Internal server error' });
    }
}
async function updateManualBuildingType(id, request, response) {
    const body = await readRequestBody(request);
    const payload = JSON.parse(body);
    const buildingType = payload.buildingType === null ? null : String(payload.buildingType || '');
    if (buildingType !== null && !['wielka plyta', 'rama h', 'kamienica'].includes(buildingType)) {
        sendJson(response, 400, { error: 'Unsupported building type' });
        return;
    }
    const db = new database_1.default();
    try {
        db.setManualBuildingType(id, buildingType);
        sendJson(response, 200, { ok: true, id, buildingType });
    }
    finally {
        db.close();
    }
}
async function updateHidden(id, request, response) {
    const payload = JSON.parse(await readRequestBody(request));
    if (typeof payload.hidden !== 'boolean') {
        sendJson(response, 400, { error: 'hidden must be boolean' });
        return;
    }
    const db = new database_1.default();
    try {
        db.setHidden(id, payload.hidden);
        sendJson(response, 200, { ok: true, id, hidden: payload.hidden });
    }
    finally {
        db.close();
    }
}
function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', chunk => body += chunk);
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}
async function sendListings(requestUrl, response) {
    const db = new database_1.default();
    try {
        const district = requestUrl.searchParams.get('district');
        const source = requestUrl.searchParams.get('source');
        const portal = requestUrl.searchParams.get('portal') || source;
        const includeExcludedBuildingTypes = requestUrl.searchParams.get('includeExcludedBuildingTypes') === 'true';
        const reviewBuildingType = requestUrl.searchParams.get('reviewBuildingType');
        const showHidden = requestUrl.searchParams.get('showHidden') === 'true';
        const page = parsePage(requestUrl.searchParams.get('page'));
        const pageSize = parsePageSize(requestUrl.searchParams.get('pageSize') || requestUrl.searchParams.get('limit'));
        const filteredListings = db.getAllFlats()
            .filter(flat => Boolean(flat.hidden) === showHidden)
            .filter(flat => !isExcludedDistrict(flat.district))
            .filter(flat => reviewBuildingType
            ? normalizeValue(flat.buildingType || '') === normalizeValue(reviewBuildingType)
            : includeExcludedBuildingTypes || !isExcludedBuildingType(flat.buildingType))
            .filter(flat => !district || flat.district === district)
            .filter(flat => !portal || getPortalName(flat.url) === portal)
            .map(flat => ({ ...flat, description: cleanDescription(flat.description), portal: getPortalName(flat.url) }));
        const listings = filteredListings.slice((page - 1) * pageSize, page * pageSize);
        sendJson(response, 200, { count: listings.length, total: filteredListings.length, page, pageSize, listings });
    }
    finally {
        db.close();
    }
}
async function sendProperties(requestUrl, response) {
    const db = new database_1.default();
    try {
        const district = requestUrl.searchParams.get('district');
        const source = requestUrl.searchParams.get('source');
        const portal = requestUrl.searchParams.get('portal') || source;
        const includeExcludedBuildingTypes = requestUrl.searchParams.get('includeExcludedBuildingTypes') === 'true';
        const reviewBuildingType = requestUrl.searchParams.get('reviewBuildingType');
        const showHidden = requestUrl.searchParams.get('showHidden') === 'true';
        const page = parsePage(requestUrl.searchParams.get('page'));
        const pageSize = parsePageSize(requestUrl.searchParams.get('pageSize') || requestUrl.searchParams.get('limit'));
        const listings = db.getAllFlats()
            .filter(flat => Boolean(flat.hidden) === showHidden)
            .filter(flat => !isExcludedDistrict(flat.district))
            .filter(flat => reviewBuildingType
            ? normalizeValue(flat.buildingType || '') === normalizeValue(reviewBuildingType)
            : includeExcludedBuildingTypes || !isExcludedBuildingType(flat.buildingType))
            .filter(flat => !district || flat.district === district)
            .filter(flat => !portal || getPortalName(flat.url) === portal)
            .map(flat => ({ ...flat, description: cleanDescription(flat.description), portal: getPortalName(flat.url) }));
        const groups = new Map();
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
    }
    finally {
        db.close();
    }
}
function getPortalName(value) {
    try {
        const hostname = new URL(value).hostname.toLowerCase();
        if (hostname.includes('otodom'))
            return 'otodom';
        if (hostname.includes('olx'))
            return 'olx';
    }
    catch {
        return 'inne';
    }
    return 'inne';
}
function cleanDescription(value) {
    if (!value || /\.css-[\w-]+\s*\{|--font(?:Size|Family|Weight)|line-height:\s*var\(/i.test(value)) {
        return null;
    }
    return value;
}
function isExcludedDistrict(value) {
    const excluded = (process.env.EXCLUDED_DISTRICTS || 'Ursus,Białołęka,Wawer')
        .split(',')
        .map(item => normalizeValue(item));
    return value !== null && excluded.includes(normalizeValue(value));
}
function isExcludedBuildingType(value) {
    const excluded = (process.env.EXCLUDED_BUILDING_TYPES || 'wielka plyta')
        .split(',')
        .map(item => normalizeValue(item));
    return value !== null && excluded.includes(normalizeValue(value));
}
function normalizeValue(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pl-PL');
}
function parsePage(value) {
    const page = Number(value || 1);
    return Number.isInteger(page) && page > 0 ? page : 1;
}
function parsePageSize(value) {
    const pageSize = Number(value || 20);
    return Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20;
}
async function sendFile(response, fileName, contentType) {
    const content = await (0, promises_1.readFile)(node_path_1.default.join(publicDirectory, fileName));
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
}
function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
    });
    response.end(JSON.stringify(body));
}
const server = (0, node_http_1.createServer)((request, response) => {
    void requestHandler(request, response);
});
server.listen(port, () => {
    console.log(`FlatHunter API: http://localhost:${port}`);
    console.log(`Listings endpoint: http://localhost:${port}/api/listings`);
});
function shutdown() {
    server.close(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
