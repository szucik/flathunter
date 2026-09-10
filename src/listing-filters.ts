import type { Flat } from './types';

export function matchesConfiguredFilters(
    flat: Flat,
    reviewBuildingType: string | null = null,
    includeExcludedBuildingTypes = false
): boolean {
    if (isExcludedDistrict(flat.district)) return false;

    const allowedDistricts = parseList(process.env.ALLOWED_DISTRICTS);
    if (allowedDistricts.length > 0 && (!flat.district || !allowedDistricts.some(district => sameNormalizedValue(district, flat.district!)))) {
        return false;
    }

    if (!reviewBuildingType && !includeExcludedBuildingTypes && isExcludedBuildingType(flat.buildingType)) return false;

    const minPrice = parseConfiguredNumber(process.env.MIN_PRICE, 0);
    const maxPrice = parseConfiguredNumber(process.env.MAX_PRICE, Number.MAX_SAFE_INTEGER);
    if (flat.price === null || flat.price < minPrice || flat.price > maxPrice) return false;

    const minArea = parseConfiguredNumber(process.env.MIN_AREA, 0);
    if (flat.area === null || flat.area < minArea) return false;

    if (process.env.REQUIRE_ELEVATOR !== 'false' && flat.hasElevator !== true) return false;
    if (process.env.REQUIRE_GARAGE !== 'false' && !hasRequiredParking(flat)) return false;
    if (process.env.REQUIRE_BALCONY !== 'false' && !hasOutdoorSpace(flat)) return false;

    return true;
}

export function isUncertainListing(flat: Flat): boolean {
    if (isExcludedDistrict(flat.district)) return false;

    const allowedDistricts = parseList(process.env.ALLOWED_DISTRICTS);
    if (allowedDistricts.length > 0 && (!flat.district || !allowedDistricts.some(district => sameNormalizedValue(district, flat.district!)))) {
        return false;
    }
    if (isExcludedBuildingType(flat.buildingType)) return false;

    const minPrice = parseConfiguredNumber(process.env.MIN_PRICE, 0);
    const maxPrice = parseConfiguredNumber(process.env.MAX_PRICE, Number.MAX_SAFE_INTEGER);
    if (flat.price !== null && (flat.price < minPrice || flat.price > maxPrice)) return false;

    const minArea = parseConfiguredNumber(process.env.MIN_AREA, 0);
    if (flat.area !== null && flat.area < minArea) return false;

    if (flat.price === null || flat.area === null) return true;
    if (process.env.REQUIRE_ELEVATOR !== 'false' && flat.hasElevator === null) return true;
    if (process.env.REQUIRE_GARAGE !== 'false' && flat.hasGarage === null && flat.hasParkingSpace === null) return true;
    if (process.env.REQUIRE_BALCONY !== 'false' && flat.hasBalcony !== true && flat.hasGarden !== true) return true;

    return false;
}

export function getUncertaintyReasons(flat: Flat): string[] {
    const reasons: string[] = [];

    if (flat.price === null) reasons.push('cena: brak danych w ogłoszeniu');
    if (flat.area === null) reasons.push('metraż: brak danych w ogłoszeniu');
    if (process.env.REQUIRE_ELEVATOR !== 'false' && flat.hasElevator === null) reasons.push('winda: brak danych w ogłoszeniu');
    if (process.env.REQUIRE_GARAGE !== 'false' && flat.hasGarage === null && flat.hasParkingSpace === null) {
        reasons.push('garaż: brak danych w ogłoszeniu; prywatne miejsce: brak danych w ogłoszeniu');
    }
    if (process.env.REQUIRE_BALCONY !== 'false' && flat.hasBalcony === null && flat.hasGarden === null) {
        reasons.push('balkon/taras: brak danych w ogłoszeniu; ogród: brak danych w ogłoszeniu');
    }

    return reasons;
}

export function getRejectionReasons(flat: Flat): string[] {
    const reasons: string[] = [];
    const district = flat.district;
    const allowedDistricts = parseList(process.env.ALLOWED_DISTRICTS);
    const excludedDistricts = parseList(process.env.EXCLUDED_DISTRICTS || 'Ursus,Białołęka,Wawer');
    const minPrice = parseConfiguredNumber(process.env.MIN_PRICE, 0);
    const maxPrice = parseConfiguredNumber(process.env.MAX_PRICE, Number.MAX_SAFE_INTEGER);
    const minArea = parseConfiguredNumber(process.env.MIN_AREA, 0);

    if (isExcludedDistrict(district)) {
        reasons.push(`dzielnica „${district}” jest wykluczona (${excludedDistricts.join(', ')})`);
    } else if (allowedDistricts.length > 0 && (!district || !allowedDistricts.some(allowedDistrict => sameNormalizedValue(allowedDistrict, district)))) {
        reasons.push(`dzielnica „${district ?? 'nie rozpoznano'}” nie należy do listy (${allowedDistricts.join(', ')})`);
    }
    if (isExcludedBuildingType(flat.buildingType)) reasons.push(`wykluczony typ budynku: „${flat.buildingType}”`);
    if (flat.price === null) reasons.push('brak ceny');
    else if (flat.price < minPrice) reasons.push(`cena ${flat.price} zł jest niższa niż minimum ${minPrice} zł`);
    else if (flat.price > maxPrice) reasons.push(`cena ${flat.price} zł przekracza maksimum ${maxPrice} zł`);
    if (flat.area === null) reasons.push('brak metrażu');
    else if (flat.area < minArea) reasons.push(`metraż ${flat.area} m² jest mniejszy niż minimum ${minArea} m²`);
    if (process.env.REQUIRE_ELEVATOR !== 'false' && flat.hasElevator !== true) reasons.push(`winda: ${formatFeatureValue(flat.hasElevator)}`);
    if (process.env.REQUIRE_GARAGE !== 'false' && !hasRequiredParking(flat)) {
        reasons.push(`garaż: ${formatFeatureValue(flat.hasGarage)}; prywatne miejsce: ${formatFeatureValue(flat.hasParkingSpace ?? null)}; rok budowy: ${flat.buildYear ?? 'brak danych'}`);
    }
    if (process.env.REQUIRE_BALCONY !== 'false' && !hasOutdoorSpace(flat)) {
        reasons.push(`balkon/taras: ${formatFeatureValue(flat.hasBalcony)}; ogród: ${formatFeatureValue(flat.hasGarden)}`);
    }
    return [...new Set(reasons)];
}

function hasOutdoorSpace(flat: Flat): boolean {
    return flat.hasBalcony === true || flat.hasGarden === true;
}

function isExcludedDistrict(value: string | null): boolean {
    const excluded = parseList(process.env.EXCLUDED_DISTRICTS || 'Ursus,Białołęka,Wawer');
    return value !== null && excluded.some(item => sameNormalizedValue(item, value));
}

function isExcludedBuildingType(value: string | null): boolean {
    const excluded = parseList(process.env.EXCLUDED_BUILDING_TYPES || 'wielka plyta');
    return value !== null && excluded.some(item => sameNormalizedValue(item, value));
}

function parseList(value: string | undefined): string[] {
    return (value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function sameNormalizedValue(left: string, right: string): boolean {
    return normalizeValue(left) === normalizeValue(right);
}

function normalizeValue(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pl-PL');
}

function parseConfiguredNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatFeatureValue(value: boolean | null): string {
    if (value === true) return 'potwierdzono';
    if (value === false) return 'nie znaleziono';
    return 'brak danych w ogłoszeniu';
}

function hasRequiredParking(flat: Flat): boolean {
    if (flat.hasGarage === true) return true;
    const currentYear = new Date().getFullYear();
    const modernBuilding = flat.buildYear !== null && flat.buildYear > currentYear - 20;
    return modernBuilding && flat.hasParkingSpace === true;
}
