import assert from 'node:assert/strict';
import test from 'node:test';
import type { Flat } from '../src/types';
import { isUncertainListing, matchesConfiguredFilters } from '../src/listing-filters';

const originalEnvironment = { ...process.env };

function makeFlat(overrides: Partial<Flat> = {}): Flat {
    return {
        source: 'olx',
        url: 'https://www.olx.pl/d/oferta/test',
        imageUrl: null,
        title: 'Mieszkanie',
        description: null,
        price: 900000,
        area: 60,
        rooms: 3,
        pricePerM2: null,
        district: 'Targówek',
        address: null,
        floor: 2,
        totalFloors: 5,
        ownershipType: null,
        rent: null,
        commission: null,
        listingStatus: null,
        publishedAt: null,
        refreshedAt: null,
        createdAt: null,
        buildingType: 'blok',
        hasGarage: true,
        hasParkingSpace: true,
        hasStorageUnit: null,
        hasBasement: null,
        hasElevator: true,
        hasBalcony: true,
        hasGarden: null,
        buildYear: 2020,
        ...overrides
    };
}

test.afterEach(() => {
    process.env = { ...originalEnvironment };
});

test('rejects a listing without area when minimum area is configured', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: 'Bemowo, Targówek',
        EXCLUDED_DISTRICTS: '',
        EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000',
        MAX_PRICE: '1200000',
        MIN_AREA: '55',
        REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true',
        REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat({ area: null })), false);
});

test('rejects a listing outside the allowed districts despite similar spelling', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: 'Bemowo, Targówek',
        EXCLUDED_DISTRICTS: '',
        EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000',
        MAX_PRICE: '1200000',
        MIN_AREA: '55',
        REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true',
        REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat({ district: 'Śródmieście' })), false);
});

test('accepts a listing that satisfies all configured filters', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: 'Bemowo, Targówek',
        EXCLUDED_DISTRICTS: '',
        EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000',
        MAX_PRICE: '1200000',
        MIN_AREA: '55',
        REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true',
        REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat()), true);
});

test('marks a listing with unknown required features as uncertain', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: 'Bemowo, Targówek',
        EXCLUDED_DISTRICTS: '',
        EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000',
        MAX_PRICE: '1200000',
        MIN_AREA: '55',
        REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true',
        REQUIRE_BALCONY: 'true'
    });

    assert.equal(isUncertainListing(makeFlat({ hasElevator: null })), true);
});

test('does not mark an offer outside price range as uncertain', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: 'Bemowo, Targówek',
        EXCLUDED_DISTRICTS: '',
        EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000',
        MAX_PRICE: '1200000',
        MIN_AREA: '55',
        REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true',
        REQUIRE_BALCONY: 'true'
    });

    assert.equal(isUncertainListing(makeFlat({ price: 650000, hasElevator: null })), false);
});

test('accepts a ground-floor listing with a garden as outdoor space', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: 'Bemowo, Targówek', EXCLUDED_DISTRICTS: '', EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000', MAX_PRICE: '1200000', MIN_AREA: '55', REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true', REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat({ hasBalcony: false, hasGarden: true })), true);
});
