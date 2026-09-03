import Database from 'better-sqlite3';
import path from 'node:path';
import type { Flat } from './types';
import type { StoredFlat } from './types';

class FlatsDatabase {
    private readonly db: Database.Database;

    constructor() {
        const dbPath = path.join(__dirname, '..', 'data', 'flats.db');
        this.db = new Database(dbPath);
        this.init();
    }

    private init(): void {
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
                price_per_m2 REAL,
                district TEXT,
                created_at TEXT,
                building_type TEXT,
                has_garage INTEGER,
                has_elevator INTEGER,
                has_balcony INTEGER,
                build_year INTEGER,
                property_group_id INTEGER,
                scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.addMissingColumnsForExistingDatabase();
        this.normalizeStoredUrls();
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_district ON flats(district)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_price ON flats(price)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_scraped_at ON flats(scraped_at)');
    }

    private addMissingColumnsForExistingDatabase(): void {
        const columns = this.db.prepare('PRAGMA table_info(flats)').all() as Array<{ name: string }>;
        const existingColumns = new Set(columns.map(column => column.name));
        const missingColumns: Array<[string, string]> = [
            ['source', "TEXT NOT NULL DEFAULT 'unknown'"],
            ['description', 'TEXT'],
            ['rooms', 'INTEGER'],
            ['building_type', 'TEXT'],
            ['has_garage', 'INTEGER'],
            ['has_elevator', 'INTEGER'],
            ['has_balcony', 'INTEGER'],
            ['build_year', 'INTEGER']
            ,['property_group_id', 'INTEGER']
        ];

        for (const [name, definition] of missingColumns) {
            if (!existingColumns.has(name)) {
                this.db.exec(`ALTER TABLE flats ADD COLUMN ${name} ${definition}`);
            }
        }
    }

    private normalizeStoredUrls(): void {
        const rows = this.db.prepare('SELECT id, url FROM flats').all() as Array<{ id: number; url: string }>;
        const update = this.db.prepare('UPDATE flats SET url = ? WHERE id = ?');
        const remove = this.db.prepare('DELETE FROM flats WHERE id = ?');
        const storedUrls = new Set(rows.map(row => row.url));

        const normalize = this.db.transaction(() => {
            for (const row of rows) {
                const canonicalUrl = normalizeUrl(row.url);
                if (canonicalUrl === row.url) continue;

                if (storedUrls.has(canonicalUrl)) {
                    remove.run(row.id);
                } else {
                    update.run(canonicalUrl, row.id);
                    storedUrls.delete(row.url);
                    storedUrls.add(canonicalUrl);
                }
            }
        });

        normalize();
    }

    insertFlat(flat: Flat): boolean {
        const result = this.db.prepare(`
            INSERT OR IGNORE INTO flats (
                source, url, title, description, price, area, rooms, price_per_m2, district, created_at,
                building_type, has_garage, has_elevator, has_balcony, build_year
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            flat.source, flat.url, flat.title, flat.description, flat.price, flat.area, flat.rooms,
            flat.pricePerM2, flat.district, flat.createdAt, flat.buildingType,
            toSqlBoolean(flat.hasGarage), toSqlBoolean(flat.hasElevator),
            toSqlBoolean(flat.hasBalcony), flat.buildYear
        );

        return result.changes > 0;
    }

    updateFlat(flat: Flat): void {
        this.db.prepare(`
            UPDATE flats SET
                source = ?, title = ?, price = ?, area = ?, rooms = ?, price_per_m2 = ?,
                district = ?, created_at = ?, building_type = COALESCE(?, building_type),
                has_garage = COALESCE(?, has_garage), has_elevator = COALESCE(?, has_elevator),
                has_balcony = COALESCE(?, has_balcony), build_year = COALESCE(?, build_year)
            WHERE url = ?
        `).run(
            flat.source, flat.title, flat.price, flat.area, flat.rooms, flat.pricePerM2,
            flat.district, flat.createdAt, flat.buildingType, toSqlBoolean(flat.hasGarage),
            toSqlBoolean(flat.hasElevator), toSqlBoolean(flat.hasBalcony), flat.buildYear, flat.url
        );
    }

    getAllFlats(): StoredFlat[] {
        return this.db.prepare('SELECT * FROM flats').all().map(row => this.mapStoredFlat(row as Record<string, unknown>));
    }

    assignPropertyGroup(flatId: number, groupId: number): void {
        this.db.prepare('UPDATE flats SET property_group_id = ? WHERE id = ?').run(groupId, flatId);
    }

    createPropertyGroup(): number {
        const result = this.db.prepare('INSERT INTO property_groups DEFAULT VALUES').run();
        return Number(result.lastInsertRowid);
    }

    getFlatByUrl(url: string): StoredFlat | null {
        const row = this.db.prepare('SELECT * FROM flats WHERE url = ?').get(url) as Record<string, unknown> | undefined;
        return row ? this.mapStoredFlat(row) : null;
    }

    getPropertyGroupId(flatId: number): number | null {
        const row = this.db.prepare('SELECT property_group_id FROM flats WHERE id = ?').get(flatId) as { property_group_id: number | null } | undefined;
        return row?.property_group_id ?? null;
    }

    private mapStoredFlat(row: Record<string, unknown>): StoredFlat {
        return {
            id: Number(row.id), source: String(row.source), url: String(row.url), title: String(row.title),
            description: (row.description as string | null) ?? null, price: (row.price as number | null) ?? null,
            area: (row.area as number | null) ?? null, rooms: (row.rooms as number | null) ?? null,
            pricePerM2: (row.price_per_m2 as number | null) ?? null, district: (row.district as string | null) ?? null,
            createdAt: (row.created_at as string | null) ?? null, buildingType: (row.building_type as string | null) ?? null,
            hasGarage: fromSqlBoolean(row.has_garage as number | null), hasElevator: fromSqlBoolean(row.has_elevator as number | null),
            hasBalcony: fromSqlBoolean(row.has_balcony as number | null), buildYear: (row.build_year as number | null) ?? null,
            propertyGroupId: (row.property_group_id as number | null) ?? null
        };
    }

    getAllUrls(): string[] {
        const rows = this.db.prepare('SELECT url FROM flats').all() as Array<{ url: string }>;
        return rows.map(row => row.url);
    }

    getNewFlats(limit = 10): unknown[] {
        return this.db.prepare('SELECT * FROM flats ORDER BY scraped_at DESC LIMIT ?').all(limit);
    }

    getFlatsByDistrict(district: string): unknown[] {
        return this.db.prepare('SELECT * FROM flats WHERE district = ? ORDER BY scraped_at DESC').all(district);
    }

    cleanup(keepDays = 30): void {
        this.db.prepare("DELETE FROM flats WHERE scraped_at < datetime('now', '-' || ? || ' days')").run(keepDays);
    }

    close(): void {
        this.db.close();
    }
}

// Groups are deliberately separate from listings, so different portal prices remain visible.

function normalizeUrl(value: string): string {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
}

function toSqlBoolean(value: boolean | null): number | null {
    return value === null ? null : value ? 1 : 0;
}

function fromSqlBoolean(value: number | null): boolean | null {
    return value === null ? null : value === 1;
}

export default FlatsDatabase;