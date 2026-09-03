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
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS flats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL DEFAULT 'unknown',
                url TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                price INTEGER,
                area REAL,
                price_per_m2 REAL,
                district TEXT,
                created_at TEXT,
                building_type TEXT,
                has_garage INTEGER,
                has_elevator INTEGER,
                has_balcony INTEGER,
                build_year INTEGER,
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
            ['building_type', 'TEXT'],
            ['has_garage', 'INTEGER'],
            ['has_elevator', 'INTEGER'],
            ['has_balcony', 'INTEGER'],
            ['build_year', 'INTEGER']
        ];
        for (const [name, definition] of missingColumns) {
            if (!existingColumns.has(name)) {
                this.db.exec(`ALTER TABLE flats ADD COLUMN ${name} ${definition}`);
            }
        }
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
                source, url, title, description, price, area, price_per_m2, district, created_at,
                building_type, has_garage, has_elevator, has_balcony, build_year
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(flat.source, flat.url, flat.title, flat.description, flat.price, flat.area, flat.pricePerM2, flat.district, flat.createdAt, flat.buildingType, toSqlBoolean(flat.hasGarage), toSqlBoolean(flat.hasElevator), toSqlBoolean(flat.hasBalcony), flat.buildYear);
        return result.changes > 0;
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
function normalizeUrl(value) {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
}
function toSqlBoolean(value) {
    return value === null ? null : value ? 1 : 0;
}
exports.default = FlatsDatabase;
