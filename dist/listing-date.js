"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWithinAge = isWithinAge;
const MONTHS = {
    stycznia: 0,
    lutego: 1,
    marca: 2,
    kwietnia: 3,
    maja: 4,
    czerwca: 5,
    lipca: 6,
    sierpnia: 7,
    września: 8,
    października: 9,
    listopada: 10,
    grudnia: 11
};
function isWithinAge(value, maxAgeDays, now = new Date()) {
    const listingDate = parseListingDate(value, now);
    if (!listingDate)
        return false;
    const today = startOfDay(now);
    const ageInDays = Math.floor((today.getTime() - listingDate.getTime()) / 86_400_000);
    return ageInDays >= 0 && ageInDays <= maxAgeDays;
}
function parseListingDate(value, now) {
    if (!value)
        return null;
    const normalized = value.toLocaleLowerCase('pl-PL');
    if (normalized.includes('dzisiaj'))
        return startOfDay(now);
    if (normalized.includes('wczoraj')) {
        const yesterday = startOfDay(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
    }
    const match = normalized.match(/(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})/);
    if (!match)
        return null;
    const month = MONTHS[match[2]];
    if (month === undefined)
        return null;
    return new Date(Number(match[3]), month, Number(match[1]));
}
function startOfDay(value) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
