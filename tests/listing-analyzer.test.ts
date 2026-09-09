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

test('classifies a Rama H building separately from large-panel construction', () => {
    const analyzed = analyzer.analyze(flat({
        title: 'Mieszkanie w budynku Rama H',
        buildingType: 'blok',
        buildYear: 1985,
        totalFloors: 11,
        hasGarage: null
    }));

    assert.equal(analyzed.buildingType, 'rama h');
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

test('classifies a high-rise from the 1970s with ambiguous parking as large-panel', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'Blok z 1976 roku, 12 pięter, garaż/miejsce parkingowe.',
        buildingType: 'blok',
        buildYear: 1976,
        totalFloors: 12,
        hasGarage: null
    }));

    assert.equal(analyzed.hasGarage, false);
    assert.equal(analyzed.buildingType, 'wielka plyta');
});

test('uses elevator and basement as supporting large-panel signals', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'Blok z 1978 roku, 11 pięter, winda, piwnica.',
        buildingType: 'blok',
        buildYear: 1978,
        totalFloors: 11,
        hasElevator: true
    }));

    assert.equal(analyzed.buildingType, 'wielka plyta');
});

test('does not require an elevator for a four-floor block', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'Blok z 1978 roku, 4 piętra, piwnica.',
        buildingType: 'blok',
        buildYear: 1978,
        totalFloors: 4,
        hasElevator: false
    }));

    assert.equal(analyzed.buildingType, 'wielka plyta');
});

test('uses secondary-market and low-rent data as supporting signals', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'Blok z 1976 roku, 10 pięter, winda.',
        buildingType: 'blok',
        buildYear: 1976,
        totalFloors: 10,
        hasElevator: true,
        marketType: 'wtórny',
        rent: 650
    }));

    assert.equal(analyzed.buildingType, 'wielka plyta');
});

test('does not classify a modern building with underground garage as large-panel', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'Budynek z 2016 roku, płyta gazowa, 2 miejsca w garażu podziemnym.',
        buildingType: 'blok',
        buildYear: 2016,
        totalFloors: 5,
        hasGarage: true
    }));

    assert.equal(analyzed.buildingType, 'blok');
});

test('classifies an old high-rise made of reinforced concrete as large-panel', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'Budynek z żelbetonu z 1984 roku, 10 pięter, z windą.',
        buildingType: null,
        buildYear: 1984,
        totalFloors: 10,
        hasElevator: true
    }));

    assert.equal(analyzed.buildingType, 'wielka plyta');
});

test('classifies explicit Rama H technology', () => {
    const analyzed = analyzer.analyze(flat({ title: 'Mieszkanie w technologii rama-H' }));

    assert.equal(analyzed.buildingType, 'rama h');
});

test('recognizes WP keywords without Polish diacritics', () => {
    const analyzed = analyzer.analyze(flat({ title: 'Mieszkanie z wielkiej plyty' }));

    assert.equal(analyzed.buildingType, 'wielka plyta');
});

test('recognizes the z ramy H keyword variant', () => {
    const analyzed = analyzer.analyze(flat({ title: 'Mieszkanie z ramy H' }));

    assert.equal(analyzed.buildingType, 'rama h');
});

test('classifies a likely Rama H block from structural signals', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'Blok z 1982 roku. Konstrukcja szkieletowa, wszystkie ściany działowe, cegła.',
        buildingType: 'blok',
        buildYear: 1982,
        hasGarage: true
    }));

    assert.equal(analyzed.buildingType, 'rama h');
});

test('does not classify a large-panel description as Rama H', () => {
    const analyzed = analyzer.analyze(flat({
        description: 'Wielka płyta, ściany nośne między pokojami, blok z 1982 roku.',
        buildingType: 'blok',
        buildYear: 1982
    }));

    assert.equal(analyzed.buildingType, 'wielka plyta');
});
