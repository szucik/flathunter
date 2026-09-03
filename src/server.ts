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
        const limit = Math.min(Math.max(Number(requestUrl.searchParams.get('limit') || 100), 1), 500);
        const listings = db.getAllFlats()
            .filter(flat => !district || flat.district === district)
            .filter(flat => !source || flat.source === source)
            .slice(0, limit);

        sendJson(response, 200, { count: listings.length, listings });
    } finally {
        db.close();
    }
}

async function sendProperties(requestUrl: URL, response: ServerResponse): Promise<void> {
    const db = new FlatsDatabase();
    try {
        const district = requestUrl.searchParams.get('district');
        const source = requestUrl.searchParams.get('source');
        const limit = Math.min(Math.max(Number(requestUrl.searchParams.get('limit') || 100), 1), 500);
        const listings = db.getAllFlats()
            .filter(flat => !district || flat.district === district)
            .filter(flat => !source || flat.source === source);
        const groups = new Map<string, typeof listings>();

        for (const listing of listings) {
            const key = listing.propertyGroupId === null ? `listing:${listing.id}` : `group:${listing.propertyGroupId}`;
            const group = groups.get(key) || [];
            group.push(listing);
            groups.set(key, group);
        }

        const properties = [...groups.values()]
            .map(group => ({
                id: group[0].propertyGroupId ?? group[0].id,
                listings: group,
                lowestPrice: Math.min(...group.map(listing => listing.price ?? Number.MAX_SAFE_INTEGER)),
                sources: [...new Set(group.map(listing => listing.source))]
            }))
            .sort((left, right) => right.listings[0].lastSeenAt.localeCompare(left.listings[0].lastSeenAt))
            .slice(0, limit);

        sendJson(response, 200, { count: properties.length, properties });
    } finally {
        db.close();
    }
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