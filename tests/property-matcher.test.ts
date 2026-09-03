import assert from 'node:assert/strict';
import test from 'node:test';
import PropertyMatcher from '../src/property-matcher';
import type { Flat } from '../src/types';

const matcher = new PropertyMatcher();

function flat(overrides: Partial<Flat>): Flat {
    return {
        source: 'olx',
        url: 'https://example.com/offer',
        title: '3 pokoje Mokotów balkon',
        description: 'Mieszkanie z windą i garażem',
        price: 900000,
        area: 60,
        rooms: 3,
        pricePerM2: 15000,
        district: 'Mokotów',
        createdAt: 'Dzisiaj',
        buildingType: 'kamienica',
        hasGarage: true,
        hasElevator: true,
        hasBalcony: true,
        buildYear: 2010,
        ...overrides
    };
}

test('matches the same property despite different source and price', () => {
    const left = flat({ source: 'olx', price: 900000 });
    const right = flat({ source: 'otodom', price: 930000, title: 'Jasne mieszkanie Mokotów' });

    assert.ok(matcher.findBestMatch(left, [{ ...right, id: 1 }])?.score >= 75);
});

test('does not match listings from the same source', () => {
    const candidate = { ...flat({ source: 'olx' }), id: 1 };
    assert.equal(matcher.findBestMatch(flat({ source: 'olx' }), [candidate]), null);
});

test('does not match different districts with similar area', () => {
    const candidate = { ...flat({ source: 'otodom', district: 'Bielany' }), id: 1 };
    assert.equal(matcher.findBestMatch(flat({ source: 'olx' }), [candidate]), null);
});