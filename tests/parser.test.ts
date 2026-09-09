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

test('extracts the first listing image', () => {
    const html = `<div data-cy="l-card"><a data-testid="card-title-link" href="/d/oferta/test"><h4>Mieszkanie</h4></a><img src="https://images.example/flat.jpg"></div>`;
    assert.equal(parser.parseListingPage(html)[0]?.imageUrl, 'https://images.example/flat.jpg');
});

test('parses Otodom detail fields', () => {
    const html = readFileSync('patterns/view-otodom.html', 'utf8');
    const flat = parser.parseDetailPage(html);

    assert.equal(flat.floor, 4);
    assert.equal(flat.totalFloors, 11);
    assert.equal(flat.rooms, 4);
    assert.equal(flat.rent, 600);
    assert.equal(flat.hasElevator, true);
    assert.equal(flat.hasGarage, false);
    assert.equal(flat.hasBalcony, true);
    assert.match(flat.description || '', /Kartaginy/);
});

test('detects explicit large-panel construction from Otodom details', () => {
    const html = readFileSync('patterns/otodom-wielkapłyta.html', 'utf8');
    const flat = parser.parseDetailPage(html);

    assert.equal(flat.buildingType, 'wielka plyta');
    assert.equal(flat.buildYear, 1985);
});

test('extracts description from an OLX detail page with a different layout', () => {
    const html = readFileSync('patterns/olx-wp.html', 'utf8');
    const description = parser.parseDescriptionPage(html);

    assert.match(description || '', /dwustronne|mieszkanie/i);
});

test('does not infer a private garage from an ambiguous parking label', () => {
    const flat = parser.parseDetailPage('<div data-sentry-component="AdDetailsBase">garaż/miejsce parkingowe</div>');

    assert.equal(flat.hasGarage, false);
});

test('keeps missing feature data unknown instead of false', () => {
    const flat = parser.parseDetailPage('<div>Opis ogłoszenia bez parametrów</div>');

    assert.equal(flat.hasElevator, null);
    assert.equal(flat.hasBalcony, null);
    assert.equal(flat.hasGarage, null);
});