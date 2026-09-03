"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class PropertyMatcher {
    findBestMatch(flat, candidates) {
        const matches = candidates
            .filter(candidate => candidate.source !== flat.source)
            .map(candidate => ({ flat: candidate, score: this.score(flat, candidate) }))
            .filter(match => match.score >= 75)
            .sort((left, right) => right.score - left.score);
        return matches[0] || null;
    }
    score(left, right) {
        if (left.district && right.district && normalize(left.district) !== normalize(right.district))
            return 0;
        let score = 0;
        if (left.district && right.district && normalize(left.district) === normalize(right.district))
            score += 35;
        if (left.area !== null && right.area !== null && Math.abs(left.area - right.area) <= 1.5)
            score += 30;
        if (left.rooms !== null && right.rooms !== null && left.rooms === right.rooms)
            score += 20;
        if (left.buildYear !== null && right.buildYear !== null && left.buildYear === right.buildYear)
            score += 10;
        score += Math.min(15, this.tokenOverlap(left, right) * 3);
        return score;
    }
    tokenOverlap(left, right) {
        const leftTokens = tokens(`${left.title} ${left.description || ''}`);
        const rightTokens = tokens(`${right.title} ${right.description || ''}`);
        return [...leftTokens].filter(token => rightTokens.has(token)).length;
    }
}
function normalize(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl-PL');
}
function tokens(value) {
    return new Set(normalize(value).split(/[^a-z0-9]+/).filter(token => token.length >= 4));
}
exports.default = PropertyMatcher;
