import Database from 'better-sqlite3';
import path from 'node:path';
import type { Flat } from './types';
import type { StoredFlat } from './types';

export interface ScrapeRun {
    id: number;
    source: string;
    status: 'running' | 'completed' | 'failed';
    startedAt: string;
    completedAt: string | null;
    listingsFound: number | null;
    errorMessage: string | null;
}

class FlatsDatabase {
    private readonly db: Database.Database;

    constructor(databasePath?: string) {
        const dbPath = databasePath || path.join(__dirname, '..', 'data', 'flats.db');
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
                image_url TEXT,
                rejection_reason TEXT,
                uncertainty_reason TEXT,
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
                has_parking_space INTEGER,
                has_storage_unit INTEGER,
                has_basement INTEGER,
                has_elevator INTEGER,
                has_balcony INTEGER,
                has_garden INTEGER,
                build_year INTEGER,
                ownership_type TEXT,
                market_type TEXT,
                manual_building_type TEXT,
                hidden INTEGER NOT NULL DEFAULT 0,
                manual_accept INTEGER NOT NULL DEFAULT 0,
                rent INTEGER,
                commission TEXT,
                listing_status TEXT,
                property_group_id INTEGER,
                first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.db.exec(`CREATE TABLE IF NOT EXISTS scrape_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            completed_at TEXT,
            listings_found INTEGER,
            error_message TEXT
        )`);
        this.addMissingColumnsForExistingDatabase();
        this.db.exec("UPDATE flats SET image_url = NULL WHERE image_url LIKE '%no_thumbnail%' OR image_url LIKE '/app/%'");
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
            ['image_url', 'TEXT'],
            ['rejection_reason', 'TEXT'],
            ['uncertainty_reason', 'TEXT'],
            ['description', 'TEXT'],
            ['rooms', 'INTEGER'],
            ['address', 'TEXT'],
            ['floor', 'INTEGER'],
            ['total_floors', 'INTEGER'],
            ['published_at', 'TEXT'],
            ['refreshed_at', 'TEXT'],
            ['building_type', 'TEXT'],
            ['has_garage', 'INTEGER'],
            ['has_parking_space', 'INTEGER'],
            ['has_storage_unit', 'INTEGER'],
            ['has_basement', 'INTEGER'],
            ['has_elevator', 'INTEGER'],
            ['has_balcony', 'INTEGER'],
            ['has_garden', 'INTEGER'],
            ['build_year', 'INTEGER'],
            ['ownership_type', 'TEXT'],
            ['market_type', 'TEXT'],
            ['manual_building_type', 'TEXT'],
            ['hidden', 'INTEGER NOT NULL DEFAULT 0'],
            ['manual_accept', 'INTEGER NOT NULL DEFAULT 0'],
            ['rent', 'INTEGER'],
            ['commission', 'TEXT'],
            ['listing_status', 'TEXT'],
            ['first_seen_at', 'DATETIME'],
            ['last_seen_at', 'DATETIME']
            ,['property_group_id', 'INTEGER']
        ];

        for (const [name, definition] of missingColumns) {
            if (!existingColumns.has(name)) {
                this.db.exec(`ALTER TABLE flats ADD COLUMN ${name} ${definition}`);
            }
        }

        this.db.exec('UPDATE flats SET first_seen_at = COALESCE(first_seen_at, scraped_at), last_seen_at = COALESCE(last_seen_at, scraped_at)');
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
                source, url, image_url, rejection_reason, uncertainty_reason, title, description, price, area, rooms, address, floor, total_floors,
                price_per_m2, district, created_at, published_at, refreshed_at, building_type,
                has_garage, has_parking_space, has_storage_unit, has_basement, has_elevator, has_balcony, has_garden, build_year, ownership_type, market_type, rent, commission, listing_status
            ) VALUES (${Array.from({ length: 32 }, () => '?').join(', ')})
        `).run(
            flat.source, flat.url, flat.imageUrl, flat.rejectionReason ?? null, flat.uncertaintyReason ?? null, flat.title, flat.description, flat.price, flat.area, flat.rooms,
            flat.address, flat.floor, flat.totalFloors, flat.pricePerM2, flat.district, flat.createdAt,
            flat.publishedAt, flat.refreshedAt, flat.buildingType,
            toSqlBoolean(flat.hasGarage), toSqlBoolean(flat.hasParkingSpace ?? null), toSqlBoolean(flat.hasStorageUnit ?? null),
            toSqlBoolean(flat.hasBasement ?? null), toSqlBoolean(flat.hasElevator),
            toSqlBoolean(flat.hasBalcony), toSqlBoolean(flat.hasGarden), flat.buildYear, flat.ownershipType, flat.marketType ?? null, flat.rent,
            flat.commission, flat.listingStatus
        );

        return result.changes > 0;
    }

    updateFlat(flat: Flat): void {
        this.db.prepare(`
            UPDATE flats SET
                source = ?, image_url = COALESCE(?, image_url), rejection_reason = ?, uncertainty_reason = ?, title = ?, price = ?, area = ?, rooms = ?, address = ?, floor = ?, total_floors = ?, price_per_m2 = ?,
                district = ?, created_at = ?, published_at = ?, refreshed_at = ?,
                building_type = COALESCE(manual_building_type, ?),
                has_garage = COALESCE(?, has_garage), has_elevator = COALESCE(?, has_elevator),
                has_parking_space = COALESCE(?, has_parking_space), has_storage_unit = COALESCE(?, has_storage_unit),
                has_basement = COALESCE(?, has_basement),
                has_balcony = COALESCE(?, has_balcony), has_garden = COALESCE(?, has_garden),
                build_year = COALESCE(?, build_year),
                ownership_type = COALESCE(?, ownership_type), market_type = COALESCE(?, market_type), rent = COALESCE(?, rent),
                commission = COALESCE(?, commission), listing_status = COALESCE(?, listing_status),
                last_seen_at = CURRENT_TIMESTAMP
            WHERE url = ?
        `).run(
            flat.source, flat.imageUrl, flat.rejectionReason ?? null, flat.uncertaintyReason ?? null, flat.title, flat.price, flat.area, flat.rooms, flat.address, flat.floor,
            flat.totalFloors, flat.pricePerM2, flat.district, flat.createdAt, flat.publishedAt,
            flat.refreshedAt, flat.buildingType, toSqlBoolean(flat.hasGarage), toSqlBoolean(flat.hasParkingSpace ?? null),
            toSqlBoolean(flat.hasStorageUnit ?? null), toSqlBoolean(flat.hasBasement ?? null), toSqlBoolean(flat.hasElevator),
            toSqlBoolean(flat.hasBalcony), toSqlBoolean(flat.hasGarden), flat.buildYear, flat.ownershipType, flat.marketType ?? null, flat.rent,
            flat.commission, flat.listingStatus, flat.url
        );
    }

    getAllFlats(): StoredFlat[] {
        return this.db.prepare('SELECT * FROM flats').all().map(row => this.mapStoredFlat(row as Record<string, unknown>));
    }

    startScrapeRun(source: string): number {
        const result = this.db.prepare("INSERT INTO scrape_runs (source, status) VALUES (?, 'running')").run(source);
        return Number(result.lastInsertRowid);
    }

    completeScrapeRun(runId: number, listingsFound: number): void {
        this.updateScrapeRun(runId, 'completed', listingsFound, null);
    }

    failScrapeRun(runId: number, errorMessage: string): void {
        this.updateScrapeRun(runId, 'failed', null, errorMessage);
    }

    getLatestScrapeRun(): ScrapeRun | null {
        const row = this.db.prepare('SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 1').get() as Record<string, unknown> | undefined;
        if (!row) return null;
        return { id: Number(row.id), source: String(row.source), status: row.status as ScrapeRun['status'], startedAt: String(row.started_at), completedAt: (row.completed_at as string | null) ?? null, listingsFound: (row.listings_found as number | null) ?? null, errorMessage: (row.error_message as string | null) ?? null };
    }

    private updateScrapeRun(runId: number, status: ScrapeRun['status'], listingsFound: number | null, errorMessage: string | null): void {
        this.db.prepare("UPDATE scrape_runs SET status = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), listings_found = ?, error_message = ? WHERE id = ?").run(status, listingsFound, errorMessage, runId);
    }

    setManualBuildingType(flatId: number, buildingType: string | null): void {
        this.db.prepare(`
            UPDATE flats
            SET manual_building_type = ?, building_type = ?, last_seen_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(buildingType, buildingType, flatId);
    }

    setHidden(flatId: number, hidden: boolean): void {
        this.db.prepare('UPDATE flats SET hidden = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(hidden ? 1 : 0, flatId);
    }

    setManualAccept(flatId: number, accepted: boolean): void {
        this.db.prepare('UPDATE flats SET manual_accept = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(accepted ? 1 : 0, flatId);
    }

    setRejectionReason(flatId: number, reason: string | null): void {
        this.db.prepare('UPDATE flats SET rejection_reason = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(reason, flatId);
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
            id: Number(row.id), source: String(row.source), url: String(row.url), imageUrl: (row.image_url as string | null) ?? null,
            rejectionReason: (row.rejection_reason as string | null) ?? null,
            uncertaintyReason: (row.uncertainty_reason as string | null) ?? null,
            title: String(row.title),
            description: (row.description as string | null) ?? null, price: (row.price as number | null) ?? null,
            area: (row.area as number | null) ?? null, rooms: (row.rooms as number | null) ?? null,
            address: (row.address as string | null) ?? null, floor: (row.floor as number | null) ?? null,
            totalFloors: (row.total_floors as number | null) ?? null,
            pricePerM2: (row.price_per_m2 as number | null) ?? null, district: (row.district as string | null) ?? null,
            createdAt: (row.created_at as string | null) ?? null,
            publishedAt: (row.published_at as string | null) ?? null,
            refreshedAt: (row.refreshed_at as string | null) ?? null,
            buildingType: (row.manual_building_type as string | null) ?? (row.building_type as string | null) ?? null,
            hasGarage: fromSqlBoolean(row.has_garage as number | null),
            hasParkingSpace: fromSqlBoolean(row.has_parking_space as number | null),
            hasStorageUnit: fromSqlBoolean(row.has_storage_unit as number | null),
            hasBasement: fromSqlBoolean(row.has_basement as number | null),
            hasElevator: fromSqlBoolean(row.has_elevator as number | null),
            hasBalcony: fromSqlBoolean(row.has_balcony as number | null), buildYear: (row.build_year as number | null) ?? null,
            hasGarden: fromSqlBoolean(row.has_garden as number | null),
            ownershipType: (row.ownership_type as string | null) ?? null,
            marketType: (row.market_type as string | null) ?? null,
            hidden: Boolean(row.hidden), manualAccept: Boolean(row.manual_accept), rent: (row.rent as number | null) ?? null,
            commission: (row.commission as string | null) ?? null,
            listingStatus: (row.listing_status as string | null) ?? null,
            propertyGroupId: (row.property_group_id as number | null) ?? null,
            firstSeenAt: String(row.first_seen_at), lastSeenAt: String(row.last_seen_at)
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