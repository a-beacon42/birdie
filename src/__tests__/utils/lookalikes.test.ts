import type { LookalikeBirdSummary } from "../../types/bird";
import {
    buildLookalikeDeck,
    dedupeImageUrls,
    findExactBirdMatch,
} from "../../utils/lookalikes";

function makeLookalikeBird(
    speciesCode: string,
    commonName: string,
    imageUrls: string[],
): LookalikeBirdSummary {
    return {
        id: speciesCode,
        species_code: speciesCode,
        sci_name: `${commonName} scientificus`,
        com_name: commonName,
        family_code: "testfam",
        family_com_name: "Test Family",
        image_url: imageUrls[0] ?? "",
        image_urls: imageUrls,
        wikipedia_url: "",
        global_frequency: 0.5,
        lookalike_count: 0,
    };
}

describe("lookalike utilities", () => {
    it("dedupes image URLs while preserving order", () => {
        expect(
            dedupeImageUrls([
                "https://example.com/a.jpg",
                "https://example.com/a.jpg",
                "   ",
                "https://example.com/b.jpg",
            ]),
        ).toEqual([
            "https://example.com/a.jpg",
            "https://example.com/b.jpg",
        ]);
    });

    it("fills the requested deck size and uses unique photos first", () => {
        const birds = [
            makeLookalikeBird("coohaw", "Cooper's Hawk", [
                "https://example.com/coo-1.jpg",
                "https://example.com/coo-2.jpg",
            ]),
            makeLookalikeBird("shshaw", "Sharp-shinned Hawk", [
                "https://example.com/sha-1.jpg",
                "https://example.com/sha-2.jpg",
            ]),
        ];

        const result = buildLookalikeDeck(birds, 5);

        expect(result.birds).toHaveLength(5);
        expect(new Set(result.birds.map((bird) => bird.image_url)).size).toBe(4);
        expect(result.imageUrlsMap.coohaw).toEqual([
            "https://example.com/coo-1.jpg",
            "https://example.com/coo-2.jpg",
        ]);
        expect(result.imageUrlsMap.shshaw).toEqual([
            "https://example.com/sha-1.jpg",
            "https://example.com/sha-2.jpg",
        ]);
    });

    it("matches exact bird names despite punctuation differences", () => {
        const birds = [
            makeLookalikeBird("coohaw", "Cooper's Hawk", [
                "https://example.com/coo-1.jpg",
            ]),
            makeLookalikeBird("rethaw", "Red-tailed Hawk", [
                "https://example.com/red-1.jpg",
            ]),
        ];

        expect(findExactBirdMatch(birds, "Coopers Hawk")?.species_code).toBe("coohaw");
        expect(findExactBirdMatch(birds, "Sharp-shinned Hawk")).toBeNull();
    });
});
