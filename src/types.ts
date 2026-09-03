export interface Flat {
    source: string;
    url: string;
    title: string;
    description: string | null;
    price: number | null;
    area: number | null;
    pricePerM2: number | null;
    district: string | null;
    createdAt: string | null;
    buildingType: string | null;
    hasGarage: boolean | null;
    hasElevator: boolean | null;
    hasBalcony: boolean | null;
    buildYear: number | null;
}

export interface ListingSource {
    readonly name: string;
    scrape(targetUrl: string, maxPages?: number, knownUrls?: ReadonlySet<string>, maxAgeDays?: number): Promise<Flat[]>;
}