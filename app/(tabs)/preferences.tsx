/**
 * Preferences tab — user settings for game defaults and appearance.
 *
 * Surfaces the existing preferencesStore values (default location,
 * difficulty, card count) in a dedicated settings screen.
 * Dark mode toggle is a placeholder for a future feature.
 */

import React, { useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radii, typography, shadows } from "../../src/theme";
import { usePreferencesStore } from "../../src/stores/preferencesStore";
import { useSubnational1, useSubnational2 } from "../../src/hooks/useApi";
import type { Difficulty } from "../../src/api/birdieApi";
import type { Region } from "../../src/types/bird";
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

export default function PreferencesScreen() {
    // Persisted preferences
    const cardCount = usePreferencesStore((s) => s.cardCount);
    const setCardCount = usePreferencesStore((s) => s.setCardCount);
    const selectedCountry = usePreferencesStore((s) => s.selectedCountry);
    const setSelectedCountry = usePreferencesStore((s) => s.setSelectedCountry);
    const selectedState = usePreferencesStore((s) => s.selectedState);
    const setSelectedState = usePreferencesStore((s) => s.setSelectedState);
    const selectedCounty = usePreferencesStore((s) => s.selectedCounty);
    const setSelectedCounty = usePreferencesStore((s) => s.setSelectedCounty);
    const selectedDifficulty = usePreferencesStore((s) => s.selectedDifficulty);
    const setSelectedDifficulty = usePreferencesStore((s) => s.setSelectedDifficulty);
    const colorScheme = usePreferencesStore((s) => s.colorScheme);

    // Sub-national region data (cascading from country → state)
    const { data: subnational1 } = useSubnational1(selectedCountry || null);
    const { data: subnational2 } = useSubnational2(selectedState || null);

    const handleCountryChange = useCallback(
        (item: Country) => setSelectedCountry(item.code),
        [setSelectedCountry],
    );

    const handleStateChange = useCallback(
        (item: Region) => setSelectedState(item.code),
        [setSelectedState],
    );

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.screenTitle}>Preferences</Text>

                {/* Appearance */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Appearance</Text>

                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>Dark Mode</Text>
                            <Text style={styles.settingHint}>Coming soon</Text>
                        </View>
                        <Switch
                            value={colorScheme === "dark"}
                            disabled
                            trackColor={{ false: colors.border, true: colors.primaryLight }}
                            thumbColor={colors.surface}
                            accessibilityLabel="Dark mode toggle (coming soon)"
                        />
                    </View>
                </View>

                {/* Default card count */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Default Card Count</Text>
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
                </View>

                {/* Default difficulty */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Default Difficulty</Text>
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
                </View>

                {/* Default location */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Default Location</Text>
                    <Text style={styles.cardHint}>
                        Games will default to this region when starting a new round.
                    </Text>

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
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.xxl,
    },
    screenTitle: {
        ...typography.h1,
        color: colors.primary,
        textAlign: "center",
        marginBottom: spacing.lg,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
        ...shadows.sm,
    },
    cardTitle: {
        ...typography.h3,
        color: colors.text,
        marginBottom: spacing.sm,
    },
    cardHint: {
        ...typography.bodySmall,
        color: colors.textSecondary,
        marginBottom: spacing.md,
    },
    settingRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    settingInfo: {
        flex: 1,
    },
    settingLabel: {
        ...typography.label,
        color: colors.text,
    },
    settingHint: {
        ...typography.caption,
        color: colors.textMuted,
        marginTop: 2,
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
});
