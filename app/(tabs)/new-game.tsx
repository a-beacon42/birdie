/**
 * New Game tab — game setup / filter selection.
 *
 * Users select filters (family, region, difficulty, count) and start a game.
 * Data flows from the backend API via hooks instead of bundled JSON.
 */

import React, { useState, useCallback } from "react";
import {
    View,
    Text,
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
import { createDeck, getSpeciesList } from "../../src/api/birdieApi";
import type { Difficulty } from "../../src/api/birdieApi";
import type { BirdFamily, Region } from "../../src/types/bird";
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

export default function NewGameScreen() {
    const router = useRouter();
    const startGame = useGameStore((s) => s.startGame);

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
    const clearAll = usePreferencesStore((s) => s.clearAll);
    const [creating, setCreating] = useState(false);

    // API data
    const { data: families, loading: familiesLoading, error: familiesError } = useFamilies();
    const { data: subnational1 } = useSubnational1(selectedCountry || null);
    const { data: subnational2 } = useSubnational2(selectedState || null);

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

    const handleCreateGame = useCallback(async () => {
        setCreating(true);
        try {
            const regionCode = selectedCounty || selectedState || selectedCountry || null;

            // Get species codes from region filter (if any)
            let speciesCodes: string[] | undefined;
            if (regionCode) {
                speciesCodes = await getSpeciesList(regionCode);
                if (speciesCodes.length === 0) {
                    showAlert("No birds found", "No species recorded for this region.");
                    setCreating(false);
                    return;
                }
            }

            // Build deck via the backend (handles difficulty filtering server-side)
            const deck = await createDeck({
                family: selectedFamily || undefined,
                species_codes: speciesCodes,
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
                    />

                    {selectedCountry && (subnational1?.length ?? 0) > 0 && (
                        <SearchableDropdown<Region>
                            label="State / Province"
                            data={subnational1 ?? []}
                            labelField="name"
                            valueField="code"
                            placeholder="Select state/province"
                            value={selectedState}
                            onChange={handleStateChange}
                        />
                    )}

                    {selectedState && (subnational2?.length ?? 0) > 0 && (
                        <SearchableDropdown<Region>
                            label="County / Region"
                            data={subnational2 ?? []}
                            labelField="name"
                            valueField="code"
                            placeholder="Select county/region"
                            value={selectedCounty}
                            onChange={(item) => setSelectedCounty(item.code)}
                        />
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
});
