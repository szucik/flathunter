import assert from 'node:assert/strict';
import test from 'node:test';
import ListingAnalyzer from '../src/listing-analyzer';
import type { Flat } from '../src/types';

const analyzer = new ListingAnalyzer();

function flat(overrides: Partial<Flat>): Flat {
    return {
        source: 'otodom',
        url: 'https://www.otodom.pl/pl/oferta/test',
        title: 'Mieszkanie 3 pokoje',
        description: null,
        price: 800000,
        area: 60,
        rooms: 3,
        pricePerM2: null,
        district: 'Mokotow',
        address: null,
        floor: 2,
        totalFloors: 11,
        ownershipType: null,
        rent: null,
        commission: null,
        listingStatus: null,
        publishedAt: null,
        refreshedAt: null,
        createdAt: null,
        buildingType: 'blok',
        hasGarage: null,
        hasElevator: true,
        hasBalcony: null,
        buildYear: 1985,
        ...overrides
    };
}

test('keeps explicit large-panel building type', () => {
    assert.equal(analyzer.analyze(flat({ buildingType: 'wielka plyta' })).buildingType, 'wielka plyta');
});

test('classifies an old block without garage as likely large-panel construction', () => {
    assert.equal(analyzer.analyze(flat({ totalFloors: 11, hasGarage: null })).buildingType, 'wielka plyta');
});

test('does not classify an old block with confirmed garage as large-panel construction', () => {
    assert.equal(analyzer.analyze(flat({ totalFloors: 11, hasGarage: true })).buildingType, 'blok');
});

test('does not classify a Rama H building as large-panel construction', () => {
    const analyzed = analyzer.analyze(flat({
        title: 'Mieszkanie w budynku Rama H',
        buildingType: 'blok',
        buildYear: 1985,
        totalFloors: 11,
        hasGarage: null
    }));

    assert.equal(analyzed.buildingType, 'blok');
});

test('uses description signals in the large-panel score', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'Stary blok, dwustronne mieszkanie, zsyp i ślepa kuchnia.',
        buildingType: 'blok',
        buildYear: 1978,
        totalFloors: 5,
        hasGarage: null
    }));

    assert.equal(analyzed.buildingType, 'wielka plyta');
});

test('does not treat public parking as a private garage', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'W budynku są ogólnodostępne miejsca parkingowe przed blokiem.',
        hasGarage: null
    }));

    assert.equal(analyzed.hasGarage, false);
});
