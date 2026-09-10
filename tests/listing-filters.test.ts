import assert from 'node:assert/strict';
import test from 'node:test';
import type { Flat } from '../src/types';
import { getRejectionReasons, getUncertaintyReasons, isUncertainListing, matchesConfiguredFilters } from '../src/listing-filters';

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

test('accepts a district outside the allowlist when only excluded districts are configured', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: '',
        EXCLUDED_DISTRICTS: 'Ursus, Białołęka, Wawer',
        EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000',
        MAX_PRICE: '1200000',
        MIN_AREA: '55',
        REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true',
        REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat({ district: 'Wola' })), true);
});

test('reports one specific district reason without duplicating the rejection rule', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: 'Bemowo, Targówek',
        EXCLUDED_DISTRICTS: 'Ursus, Białołęka',
        EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000',
        MAX_PRICE: '1200000',
        MIN_AREA: '55',
        REQUIRE_ELEVATOR: 'false',
        REQUIRE_GARAGE: 'false',
        REQUIRE_BALCONY: 'false'
    });

    assert.deepEqual(getRejectionReasons(makeFlat({ district: 'Ursus' })), [
        'dzielnica „Ursus” jest wykluczona (Ursus, Białołęka)'
    ]);
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

test('rejects a listing with a confirmed missing required feature instead of marking it uncertain', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: '', EXCLUDED_DISTRICTS: '', EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000', MAX_PRICE: '1200000', MIN_AREA: '55', REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true', REQUIRE_BALCONY: 'true'
    });

    assert.equal(isUncertainListing(makeFlat({ hasElevator: false })), false);
});

test('accepts a new ground-floor listing without an elevator', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: '', EXCLUDED_DISTRICTS: '', EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000', MAX_PRICE: '1200000', MIN_AREA: '55', REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true', REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat({ floor: 0, hasElevator: false, marketType: 'pierwotny', buildYear: null })), true);
});

test('accepts a ground-floor listing from the last ten years without an elevator', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: '', EXCLUDED_DISTRICTS: '', EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000', MAX_PRICE: '1200000', MIN_AREA: '55', REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true', REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat({ floor: 0, hasElevator: false, buildYear: new Date().getFullYear() - 10 })), true);
});

test('still rejects an old ground-floor listing without an elevator', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: '', EXCLUDED_DISTRICTS: '', EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000', MAX_PRICE: '1200000', MIN_AREA: '55', REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true', REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat({ floor: 0, hasElevator: false, marketType: 'wtórny', buildYear: 1980 })), false);
});

test('reports the exact missing data that makes a listing uncertain', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: '', EXCLUDED_DISTRICTS: '', EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000', MAX_PRICE: '1200000', MIN_AREA: '55', REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true', REQUIRE_BALCONY: 'true'
    });

    assert.deepEqual(getUncertaintyReasons(makeFlat({ hasElevator: null, hasGarage: null, hasParkingSpace: null })), [
        'winda: brak danych w ogłoszeniu',
        'garaż: brak danych w ogłoszeniu; prywatne miejsce: brak danych w ogłoszeniu'
    ]);
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

test('accepts private parking for a building younger than twenty years', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: 'Bemowo, Targówek', EXCLUDED_DISTRICTS: '', EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000', MAX_PRICE: '1200000', MIN_AREA: '55', REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true', REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat({ buildYear: new Date().getFullYear() - 19, hasGarage: false, hasParkingSpace: true })), true);
});

test('rejects private parking alone for a building twenty years old or older', () => {
    Object.assign(process.env, {
        ALLOWED_DISTRICTS: 'Bemowo, Targówek', EXCLUDED_DISTRICTS: '', EXCLUDED_BUILDING_TYPES: '',
        MIN_PRICE: '700000', MAX_PRICE: '1200000', MIN_AREA: '55', REQUIRE_ELEVATOR: 'true',
        REQUIRE_GARAGE: 'true', REQUIRE_BALCONY: 'true'
    });

    assert.equal(matchesConfiguredFilters(makeFlat({ buildYear: new Date().getFullYear() - 20, hasGarage: false, hasParkingSpace: true })), false);
});
