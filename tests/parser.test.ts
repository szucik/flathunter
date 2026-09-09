import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Parser from '../src/parser';

const parser = new Parser();

function parseTitle(title: string): number | null {
    const html = `<div data-cy="l-card"><a data-testid="card-title-link" href="/d/oferta/test"><h4>${title}</h4></a></div>`;
    return parser.parseListingPage(html)[0]?.rooms ?? null;
}

test('parses room count before the word pokoje', () => {
    assert.equal(parseTitle('Mieszkanie 3 pokoje 65 m2'), 3);
});

test('parses room count without a space', () => {
    assert.equal(parseTitle('Mieszkanie 4pokoje balkon'), 4);
});

test('parses room count from adjective form', () => {
    assert.equal(parseTitle('Mieszkanie 3-pokojowe z balkonem'), 3);
});

test('does not read the first digit of the area as room count', () => {
    assert.equal(parseTitle('Targówek, 3 pokoje 83m, loggia'), 3);
});

test('parses abbreviated room count', () => {
    assert.equal(parseTitle('Ustawne 3pok na Bielanach'), 3);
});

test('parses Otodom detail fields', () => {
    const html = readFileSync('patterns/view-otodom.html', 'utf8');
    const flat = parser.parseDetailPage(html);

    assert.equal(flat.floor, 4);
    assert.equal(flat.totalFloors, 11);
    assert.equal(flat.rooms, 4);
    assert.equal(flat.rent, 600);
    assert.equal(flat.hasElevator, true);
    assert.equal(flat.hasGarage, true);
    assert.equal(flat.hasBalcony, true);
    assert.match(flat.description || '', /Kartaginy/);
});