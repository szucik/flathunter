import assert from 'node:assert/strict';
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