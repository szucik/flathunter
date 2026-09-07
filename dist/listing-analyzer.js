"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ListingAnalyzer {
    analyze(flat) {
        const text = `${flat.title} ${flat.description || ''}`.toLocaleLowerCase('pl-PL');
        return {
            ...flat,
            address: this.matchAddress(text) || flat.address,
            floor: this.matchFloor(text) ?? flat.floor,
            totalFloors: this.matchTotalFloors(text) ?? flat.totalFloors,
            ownershipType: this.matchOwnership(text) || flat.ownershipType,
            rent: this.matchMoney(text, /(?:czynsz|opłata administracyjna|oplaty administracyjne)[^\d]{0,20}([\d\s]+)\s*zł/),
            commission: this.matchCommission(text) || flat.commission,
            listingStatus: this.matchStatus(text) || flat.listingStatus,
            buildingType: this.matchBuildingType(text, flat),
            hasGarage: this.matchPresence(text, [/garaż/, /garaz/, /miejsce postojowe/, /miejsce parkingowe/, /parking podziemny/], [/bez garażu/, /brak garażu/, /bez miejsca postojowego/, /ogólnodostępne miejsca parkingowe/, /publiczny parking/]) ?? flat.hasGarage,
            hasElevator: this.matchPresence(text, [/winda/, /windą/], [/bez windy/, /brak windy/, /bez dźwigu/]) ?? flat.hasElevator,
            hasBalcony: this.matchPresence(text, [/balkon/, /loggia/, /taras/], [/bez balkonu/, /brak balkonu/]) ?? flat.hasBalcony,
            buildYear: this.matchBuildYear(text) ?? flat.buildYear
        };
    }
    matchAddress(text) {
        const match = text.match(/(?:adres|ul\.?)[\s:]+([^,.;\n]{3,60})/i);
        return match ? match[1].trim() : null;
    }
    matchFloor(text) {
        const match = text.match(/(?:na\s+)?(?:parterze|parter)\b/i);
        if (match)
            return 0;
        const numbered = text.match(/(?:na\s+)?(\d{1,2})\.?\s*(?:piętrze|pietrze)\b/i);
        return numbered ? Number(numbered[1]) : null;
    }
    matchTotalFloors(text) {
        const match = text.match(/(\d{1,2})\s*(?:pięter|pieter|kondygnacji)\b/i);
        return match ? Number(match[1]) : null;
    }
    matchOwnership(text) {
        if (/pełna własność|pelna wlasnosc/.test(text))
            return 'pełna własność';
        if (/spółdzielczo-własnościowe|spoldzielczo-wlasnosciowe/.test(text))
            return 'spółdzielcze własnościowe';
        if (/spółdzielcze lokatorskie|spoldzielcze lokatorskie/.test(text))
            return 'spółdzielcze lokatorskie';
        if (/udział|udzial/.test(text))
            return 'udział';
        return null;
    }
    matchMoney(text, pattern) {
        const match = text.match(pattern);
        return match ? Number(match[1].replace(/\s/g, '')) : null;
    }
    matchCommission(text) {
        const match = text.match(/(?:prowizja|wynagrodzenie agencji)[^.!\n]{0,40}/i);
        return match ? match[0].trim() : null;
    }
    matchStatus(text) {
        if (/sprzedane|sprzedane mieszkanie|oferta nieaktualna/.test(text))
            return 'sprzedane';
        if (/wynajęte|wynajete/.test(text))
            return 'wynajęte';
        if (/rezerwacja|zarezerwowane/.test(text))
            return 'rezerwacja';
        return null;
    }
    matchPresence(text, positive, negative) {
        if (negative.some(pattern => pattern.test(text)))
            return false;
        if (positive.some(pattern => pattern.test(text)))
            return true;
        return null;
    }
    matchBuildingType(text, flat) {
        if (/wielka płyta|wielkiej płyty|wielkopłytow/.test(text))
            return 'wielka plyta';
        if (/concrete[_ -]?plate|w[- ]?70|owt[- ]?75|wuf[- ]?t|wwp|system szczeciński|system szczecinski/i.test(text))
            return 'wielka plyta';
        if (/rama\s*h\b/i.test(text))
            return flat.buildingType;
        if (this.isLikelyLargePanel(flat, text))
            return 'wielka plyta';
        if (/cegła|ceglan|cegły/.test(text))
            return 'cegla';
        if (/kamienica|kamienicy/.test(text))
            return 'kamienica';
        if (/nowe budownictwo|nowy budynek|apartamentowiec/.test(text))
            return 'nowe budownictwo';
        return flat.buildingType;
    }
    isLikelyLargePanel(flat, text) {
        if (/rama\s*h\b/i.test(text))
            return false;
        if (flat.hasGarage === true)
            return false;
        let score = 0;
        const oldConstruction = flat.buildYear !== null && flat.buildYear >= 1960 && flat.buildYear <= 1993;
        const block = flat.buildingType !== null && /blok|block/i.test(flat.buildingType);
        const typicalFloorCount = flat.totalFloors !== null && [4, 5, 10, 11].includes(flat.totalFloors);
        if (oldConstruction)
            score += 25;
        if (block)
            score += 10;
        if (typicalFloorCount)
            score += 15;
        if (!/garaż|garaz|miejsce postojowe|miejsce parkingowe/i.test(text))
            score += 5;
        if (/dwustronne|rozkładowe|rozkladowe/i.test(text))
            score += 20;
        if (/ocieplon(?:y|a|e)|nowa elewacja/i.test(text))
            score += 20;
        if (/wymienione? piony|wymiana pionów|wymiana pionow/i.test(text))
            score += 15;
        if (/zsyp|ślepa kuchnia|slep[aą] kuchnia|ciemna kuchnia/i.test(text))
            score += 30;
        if (/\bpłyta\b|\bplyta\b/i.test(text))
            score += 40;
        return score >= 50;
    }
    matchBuildYear(text) {
        const matches = [...text.matchAll(/(?:rok budowy|wybudowan[eya]|oddany do użytku|oddane do użytku)[^\d]{0,20}(19\d{2}|20\d{2})/g)];
        const year = matches.at(0)?.[1];
        return year ? Number(year) : null;
    }
}
exports.default = ListingAnalyzer;
