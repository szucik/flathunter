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
        if (requestUrl.pathname === '/api/health') {
            sendJson(response, 200, { ok: true });
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
async function sendListings(requestUrl, response) {
    const db = new database_1.default();
    try {
        const district = requestUrl.searchParams.get('district');
        const source = requestUrl.searchParams.get('source');
        const limit = Math.min(Math.max(Number(requestUrl.searchParams.get('limit') || 100), 1), 500);
        const listings = db.getAllFlats()
            .filter(flat => !district || flat.district === district)
            .filter(flat => !source || flat.source === source)
            .slice(0, limit);
        sendJson(response, 200, { count: listings.length, listings });
    }
    finally {
        db.close();
    }
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
