"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_path_1 = __importDefault(require("node:path"));
class FlatsDatabase {
    db;
    constructor() {
        const dbPath = node_path_1.default.join(__dirname, '..', 'data', 'flats.db');
        this.db = new better_sqlite3_1.default(dbPath);
        this.init();
    }
    init() {
        this.db.exec('CREATE TABLE IF NOT EXISTS property_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS flats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL DEFAULT 'unknown',
                url TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                price INTEGER,
                area REAL,
                rooms INTEGER,
                address TEXT,
                floor INTEGER,
                total_floors INTEGER,
                price_per_m2 REAL,
                district TEXT,
                created_at TEXT,
                published_at TEXT,
                refreshed_at TEXT,
                building_type TEXT,
                has_garage INTEGER,
                has_elevator INTEGER,
                has_balcony INTEGER,
                build_year INTEGER,
                ownership_type TEXT,
                rent INTEGER,
                commission TEXT,
                listing_status TEXT,
                property_group_id INTEGER,
                first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.addMissingColumnsForExistingDatabase();
        this.normalizeStoredUrls();
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_district ON flats(district)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_price ON flats(price)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_scraped_at ON flats(scraped_at)');
    }
    addMissingColumnsForExistingDatabase() {
        const columns = this.db.prepare('PRAGMA table_info(flats)').all();
        const existingColumns = new Set(columns.map(column => column.name));
        const missingColumns = [
            ['source', "TEXT NOT NULL DEFAULT 'unknown'"],
            ['description', 'TEXT'],
            ['rooms', 'INTEGER'],
            ['address', 'TEXT'],
            ['floor', 'INTEGER'],
            ['total_floors', 'INTEGER'],
            ['published_at', 'TEXT'],
            ['refreshed_at', 'TEXT'],
            ['building_type', 'TEXT'],
            ['has_garage', 'INTEGER'],
            ['has_elevator', 'INTEGER'],
            ['has_balcony', 'INTEGER'],
            ['build_year', 'INTEGER'],
            ['ownership_type', 'TEXT'],
            ['rent', 'INTEGER'],
            ['commission', 'TEXT'],
            ['listing_status', 'TEXT'],
            ['first_seen_at', 'DATETIME'],
            ['last_seen_at', 'DATETIME'],
            ['property_group_id', 'INTEGER']
        ];
        for (const [name, definition] of missingColumns) {
            if (!existingColumns.has(name)) {
                this.db.exec(`ALTER TABLE flats ADD COLUMN ${name} ${definition}`);
            }
        }
        this.db.exec('UPDATE flats SET first_seen_at = COALESCE(first_seen_at, scraped_at), last_seen_at = COALESCE(last_seen_at, scraped_at)');
    }
    normalizeStoredUrls() {
        const rows = this.db.prepare('SELECT id, url FROM flats').all();
        const update = this.db.prepare('UPDATE flats SET url = ? WHERE id = ?');
        const remove = this.db.prepare('DELETE FROM flats WHERE id = ?');
        const storedUrls = new Set(rows.map(row => row.url));
        const normalize = this.db.transaction(() => {
            for (const row of rows) {
                const canonicalUrl = normalizeUrl(row.url);
                if (canonicalUrl === row.url)
                    continue;
                if (storedUrls.has(canonicalUrl)) {
                    remove.run(row.id);
                }
                else {
                    update.run(canonicalUrl, row.id);
                    storedUrls.delete(row.url);
                    storedUrls.add(canonicalUrl);
                }
            }
        });
        normalize();
    }
    insertFlat(flat) {
        const result = this.db.prepare(`
            INSERT OR IGNORE INTO flats (
                source, url, title, description, price, area, rooms, address, floor, total_floors,
                price_per_m2, district, created_at, published_at, refreshed_at, building_type,
                has_garage, has_elevator, has_balcony, build_year, ownership_type, rent, commission, listing_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(flat.source, flat.url, flat.title, flat.description, flat.price, flat.area, flat.rooms, flat.address, flat.floor, flat.totalFloors, flat.pricePerM2, flat.district, flat.createdAt, flat.publishedAt, flat.refreshedAt, flat.buildingType, toSqlBoolean(flat.hasGarage), toSqlBoolean(flat.hasElevator), toSqlBoolean(flat.hasBalcony), flat.buildYear, flat.ownershipType, flat.rent, flat.commission, flat.listingStatus);
        return result.changes > 0;
    }
    updateFlat(flat) {
        this.db.prepare(`
            UPDATE flats SET
                source = ?, title = ?, price = ?, area = ?, rooms = ?, address = ?, floor = ?, total_floors = ?, price_per_m2 = ?,
                district = ?, created_at = ?, published_at = ?, refreshed_at = ?, building_type = COALESCE(?, building_type),
                has_garage = COALESCE(?, has_garage), has_elevator = COALESCE(?, has_elevator),
                has_balcony = COALESCE(?, has_balcony), build_year = COALESCE(?, build_year),
                ownership_type = COALESCE(?, ownership_type), rent = COALESCE(?, rent),
                commission = COALESCE(?, commission), listing_status = COALESCE(?, listing_status),
                last_seen_at = CURRENT_TIMESTAMP
            WHERE url = ?
        `).run(flat.source, flat.title, flat.price, flat.area, flat.rooms, flat.address, flat.floor, flat.totalFloors, flat.pricePerM2, flat.district, flat.createdAt, flat.publishedAt, flat.refreshedAt, flat.buildingType, toSqlBoolean(flat.hasGarage), toSqlBoolean(flat.hasElevator), toSqlBoolean(flat.hasBalcony), flat.buildYear, flat.ownershipType, flat.rent, flat.commission, flat.listingStatus, flat.url);
    }
    getAllFlats() {
        return this.db.prepare('SELECT * FROM flats').all().map(row => this.mapStoredFlat(row));
    }
    assignPropertyGroup(flatId, groupId) {
        this.db.prepare('UPDATE flats SET property_group_id = ? WHERE id = ?').run(groupId, flatId);
    }
    createPropertyGroup() {
        const result = this.db.prepare('INSERT INTO property_groups DEFAULT VALUES').run();
        return Number(result.lastInsertRowid);
    }
    getFlatByUrl(url) {
        const row = this.db.prepare('SELECT * FROM flats WHERE url = ?').get(url);
        return row ? this.mapStoredFlat(row) : null;
    }
    getPropertyGroupId(flatId) {
        const row = this.db.prepare('SELECT property_group_id FROM flats WHERE id = ?').get(flatId);
        return row?.property_group_id ?? null;
    }
    mapStoredFlat(row) {
        return {
            id: Number(row.id), source: String(row.source), url: String(row.url), title: String(row.title),
            description: row.description ?? null, price: row.price ?? null,
            area: row.area ?? null, rooms: row.rooms ?? null,
            address: row.address ?? null, floor: row.floor ?? null,
            totalFloors: row.total_floors ?? null,
            pricePerM2: row.price_per_m2 ?? null, district: row.district ?? null,
            createdAt: row.created_at ?? null,
            publishedAt: row.published_at ?? null,
            refreshedAt: row.refreshed_at ?? null,
            buildingType: row.building_type ?? null,
            hasGarage: fromSqlBoolean(row.has_garage), hasElevator: fromSqlBoolean(row.has_elevator),
            hasBalcony: fromSqlBoolean(row.has_balcony), buildYear: row.build_year ?? null,
            ownershipType: row.ownership_type ?? null, rent: row.rent ?? null,
            commission: row.commission ?? null,
            listingStatus: row.listing_status ?? null,
            propertyGroupId: row.property_group_id ?? null,
            firstSeenAt: String(row.first_seen_at), lastSeenAt: String(row.last_seen_at)
        };
    }
    getAllUrls() {
        const rows = this.db.prepare('SELECT url FROM flats').all();
        return rows.map(row => row.url);
    }
    getNewFlats(limit = 10) {
        return this.db.prepare('SELECT * FROM flats ORDER BY scraped_at DESC LIMIT ?').all(limit);
    }
    getFlatsByDistrict(district) {
        return this.db.prepare('SELECT * FROM flats WHERE district = ? ORDER BY scraped_at DESC').all(district);
    }
    cleanup(keepDays = 30) {
        this.db.prepare("DELETE FROM flats WHERE scraped_at < datetime('now', '-' || ? || ' days')").run(keepDays);
    }
    close() {
        this.db.close();
    }
}
// Groups are deliberately separate from listings, so different portal prices remain visible.
function normalizeUrl(value) {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
}
function toSqlBoolean(value) {
    return value === null ? null : value ? 1 : 0;
}
function fromSqlBoolean(value) {
    return value === null ? null : value === 1;
}
exports.default = FlatsDatabase;
