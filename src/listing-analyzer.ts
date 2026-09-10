import type { Flat } from './types';

class ListingAnalyzer {
    analyze(flat: Flat): Flat {
        const text = `${flat.title} ${flat.description || ''}`.toLocaleLowerCase('pl-PL');
        const totalFloors = this.matchTotalFloors(text) ?? flat.totalFloors;
        const detectedElevator = this.matchPresence(text, [/winda/, /windą/], [/bez windy/, /brak windy/, /bez dźwigu/]) ?? flat.hasElevator;

        return {
            ...flat,
            address: this.matchAddress(text) || flat.address,
            floor: this.matchFloor(text) ?? flat.floor,
            totalFloors,
            ownershipType: this.matchOwnership(text) || flat.ownershipType,
            area: flat.area ?? this.matchArea(text),
            rent: this.matchMoney(text, /(?:czynsz|opłata administracyjna|oplaty administracyjne)[^\d]{0,20}([\d\s]+)\s*zł/),
            commission: this.matchCommission(text) || flat.commission,
            listingStatus: this.matchStatus(text) || flat.listingStatus,
            buildingType: this.matchBuildingType(text, flat),
            hasGarage: this.matchPresence(
                text,
                [/garaż podziemny/, /garażu podziemnym/, /garaz podziemny/, /garazu podziemnym/, /garaż w budynku/, /garaz w budynku/, /garaż murowany/, /garaz murowany/],
                [/bez garażu/, /brak garażu/, /bez miejsca postojowego/, /miejsce postojowe[^.\n]{0,30}(?:przed|poza|obok) budynkiem/, /miejsce parkingowe[^.\n]{0,30}(?:przed|poza|obok) budynkiem/, /ogólnodostępne miejsca parkingowe/, /publiczny parking/,
                    /garaż\s*\/\s*miejsce parkingowe/, /garaz\s*\/\s*miejsce parkingowe/,
                    /garaż\s*(?:lub|albo)\s*miejsce parkingowe/, /garaz\s*(?:lub|albo)\s*miejsce parkingowe/]
            ) ?? flat.hasGarage,
            hasParkingSpace: this.matchPresence(text, [/przypisane miejsce postojowe/, /prywatne miejsce postojowe/, /własne miejsce postojowe/, /miejsce postojowe na wyłączność/, /miejsce postojowe nr/, /miejsce parkingowe na wyłączność/, /\b\d+\s+miejsc(?:e|a)?\s+postojow(?:e|ych)\b[^.\n]{0,60}\b(?:w cenie|wliczon)/], [/brak miejsca postojowego/, /ogólnodostępne miejsca parkingowe/, /publiczny parking/]) ?? flat.hasParkingSpace,
            hasStorageUnit: this.matchPresence(text, [/komórka lokatorska/, /komorka lokatorska/], []) ?? flat.hasStorageUnit,
            hasBasement: this.matchPresence(text, [/piwnica/, /pomieszczenie piwniczne/], [/bez piwnicy/, /brak piwnicy/]) ?? flat.hasBasement,
            hasElevator: detectedElevator ?? (totalFloors !== null && totalFloors > 4 ? true : null),
            hasBalcony: this.matchPresence(text, [/balkon/, /loggia/, /taras/], [/bez balkonu/, /brak balkonu/, /bez loggii/, /brak loggii/, /bez tarasu/, /brak tarasu/]) ?? flat.hasBalcony,
            hasGarden: this.matchPresence(text, [/ogródek/, /ogrodek/, /prywatny ogród/, /prywatny ogrod/], [/bez ogródka/, /bez ogrodka/, /brak ogródka/, /brak ogrodka/]) ?? flat.hasGarden,
            buildYear: this.matchBuildYear(text) ?? flat.buildYear
        };
    }

    private matchAddress(text: string): string | null {
        const match = text.match(/(?:adres|ul\.?)[\s:]+([^,.;\n]{3,60})/i);
        return match ? match[1].trim() : null;
    }

    private matchFloor(text: string): number | null {
        const match = text.match(/(?:na\s+)?(?:parterze|parter)\b/i);
        if (match) return 0;
        const numbered = text.match(/(?:na\s+)?(\d{1,2})\.?\s*(?:piętrze|pietrze)\b/i);
        return numbered ? Number(numbered[1]) : null;
    }

    private matchTotalFloors(text: string): number | null {
        const match = text.match(/(\d{1,2})\s*(?:pięter|pieter|kondygnacji)\b/i);
        return match ? Number(match[1]) : null;
    }

    private matchOwnership(text: string): string | null {
        if (/pełna własność|pelna wlasnosc/.test(text)) return 'pełna własność';
        if (/spółdzielczo-własnościowe|spoldzielczo-wlasnosciowe/.test(text)) return 'spółdzielcze własnościowe';
        if (/spółdzielcze lokatorskie|spoldzielcze lokatorskie/.test(text)) return 'spółdzielcze lokatorskie';
        if (/udział|udzial/.test(text)) return 'udział';
        return null;
    }

    private matchMoney(text: string, pattern: RegExp): number | null {
        const match = text.match(pattern);
        return match ? Number(match[1].replace(/\s/g, '')) : null;
    }

    private matchArea(text: string): number | null {
        const match = text.match(/(?:powierzchnia|metraż|metraz)?[^\d]{0,12}(\d{2,3}(?:[,.]\d+)?)\s*(?:m²|m2|m\.?\s*kw)/i);
        return match ? Number(match[1].replace(',', '.')) : null;
    }

    private matchCommission(text: string): string | null {
        const match = text.match(/(?:prowizja|wynagrodzenie agencji)[^.!\n]{0,40}/i);
        return match ? match[0].trim() : null;
    }

    private matchStatus(text: string): string | null {
        if (/sprzedane|sprzedane mieszkanie|oferta nieaktualna/.test(text)) return 'sprzedane';
        if (/wynajęte|wynajete/.test(text)) return 'wynajęte';
        if (/rezerwacja|zarezerwowane/.test(text)) return 'rezerwacja';
        return null;
    }

    private matchPresence(text: string, positive: RegExp[], negative: RegExp[]): boolean | null {
        if (negative.some(pattern => pattern.test(text))) return false;
        if (positive.some(pattern => pattern.test(text))) return true;
        return null;
    }

    private matchBuildingType(text: string, flat: Flat): string | null {
        const normalizedText = normalizeSearchText(text);
        if (/\bwielka plyta\b|\bwielkiej plyty\b|\bwielkoplytow/.test(normalizedText)) return 'wielka plyta';
        if (/concrete[_ -]?plate|w[- ]?70|owt[- ]?75|wuf[- ]?t|wwp|system szczecinski/.test(normalizedText)) return 'wielka plyta';
        if (/rama\s*-?\s*h\b|z ramy\s*-?\s*h\b|zelbetowy szkielet/.test(normalizedText)) return 'rama h';
        if (this.isLikelyRamaH(flat, text)) return 'rama h';
        if (this.isLikelyLargePanel(flat, text)) return 'wielka plyta';
        if (/cegła|ceglan|cegły/.test(text)) return 'cegla';
        if (/kamienica|kamienicy/.test(text)) return 'kamienica';
        if (/nowe budownictwo|nowy budynek|apartamentowiec/.test(text)) return 'nowe budownictwo';
        return flat.buildingType;
    }

    private isLikelyLargePanel(flat: Flat, text: string): boolean {
        const normalizedText = normalizeSearchText(text);
        if (/rama\s*-?\s*h\b|z ramy\s*-?\s*h\b/.test(normalizedText)) return false;
        let score = 0;
        const oldConstruction = flat.buildYear !== null && flat.buildYear >= 1955 && flat.buildYear <= 1993;
        const block = flat.buildingType !== null && /blok|block/i.test(flat.buildingType);
        const typicalFloorCount = flat.totalFloors !== null
            && ([4, 5, 10, 11].includes(flat.totalFloors) || flat.totalFloors >= 10);

        if (oldConstruction) score += 30;
        if (flat.hasGarage === true) score -= 35;
        if (block) score += 10;
        if (typicalFloorCount) score += 15;
        if (flat.hasElevator === true) score += 10;
        if (flat.totalFloors !== null && flat.totalFloors > 4 && flat.hasElevator === false) score -= 25;
        if (flat.totalFloors !== null && flat.totalFloors >= 10 && /żelbeton|zelbeton|żelbetowy|zelbetowy/i.test(text)) score += 25;
        if (/wtórny|wtorny/i.test(flat.marketType || '') || /rynek wtórny|rynek wtorny/i.test(text)) score += 10;
        if (flat.rent !== null && flat.rent > 0 && flat.rent < 1000) score += 5;
        if (!/garaż|garaz|miejsce postojowe|miejsce parkingowe/i.test(text)) score += 5;
        if (/\bpiwnic(?:a|y|ę)\b/i.test(text)) score += 5;
        if (/dwustronne|rozkladowe/.test(normalizedText)) score += 20;
        if (/ocieplon(?:y|a|e)|nowa elewacja/i.test(text)) score += 20;
        if (/wymienione? piony|wymiana pionów|wymiana pionow/i.test(text)) score += 15;
        if (/zsyp|ślepa kuchnia|slep[aą] kuchnia|ciemna kuchnia/i.test(text)) score += 30;
        if (/\bpłyta\b|\bplyta\b/i.test(text)) score += 40;

        return score >= 50;
    }

    private isLikelyRamaH(flat: Flat, text: string): boolean {
        const normalizedText = normalizeSearchText(text);
        if (/wielka plyta|wielkiej plyty|wielkoplytow|concrete[_ -]?plate|w[- ]?70|owt[- ]?75|wuf[- ]?t|wwp/.test(normalizedText)) {
            return false;
        }
        if (/rama\s*-?\s*h\b|z ramy\s*-?\s*h\b|zelbetowy szkielet/.test(normalizedText)) return true;

        const oldConstruction = flat.buildYear !== null && flat.buildYear >= 1970 && flat.buildYear <= 1995;
        const block = flat.buildingType !== null && /blok|block/i.test(flat.buildingType);
        const structuralSignal = /konstrukcja szkieletowa|szkielet żelbetowy|szkielet zelbetowy|ściany działowe|sciany dzialowe|możliwość wyburzenia ścian|mozliwosc wyburzenia scian|wszystkie ściany działowe|wszystkie sciany dzialowe/i.test(text);
        const infillMaterial = /\bcegł[ayę]|\bpustak\b/i.test(text);
        const hasGarage = flat.hasGarage === true || /garaż podziemny|garaz podziemny|garaż w budynku|garaz w budynku/i.test(text);

        let score = 0;
        if (oldConstruction) score += 25;
        if (block) score += 10;
        if (structuralSignal) score += 45;
        if (infillMaterial) score += 20;
        if (/możliwość wyburzenia ścian|mozliwosc wyburzenia scian|wszystkie ściany działowe|wszystkie sciany dzialowe/i.test(text)) score += 20;
        if (hasGarage) score += 5;
        if (/ściany nośne między pokojami|sciany nosne miedzy pokojami/i.test(text)) score -= 50;

        return score >= 60;
    }

    private matchBuildYear(text: string): number | null {
        const matches = [...text.matchAll(/(?:rok budowy|wybudowan[eya]|oddany do użytku|oddane do użytku)[^\d]{0,20}(19\d{2}|20\d{2})/g)];
        const year = matches.at(0)?.[1];
        return year ? Number(year) : null;
    }
}

function normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl-PL');
}

export default ListingAnalyzer;