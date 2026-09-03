import type { Flat } from './types';

class ListingAnalyzer {
    analyze(flat: Flat): Flat {
        const text = `${flat.title} ${flat.description || ''}`.toLocaleLowerCase('pl-PL');

        return {
            ...flat,
            buildingType: this.matchBuildingType(text),
            hasGarage: this.matchPresence(text, [/garaż/, /garaz/, /miejsce postojowe/, /parking/], [/bez garażu/, /brak garażu/, /bez miejsca postojowego/]),
            hasElevator: this.matchPresence(text, [/winda/, /windą/], [/bez windy/, /brak windy/, /bez dźwigu/]),
            hasBalcony: this.matchPresence(text, [/balkon/, /loggia/, /taras/], [/bez balkonu/, /brak balkonu/]),
            buildYear: this.matchBuildYear(text)
        };
    }

    private matchPresence(text: string, positive: RegExp[], negative: RegExp[]): boolean | null {
        if (negative.some(pattern => pattern.test(text))) return false;
        if (positive.some(pattern => pattern.test(text))) return true;
        return null;
    }

    private matchBuildingType(text: string): string | null {
        if (/wielka płyta|wielkiej płyty|wielkopłytow/.test(text)) return 'wielka plyta';
        if (/cegła|ceglan|cegły/.test(text)) return 'cegla';
        if (/kamienica|kamienicy/.test(text)) return 'kamienica';
        if (/nowe budownictwo|nowy budynek|apartamentowiec/.test(text)) return 'nowe budownictwo';
        return null;
    }

    private matchBuildYear(text: string): number | null {
        const matches = [...text.matchAll(/(?:rok budowy|wybudowan[eya]|oddany do użytku|oddane do użytku)[^\d]{0,20}(19\d{2}|20\d{2})/g)];
        const year = matches.at(0)?.[1];
        return year ? Number(year) : null;
    }
}

export default ListingAnalyzer;