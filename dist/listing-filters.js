"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchesConfiguredFilters = matchesConfiguredFilters;
exports.isUncertainListing = isUncertainListing;
function matchesConfiguredFilters(flat, reviewBuildingType = null, includeExcludedBuildingTypes = false) {
    if (isExcludedDistrict(flat.district))
        return false;
    const allowedDistricts = parseList(process.env.ALLOWED_DISTRICTS);
    if (allowedDistricts.length > 0 && (!flat.district || !allowedDistricts.some(district => sameNormalizedValue(district, flat.district)))) {
        return false;
    }
    if (!reviewBuildingType && !includeExcludedBuildingTypes && isExcludedBuildingType(flat.buildingType))
        return false;
    const minPrice = parseConfiguredNumber(process.env.MIN_PRICE, 0);
    const maxPrice = parseConfiguredNumber(process.env.MAX_PRICE, Number.MAX_SAFE_INTEGER);
    if (flat.price === null || flat.price < minPrice || flat.price > maxPrice)
        return false;
    const minArea = parseConfiguredNumber(process.env.MIN_AREA, 0);
    if (flat.area === null || flat.area < minArea)
        return false;
    if (process.env.REQUIRE_ELEVATOR !== 'false' && flat.hasElevator !== true)
        return false;
    if (process.env.REQUIRE_GARAGE !== 'false' && !hasRequiredParking(flat))
        return false;
    if (process.env.REQUIRE_BALCONY !== 'false' && !hasOutdoorSpace(flat))
        return false;
    return true;
}
function isUncertainListing(flat) {
    if (isExcludedDistrict(flat.district))
        return false;
    const allowedDistricts = parseList(process.env.ALLOWED_DISTRICTS);
    if (allowedDistricts.length > 0 && (!flat.district || !allowedDistricts.some(district => sameNormalizedValue(district, flat.district)))) {
        return false;
    }
    if (isExcludedBuildingType(flat.buildingType))
        return false;
    const minPrice = parseConfiguredNumber(process.env.MIN_PRICE, 0);
    const maxPrice = parseConfiguredNumber(process.env.MAX_PRICE, Number.MAX_SAFE_INTEGER);
    if (flat.price !== null && (flat.price < minPrice || flat.price > maxPrice))
        return false;
    const minArea = parseConfiguredNumber(process.env.MIN_AREA, 0);
    if (flat.area !== null && flat.area < minArea)
        return false;
    if (flat.price === null || flat.area === null)
        return true;
    if (process.env.REQUIRE_ELEVATOR !== 'false' && flat.hasElevator === null)
        return true;
    if (process.env.REQUIRE_GARAGE !== 'false' && flat.hasGarage === null && flat.hasParkingSpace === null)
        return true;
    if (process.env.REQUIRE_BALCONY !== 'false' && flat.hasBalcony !== true && flat.hasGarden !== true)
        return true;
    return false;
}
function hasOutdoorSpace(flat) {
    return flat.hasBalcony === true || flat.hasGarden === true;
}
function isExcludedDistrict(value) {
    const excluded = parseList(process.env.EXCLUDED_DISTRICTS || 'Ursus,Białołęka,Wawer');
    return value !== null && excluded.some(item => sameNormalizedValue(item, value));
}
function isExcludedBuildingType(value) {
    const excluded = parseList(process.env.EXCLUDED_BUILDING_TYPES || 'wielka plyta');
    return value !== null && excluded.some(item => sameNormalizedValue(item, value));
}
function parseList(value) {
    return (value || '').split(',').map(item => item.trim()).filter(Boolean);
}
function sameNormalizedValue(left, right) {
    return normalizeValue(left) === normalizeValue(right);
}
function normalizeValue(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pl-PL');
}
function parseConfiguredNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function hasRequiredParking(flat) {
    if (flat.hasGarage === true)
        return true;
    const currentYear = new Date().getFullYear();
    const modernBuilding = flat.buildYear !== null && flat.buildYear >= currentYear - 20;
    return modernBuilding && flat.hasParkingSpace === true;
}
