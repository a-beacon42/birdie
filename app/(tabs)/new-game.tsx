/**
 * New Game tab — game setup / filter selection.
 *
 * Users select filters (family, region, difficulty, count) and start a game.
 * Data flows from the backend API via hooks instead of bundled JSON.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    ScrollView,
    Pressable,
    ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { showAlert } from "../../src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radii, typography, shadows } from "../../src/theme";
import { useFamilies, useSubnational1, useSubnational2 } from "../../src/hooks/useApi";
import { useGameStore } from "../../src/stores/gameStore";
import { usePreferencesStore } from "../../src/stores/preferencesStore";
import { createDeck, createLookalikeDeck, fetchBirds } from "../../src/api/birdieApi";
import type { Difficulty, LookalikeBirdSummary } from "../../src/api/birdieApi";
import type { BirdFamily, BirdSummary, Region } from "../../src/types/bird";
import SearchableDropdown from "../../src/components/SearchableDropdown";
import allCountries from "../../src/data/AllCountries.json";

type Country = { name: string; code: string };

const CARD_COUNTS = [10, 25, 50] as const;
const DIFFICULTIES: { key: Difficulty | null; label: string }[] = [
    { key: null, label: "Any" },
    { key: "easy", label: "Easy" },
    { key: "medium", label: "Medium" },
    { key: "hard", label: "Hard" },
];
const GAME_MODES = [
    { key: "standard" as const, label: "Standard" },
    { key: "lookalikes" as const, label: "Lookalikes" },
];
const MAX_LOOKALIKE_SPECIES = 10;

export default function NewGameScreen() {
    const router = useRouter();
    const startGame = useGameStore((s) => s.startGame);
    const startLookalikeGame = useGameStore((s) => s.startLookalikeGame);

    // Persisted filter preferences
    const cardCount = usePreferencesStore((s) => s.cardCount);
    const setCardCount = usePreferencesStore((s) => s.setCardCount);
    const selectedFamily = usePreferencesStore((s) => s.selectedFamily);
    const setSelectedFamily = usePreferencesStore((s) => s.setSelectedFamily);
    const selectedCountry = usePreferencesStore((s) => s.selectedCountry);
    const setSelectedCountry = usePreferencesStore((s) => s.setSelectedCountry);
    const selectedState = usePreferencesStore((s) => s.selectedState);
    const setSelectedState = usePreferencesStore((s) => s.setSelectedState);
    const selectedCounty = usePreferencesStore((s) => s.selectedCounty);
    const setSelectedCounty = usePreferencesStore((s) => s.setSelectedCounty);
    const selectedDifficulty = usePreferencesStore((s) => s.selectedDifficulty);
    const setSelectedDifficulty = usePreferencesStore((s) => s.setSelectedDifficulty);
    const gameMode = usePreferencesStore((s) => s.gameMode);
    const setGameMode = usePreferencesStore((s) => s.setGameMode);
    const selectedLookalikeSpecies = usePreferencesStore((s) => s.selectedLookalikeSpecies);
    const setSelectedLookalikeSpecies = usePreferencesStore((s) => s.setSelectedLookalikeSpecies);
    const clearAll = usePreferencesStore((s) => s.clearAll);
    const [creating, setCreating] = useState(false);

    // Track selected species names for display
    const [selectedSpeciesNames, setSelectedSpeciesNames] = useState<Record<string, string>>({});

    // API data
    const { data: families, loading: familiesLoading, error: familiesError } = useFamilies();
    const { data: subnational1 } = useSubnational1(selectedCountry || null);
    const { data: subnational2 } = useSubnational2(selectedState || null);

    // Debounced server-side bird search for lookalike species picker
    const [birdSearchText, setBirdSearchText] = useState("");
    const [birdSearchResults, setBirdSearchResults] = useState<BirdSummary[]>([]);
    const [birdSearchLoading, setBirdSearchLoading] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

        if (!birdSearchText || birdSearchText.length < 2) {
            setBirdSearchResults([]);
            setBirdSearchLoading(false);
            return;
        }

        setBirdSearchLoading(true);
        searchTimerRef.current = setTimeout(async () => {
            try {
                const results = await fetchBirds({ search: birdSearchText, limit: 20 });
                setBirdSearchResults(
                    results.filter((b) => !selectedLookalikeSpecies.includes(b.species_code)),
                );
            } catch {
                setBirdSearchResults([]);
            } finally {
                setBirdSearchLoading(false);
            }
        }, 300);

        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        };
    }, [birdSearchText, selectedLookalikeSpecies]);

    const handleCountryChange = useCallback(
        (item: Country) => {
            setSelectedCountry(item.code);
        },
        [setSelectedCountry],
    );

    const handleStateChange = useCallback(
        (item: Region) => {
            setSelectedState(item.code);
        },
        [setSelectedState],
    );

    // --- Lookalikes: species selection ---

    const handleAddLookalikeSpecies = useCallback(
        (bird: BirdSummary) => {
            if (selectedLookalikeSpecies.includes(bird.species_code)) return;
            if (selectedLookalikeSpecies.length >= MAX_LOOKALIKE_SPECIES) return;
            setSelectedLookalikeSpecies([...selectedLookalikeSpecies, bird.species_code]);
            setSelectedSpeciesNames((prev) => ({
                ...prev,
                [bird.species_code]: bird.com_name,
            }));
            setBirdSearchText("");
            setBirdSearchResults([]);
        },
        [selectedLookalikeSpecies, setSelectedLookalikeSpecies],
    );

    const handleRemoveLookalikeSpecies = useCallback(
        (code: string) => {
            setSelectedLookalikeSpecies(
                selectedLookalikeSpecies.filter((c) => c !== code),
            );
        },
        [selectedLookalikeSpecies, setSelectedLookalikeSpecies],
    );

    // --- Create game handlers ---

    const handleCreateGame = useCallback(async () => {
        setCreating(true);
        try {
            if (gameMode === "lookalikes") {
                if (selectedLookalikeSpecies.length < 2) {
                    showAlert("Select species", "Pick at least 2 species to compare.");
                    setCreating(false);
                    return;
                }

                const lookalikeData = await createLookalikeDeck(selectedLookalikeSpecies);

                if (lookalikeData.length === 0) {
                    showAlert("No birds found", "Try different species.");
                    setCreating(false);
                    return;
                }

                // Build image URLs map
                const imageUrlsMap: Record<string, string[]> = {};
                for (const bird of lookalikeData) {
                    imageUrlsMap[bird.species_code] = bird.image_urls;
                }

                // Shuffle species order
                const shuffled = [...lookalikeData];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }

                const speciesLabel = lookalikeData
                    .map((b) => b.com_name)
                    .join(" vs ");

                startLookalikeGame(shuffled, imageUrlsMap, {
                    familyLabel: speciesLabel,
                });
                router.push("/game");
                return;
            }

            // Standard mode
            const regionCode = selectedCounty || selectedState || selectedCountry || null;

            // Build deck via the backend — pass region_code so the server
            // fetches the species list itself (avoids huge payloads).
            const deck = await createDeck({
                family: selectedFamily || undefined,
                difficulty: selectedDifficulty ?? undefined,
                region_code: regionCode ?? undefined,
                limit: cardCount,
            });

            if (deck.length === 0) {
                showAlert("No birds found", "Try different filters.");
                setCreating(false);
                return;
            }

            // Build human-readable filter labels for the game screen
            const familyLabel = selectedFamily
                ? families?.find((f) => f.family_code === selectedFamily)?.family_com_name
                : undefined;

            const regionParts: string[] = [];
            const countryObj = (allCountries as Country[]).find(
                (c) => c.code === selectedCountry,
            );
            if (countryObj) regionParts.push(countryObj.name);
            const stateObj = subnational1?.find((s) => s.code === selectedState);
            if (stateObj) regionParts.push(stateObj.name);
            const countyObj = subnational2?.find((c) => c.code === selectedCounty);
            if (countyObj) regionParts.push(countyObj.name);
            const regionLabel =
                regionParts.length > 0 ? regionParts.join(" — ") : undefined;

            const difficultyLabel = selectedDifficulty
                ? DIFFICULTIES.find((d) => d.key === selectedDifficulty)?.label
                : undefined;

            startGame(deck, "flashcard", { familyLabel, regionLabel, difficultyLabel });
            router.push("/game");
        } catch (err: unknown) {
            showAlert("Error", err instanceof Error ? err.message : "Failed to create game");
        } finally {
            setCreating(false);
        }
    }, [
        gameMode,
        selectedLookalikeSpecies,
        cardCount,
        selectedFamily,
        selectedDifficulty,
        selectedCountry,
        selectedState,
        selectedCounty,
        families,
        subnational1,
        subnational2,
        startGame,
        startLookalikeGame,
        router,
    ]);

    const handleClearFilters = useCallback(() => {
        clearAll();
    }, [clearAll]);

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>New Game</Text>

                    {/* Game Mode Toggle */}
                    <SectionHeader label="Game mode" />
                    <View style={styles.chipRow}>
                        {GAME_MODES.map((m) => (
                            <Pressable
                                key={m.key}
                                style={[styles.chip, gameMode === m.key && styles.chipActive]}
                                onPress={() => setGameMode(m.key)}
                            >
                                <Text
                                    style={[
                                        styles.chipText,
                                        gameMode === m.key && styles.chipTextActive,
                                    ]}
                                >
                                    {m.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    {/* Card count */}
                    <SectionHeader label="Number of cards" />
                    <View style={styles.chipRow}>
                        {CARD_COUNTS.map((n) => (
                            <Pressable
                                key={n}
                                style={[styles.chip, cardCount === n && styles.chipActive]}
                                onPress={() => setCardCount(n)}
                            >
                                <Text
                                    style={[
                                        styles.chipText,
                                        cardCount === n && styles.chipTextActive,
                                    ]}
                                >
                                    {n}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    {gameMode === "standard" && (
                        <>
                            {/* Difficulty */}
                            <SectionHeader label="Difficulty (optional)" />
                            <View style={styles.chipRow}>
                                {DIFFICULTIES.map((d) => (
                                    <Pressable
                                        key={d.label}
                                        style={[
                                            styles.chip,
                                            selectedDifficulty === d.key && styles.chipActive,
                                        ]}
                                        onPress={() => setSelectedDifficulty(d.key)}
                                    >
                                        <Text
                                            style={[
                                                styles.chipText,
                                                selectedDifficulty === d.key && styles.chipTextActive,
                                            ]}
                                        >
                                            {d.label}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            {/* Family filter */}
                            <SectionHeader label="Family (optional)" />
                            {familiesLoading ? (
                                <ActivityIndicator
                                    color={colors.primary}
                                    style={{ marginVertical: spacing.sm }}
                                />
                            ) : familiesError ? (
                                <Text style={styles.errorText}>Could not load families</Text>
                            ) : (
                                <SearchableDropdown<BirdFamily>
                                    label="Family"
                                    data={families ?? []}
                                    labelField="family_com_name"
                                    valueField="family_code"
                                    placeholder="All families"
                                    value={selectedFamily}
                                    onChange={(item) => setSelectedFamily(item.family_code)}
                                    onClear={() => setSelectedFamily("")}
                                />
                            )}

                            {/* Location filter */}
                            <SectionHeader label="Location (optional)" />
                            <SearchableDropdown<Country>
                                label="Country"
                                data={allCountries as Country[]}
                                labelField="name"
                                valueField="code"
                                placeholder="All countries"
                                value={selectedCountry}
                                onChange={handleCountryChange}
                                onClear={() => {
                                    setSelectedCountry("");
                                }}
                            />

                            {selectedCountry && (subnational1?.length ?? 0) > 0 && (
                                <SearchableDropdown<Region>
                                    label="State / Province"
                                    data={subnational1 ?? []}
                                    labelField="name"
                                    valueField="code"
                                    placeholder="Entire country"
                                    value={selectedState}
                                    onChange={handleStateChange}
                                    onClear={() => {
                                        setSelectedState("");
                                    }}
                                />
                            )}

                            {selectedState && (subnational2?.length ?? 0) > 0 && (
                                <SearchableDropdown<Region>
                                    label="County / Region"
                                    data={subnational2 ?? []}
                                    labelField="name"
                                    valueField="code"
                                    placeholder="Entire state"
                                    value={selectedCounty}
                                    onChange={(item) => setSelectedCounty(item.code)}
                                    onClear={() => setSelectedCounty("")}
                                />
                            )}
                        </>
                    )}

                    {gameMode === "lookalikes" && (
                        <>
                            {/* Species search */}
                            <SectionHeader label="Select species to compare (2–10)" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search by common name..."
                                placeholderTextColor={colors.textMuted}
                                value={birdSearchText}
                                onChangeText={setBirdSearchText}
                                autoCorrect={false}
                                accessibilityLabel="Search birds"
                            />
                            {birdSearchLoading && (
                                <ActivityIndicator
                                    color={colors.primary}
                                    size="small"
                                    style={{ marginVertical: spacing.xs }}
                                />
                            )}
                            {birdSearchResults.length > 0 && (
                                <View style={styles.searchResultsList}>
                                    {birdSearchResults.map((bird) => (
                                        <Pressable
                                            key={bird.species_code}
                                            style={({ pressed }) => [
                                                styles.searchResultItem,
                                                pressed && styles.searchResultItemPressed,
                                            ]}
                                            onPress={() => handleAddLookalikeSpecies(bird)}
                                        >
                                            <Text style={styles.searchResultText}>
                                                {bird.com_name}
                                            </Text>
                                            <Text style={styles.searchResultSci}>
                                                {bird.sci_name}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )}

                            {/* Selected species tags */}
                            {selectedLookalikeSpecies.length > 0 && (
                                <View style={styles.tagContainer}>
                                    {selectedLookalikeSpecies.map((code) => (
                                        <View key={code} style={styles.tag}>
                                            <Text style={styles.tagText}>
                                                {selectedSpeciesNames[code] || code}
                                            </Text>
                                            <Pressable
                                                onPress={() => handleRemoveLookalikeSpecies(code)}
                                                hitSlop={8}
                                            >
                                                <Text style={styles.tagRemove}>x</Text>
                                            </Pressable>
                                        </View>
                                    ))}
                                </View>
                            )}
                            <Text style={styles.speciesCount}>
                                {selectedLookalikeSpecies.length} of {MAX_LOOKALIKE_SPECIES} species selected
                            </Text>
                        </>
                    )}

                    {/* Actions */}
                    <View style={styles.actionRow}>
                        <Pressable
                            style={[
                                styles.button,
                                styles.buttonPrimary,
                                creating && styles.buttonDisabled,
                            ]}
                            onPress={handleCreateGame}
                            disabled={creating}
                        >
                            {creating ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.buttonPrimaryText}>Start Game</Text>
                            )}
                        </Pressable>
                        <Pressable
                            style={[styles.button, styles.buttonSecondary]}
                            onPress={handleClearFilters}
                        >
                            <Text style={styles.buttonSecondaryText}>Reset</Text>
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function SectionHeader({ label }: { label: string }) {
    return (
        <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionLabel}>{label}</Text>
            <View style={styles.sectionLine} />
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.xxl,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        ...shadows.md,
    },
    cardTitle: {
        ...typography.h2,
        color: colors.primary,
        textAlign: "center",
        marginBottom: spacing.md,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    sectionLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.border,
    },
    sectionLabel: {
        ...typography.label,
        color: colors.textSecondary,
        paddingHorizontal: spacing.sm,
    },
    chipRow: {
        flexDirection: "row",
        gap: spacing.sm,
    },
    chip: {
        flex: 1,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: "center",
    },
    chipActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },
    chipText: {
        ...typography.label,
        color: colors.textSecondary,
    },
    chipTextActive: {
        color: "#fff",
    },
    actionRow: {
        flexDirection: "row",
        gap: spacing.sm,
        marginTop: spacing.xl,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: radii.md,
        alignItems: "center",
        justifyContent: "center",
    },
    buttonPrimary: {
        backgroundColor: colors.primary,
    },
    buttonPrimaryText: {
        ...typography.label,
        color: "#fff",
        fontSize: 16,
    },
    buttonSecondary: {
        borderWidth: 1.5,
        borderColor: colors.border,
    },
    buttonSecondaryText: {
        ...typography.label,
        color: colors.textSecondary,
        fontSize: 16,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    errorText: {
        ...typography.bodySmall,
        color: colors.error,
        textAlign: "center",
        marginVertical: spacing.sm,
    },
    tagContainer: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.xs,
        marginTop: spacing.sm,
    },
    tag: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.primaryLight + "20",
        borderRadius: radii.full,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        gap: spacing.xs,
    },
    tagText: {
        ...typography.bodySmall,
        color: colors.primary,
    },
    tagRemove: {
        ...typography.label,
        color: colors.textSecondary,
        marginLeft: spacing.xs,
    },
    speciesCount: {
        ...typography.caption,
        color: colors.textSecondary,
        textAlign: "center",
        marginTop: spacing.sm,
    },
    searchInput: {
        ...typography.body,
        color: colors.text,
        backgroundColor: colors.background,
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radii.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    searchResultsList: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        marginTop: spacing.xs,
        maxHeight: 200,
        overflow: "hidden",
    },
    searchResultItem: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    searchResultItemPressed: {
        backgroundColor: colors.primary + "15",
    },
    searchResultText: {
        ...typography.body,
        color: colors.text,
    },
    searchResultSci: {
        ...typography.caption,
        color: colors.textMuted,
    },
});
