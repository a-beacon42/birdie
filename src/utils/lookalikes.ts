import type { BirdSummary, LookalikeBirdSummary } from "../types/bird";

export interface LookalikeSuggestion {
    id: string;
    title: string;
    description: string;
    speciesNames: string[];
}

export interface LookalikeDeckBuildResult {
    birds: BirdSummary[];
    imageUrlsMap: Record<string, string[]>;
}

export const LOOKALIKE_SUGGESTIONS: LookalikeSuggestion[] = [
    {
        id: "coopers-vs-sharp-shinned",
        title: "Cooper's vs Sharp-shinned",
        description: "Two accipiters that are easy to mix up at a glance.",
        speciesNames: ["Cooper's Hawk", "Sharp-shinned Hawk"],
    },
    {
        id: "red-shouldered-vs-red-tailed",
        title: "Red-shouldered vs Red-tailed",
        description: "Practice shape, posture, and pattern differences side by side.",
        speciesNames: ["Red-shouldered Hawk", "Red-tailed Hawk"],
    },
    {
        id: "sparrows",
        title: "Sparrows",
        description: "A starter deck for streaking, face pattern, and habitat cues.",
        speciesNames: [
            "Song Sparrow",
            "Savannah Sparrow",
            "Chipping Sparrow",
            "White-throated Sparrow",
        ],
    },
    {
        id: "mergansers",
        title: "Mergansers",
        description: "Compare the three common merganser profiles in one deck.",
        speciesNames: [
            "Common Merganser",
            "Hooded Merganser",
            "Red-breasted Merganser",
        ],
    },
];

function shuffleArray<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function dedupeImageUrls(urls: string[]): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];

    for (const url of urls) {
        const trimmed = url.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        deduped.push(trimmed);
    }

    return deduped;
}

export function normalizeBirdName(name: string): string {
    return name
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function findExactBirdMatch(
    birds: BirdSummary[],
    expectedCommonName: string,
): BirdSummary | null {
    const normalizedExpected = normalizeBirdName(expectedCommonName);
    return (
        birds.find(
            (bird) => normalizeBirdName(bird.com_name) === normalizedExpected,
        ) ?? null
    );
}

export function buildLookalikeDeck(
    sourceBirds: LookalikeBirdSummary[],
    cardCount: number,
): LookalikeDeckBuildResult {
    const participants = sourceBirds.map((bird) => {
        const { image_urls, ...birdSummary } = bird;
        const uniqueImageUrls = dedupeImageUrls([...image_urls, bird.image_url]);
        const pool = uniqueImageUrls.length > 0 ? uniqueImageUrls : [bird.image_url];

        return {
            bird: birdSummary,
            imageUrls: pool,
            remaining: shuffleArray(pool),
            recycleIndex: 0,
        };
    });

    const imageUrlsMap = Object.fromEntries(
        participants.map((participant) => [
            participant.bird.species_code,
            participant.imageUrls,
        ]),
    );

    const expandedBirds: BirdSummary[] = [];

    while (expandedBirds.length < cardCount) {
        let addedThisRound = false;

        for (const participant of participants) {
            if (expandedBirds.length >= cardCount) break;
            const nextImageUrl = participant.remaining.shift();
            if (nextImageUrl == null) continue;

            expandedBirds.push({
                ...participant.bird,
                image_url: nextImageUrl,
            });
            addedThisRound = true;
        }

        if (!addedThisRound) break;
    }

    const recyclableParticipants = participants.filter(
        (participant) => participant.imageUrls.length > 0,
    );

    while (
        expandedBirds.length < cardCount &&
        recyclableParticipants.length > 0
    ) {
        for (const participant of recyclableParticipants) {
            if (expandedBirds.length >= cardCount) break;

            const nextImageUrl =
                participant.imageUrls[
                    participant.recycleIndex % participant.imageUrls.length
                ];
            participant.recycleIndex += 1;

            expandedBirds.push({
                ...participant.bird,
                image_url: nextImageUrl,
            });
        }
    }

    return {
        birds: shuffleArray(expandedBirds),
        imageUrlsMap,
    };
}
