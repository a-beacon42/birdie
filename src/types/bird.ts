/**
 * Bird types — mirrors the backend Pydantic models.
 * These are the canonical types consumed throughout the app.
 */

export interface BirdImage {
    url: string;
    source: string;
    license: string;
    attribution: string;
    quality: string;
    is_primary: boolean;
}

/** Full bird document from Cosmos DB */
export interface Bird {
    id: string;
    species_code: string;
    sci_name: string;
    com_name: string;
    family_code: string;
    family_com_name: string;
    order: string;
    sort_order: number;
    inat_taxon_id: number | null;
    images: BirdImage[];
    audio_url: string;
    audio_attribution: string;
    wikipedia_url: string;
    lookalikes: string[];
    /** Fraction of eBird checklists worldwide reporting this species (0–1). */
    global_frequency: number;
    data_version: string;
}

/** Lightweight summary for list views */
export interface BirdSummary {
    id: string;
    species_code: string;
    sci_name: string;
    com_name: string;
    family_code: string;
    family_com_name: string;
    image_url: string;
    wikipedia_url?: string;
    global_frequency: number;
    lookalike_count: number;
}

/** Summary with all image URLs for lookalike mode */
export interface LookalikeBirdSummary extends BirdSummary {
    image_urls: string[];
}

export interface BirdFamily {
    family_code: string;
    family_com_name: string;
}

/** An eBird geographic region (country, state, or county). */
export interface Region {
    code: string;
    name: string;
}

/** Helper: get the primary image URL from a Bird */
export function getPrimaryImageUrl(bird: Bird | BirdSummary): string {
    if ("image_url" in bird) return bird.image_url;
    const primary = bird.images.find((img) => img.is_primary);
    return primary?.url ?? bird.images[0]?.url ?? "";
}
