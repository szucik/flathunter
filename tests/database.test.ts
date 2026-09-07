import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import FlatsDatabase from '../src/database';
import type { Flat } from '../src/types';

function flat(): Flat {
    return {
        source: 'olx',
        url: 'https://www.olx.pl/d/oferta/test-hidden',
        title: 'Testowa oferta',
        description: null,
        price: 900000,
        area: 60,
        rooms: 3,
        pricePerM2: 15000,
        district: 'Mokotów',
        address: null,
        floor: 3,
        totalFloors: 5,
        ownershipType: null,
        marketType: 'wtórny',
        rent: 700,
        commission: null,
        listingStatus: null,
        publishedAt: null,
        refreshedAt: null,
        createdAt: null,
        buildingType: 'blok',
        hasGarage: true,
        hasElevator: true,
        hasBalcony: true,
        buildYear: 2018
    };
}

test('persists hidden status and restores the listing', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'flathunter-test-'));
    const database = new FlatsDatabase(path.join(directory, 'flats.db'));

    try {
        const listing = flat();
        assert.equal(database.insertFlat(listing), true);
        const saved = database.getFlatByUrl(listing.url);
        assert.ok(saved);
        assert.equal(saved.hidden, false);

        database.setHidden(saved.id, true);
        assert.equal(database.getFlatByUrl(listing.url)?.hidden, true);

        database.setHidden(saved.id, false);
        assert.equal(database.getFlatByUrl(listing.url)?.hidden, false);
    } finally {
        database.close();
        rmSync(directory, { recursive: true, force: true });
    }
});
