/**
 * Stats screen — performance dashboard.
 *
 * Shows overview stats, species mastery list, confusion pairs,
 * and trend summaries. Only accessible when authenticated.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    ActivityIndicator,
    RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radii, typography, shadows } from "../src/theme";
import { useAuthStore } from "../src/stores/authStore";
import {
    fetchOverview,
    fetchSpeciesStats,
    fetchConfusions,
    fetchTrends,
    fetchBirds,
    type OverviewStats,
    type SpeciesMastery,
    type ConfusionPair,
    type TrendsResponse,
} from "../src/api/birdieApi";
import { showAlert } from "../src/utils/alert";
import { formatPct } from "../src/utils/format";

type TabKey = "overview" | "species" | "confusions" | "trends";

export default function StatsScreen() {
    const router = useRouter();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    const [activeTab, setActiveTab] = useState<TabKey>("overview");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Data
    const [overview, setOverview] = useState<OverviewStats | null>(null);
    const [species, setSpecies] = useState<SpeciesMastery[]>([]);
    const [confusions, setConfusions] = useState<ConfusionPair[]>([]);
    const [trends, setTrends] = useState<TrendsResponse | null>(null);
    // eBird species_code → common name, for display in the species/confusions tabs.
    const [nameMap, setNameMap] = useState<Record<string, string>>({});

    const loadData = useCallback(async () => {
        try {
            const [ov, sp, cf, tr] = await Promise.all([
                fetchOverview(),
                fetchSpeciesStats(),
                fetchConfusions(),
                fetchTrends(30),
            ]);
            setOverview(ov);
            setSpecies(sp);
            setConfusions(cf);
            setTrends(tr);

            // Resolve the eBird codes shown in the species/confusions tabs to
            // common names. Best-effort: on failure we fall back to the codes.
            const codes = Array.from(
                new Set([
                    ...sp.map((s) => s.species_code),
                    ...cf.flatMap((c) => [c.target_code, c.confused_with]),
                ]),
            );
            if (codes.length > 0) {
                try {
                    const birds = await fetchBirds({
                        species_codes: codes.join(","),
                        limit: codes.length,
                    });
                    setNameMap(
                        Object.fromEntries(
                            birds.map((b) => [b.species_code, b.com_name]),
                        ),
                    );
                } catch {
                    // Non-fatal — codes will be shown instead of names.
                }
            }
        } catch (err: unknown) {
            showAlert("Error", err instanceof Error ? err.message : "Failed to load stats");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated()) {
            loadData();
        } else {
            setLoading(false);
        }
    }, [isAuthenticated, loadData]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        loadData();
    }, [loadData]);

    if (!isAuthenticated()) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["top"]}>
                <View style={styles.centered}>
                    <Text style={styles.emptyText}>Log in to see your stats.</Text>
                    <Pressable
                        style={[styles.button, styles.buttonPrimary]}
                        onPress={() => router.replace("/login")}
                    >
                        <Text style={styles.buttonPrimaryText}>Log In</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                {/* Back button */}
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>‹ Back</Text>
                </Pressable>

                <Text style={styles.title}>Your Stats</Text>

                {/* Tabs */}
                <View style={styles.tabRow}>
                    {(["overview", "species", "confusions", "trends"] as TabKey[]).map((tab) => (
                        <Pressable
                            key={tab}
                            style={[styles.tab, activeTab === tab && styles.tabActive]}
                            onPress={() => setActiveTab(tab)}
                        >
                            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {loading ? (
                    <ActivityIndicator
                        color={colors.primary}
                        size="large"
                        style={{ marginTop: spacing.xl }}
                    />
                ) : (
                    <>
                        {activeTab === "overview" && overview && (
                            <OverviewTab overview={overview} />
                        )}
                        {activeTab === "species" && (
                            <SpeciesTab species={species} nameMap={nameMap} />
                        )}
                        {activeTab === "confusions" && (
                            <ConfusionsTab confusions={confusions} nameMap={nameMap} />
                        )}
                        {activeTab === "trends" && trends && (
                            <TrendsTab trends={trends} />
                        )}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// --- Overview Tab ---

function OverviewTab({ overview }: { overview: OverviewStats }) {
    const deltaColor = overview.accuracy_delta_week >= 0 ? colors.success : colors.error;
    const deltaSign = overview.accuracy_delta_week >= 0 ? "+" : "";

    return (
        <View>
            {/* Life list */}
            <View style={cardStyles.card}>
                <Text style={cardStyles.cardTitle}>Life List</Text>
                <Text style={cardStyles.bigNumber}>{overview.life_list_count}</Text>
                <Text style={cardStyles.subText}>
                    of {overview.total_species_available} species ({formatPct(overview.life_list_pct)})
                </Text>
            </View>

            {/* Accuracy */}
            <View style={cardStyles.card}>
                <Text style={cardStyles.cardTitle}>Overall Accuracy</Text>
                <Text style={cardStyles.bigNumber}>
                    {formatPct(overview.overall_accuracy)}
                </Text>
                <Text style={[cardStyles.subText, { color: deltaColor }]}>
                    {deltaSign}{formatPct(overview.accuracy_delta_week)} this week
                </Text>
            </View>

            {/* Stats grid */}
            <View style={cardStyles.grid}>
                <MiniStat label="Sessions" value={overview.total_sessions} />
                <MiniStat label="Answers" value={overview.total_answers} />
                <MiniStat label="This Week" value={overview.games_this_week} />
                <MiniStat label="Daily Streak" value={`${overview.daily_practice_streak}d`} />
                <MiniStat label="Best Streak" value={overview.longest_streak} />
                <MiniStat label="Current" value={overview.current_streak} />
            </View>
        </View>
    );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
    return (
        <View style={cardStyles.miniStat}>
            <Text style={cardStyles.miniValue}>{value}</Text>
            <Text style={cardStyles.miniLabel}>{label}</Text>
        </View>
    );
}

// --- Species Tab ---

function SpeciesTab({
    species,
    nameMap,
}: {
    species: SpeciesMastery[];
    nameMap: Record<string, string>;
}) {
    if (species.length === 0) {
        return (
            <View style={cardStyles.card}>
                <Text style={cardStyles.subText}>No species data yet. Play some games!</Text>
            </View>
        );
    }

    return (
        <View>
            <Text style={styles.sectionHeader}>
                Sorted by accuracy (weakest first)
            </Text>
            {species.slice(0, 50).map((sp) => (
                <View key={sp.species_code} style={speciesStyles.row}>
                    <View style={speciesStyles.info}>
                        <Text style={speciesStyles.name} numberOfLines={1}>
                            {nameMap[sp.species_code] ?? sp.species_code}
                        </Text>
                        <MasteryBadge mastery={sp.mastery} />
                    </View>
                    <View style={speciesStyles.stats}>
                        <Text style={speciesStyles.accuracy}>
                            {(sp.accuracy * 100).toFixed(0)}%
                        </Text>
                        <Text style={speciesStyles.meta}>
                            {sp.correct}/{sp.attempts} · {Math.round(sp.avg_time_ms / 1000)}s avg
                        </Text>
                    </View>
                </View>
            ))}
            {species.length > 50 && (
                <Text style={[cardStyles.subText, { textAlign: "center", marginTop: spacing.sm }]}>
                    Showing top 50 of {species.length} species
                </Text>
            )}
        </View>
    );
}

function MasteryBadge({ mastery }: { mastery: SpeciesMastery["mastery"] }) {
    const colorMap: Record<string, string> = {
        master: colors.primary,
        expert: colors.success,
        familiar: colors.info,
        novice: colors.warning,
        unfamiliar: colors.textMuted,
    };
    return (
        <View style={[speciesStyles.badge, { backgroundColor: (colorMap[mastery] ?? colors.textMuted) + "20" }]}>
            <Text style={[speciesStyles.badgeText, { color: colorMap[mastery] ?? colors.textMuted }]}>
                {mastery}
            </Text>
        </View>
    );
}

// --- Confusions Tab ---

function ConfusionsTab({
    confusions,
    nameMap,
}: {
    confusions: ConfusionPair[];
    nameMap: Record<string, string>;
}) {
    if (confusions.length === 0) {
        return (
            <View style={cardStyles.card}>
                <Text style={cardStyles.subText}>
                    No confusion data yet. Play some multiple-choice games!
                </Text>
            </View>
        );
    }

    return (
        <View>
            <Text style={styles.sectionHeader}>Species you mix up the most</Text>
            {confusions.map((pair, i) => (
                <View key={`${pair.target_code}-${pair.confused_with}`} style={confusionStyles.row}>
                    <Text style={confusionStyles.rank}>#{i + 1}</Text>
                    <View style={confusionStyles.pair}>
                        <Text style={confusionStyles.target} numberOfLines={1}>
                            {nameMap[pair.target_code] ?? pair.target_code}
                        </Text>
                        <Text style={confusionStyles.arrow}>↔</Text>
                        <Text style={confusionStyles.confused} numberOfLines={1}>
                            {nameMap[pair.confused_with] ?? pair.confused_with}
                        </Text>
                    </View>
                    <Text style={confusionStyles.count}>{pair.occurrences}×</Text>
                </View>
            ))}
        </View>
    );
}

// --- Trends Tab ---

function TrendsTab({ trends }: { trends: TrendsResponse }) {
    return (
        <View>
            {/* Quiz mode breakdown */}
            {trends.by_quiz_mode.length > 0 && (
                <View style={cardStyles.card}>
                    <Text style={cardStyles.cardTitle}>By Quiz Mode</Text>
                    {trends.by_quiz_mode.map((m) => (
                        <View key={m.mode} style={trendStyles.row}>
                            <Text style={trendStyles.label}>{m.mode}</Text>
                            <Text style={trendStyles.value}>
                                {(m.accuracy * 100).toFixed(0)}% ({m.correct}/{m.attempts})
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Difficulty breakdown */}
            {trends.by_difficulty.length > 0 && (
                <View style={cardStyles.card}>
                    <Text style={cardStyles.cardTitle}>By Difficulty</Text>
                    {trends.by_difficulty.map((d) => (
                        <View key={d.difficulty} style={trendStyles.row}>
                            <Text style={trendStyles.label}>{d.difficulty}</Text>
                            <Text style={trendStyles.value}>
                                {(d.accuracy * 100).toFixed(0)}% ({d.correct}/{d.attempts})
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Regional breakdown */}
            {trends.by_region.length > 0 && (
                <View style={cardStyles.card}>
                    <Text style={cardStyles.cardTitle}>By Region</Text>
                    {trends.by_region.map((r) => (
                        <View key={r.region_code} style={trendStyles.row}>
                            <Text style={trendStyles.label}>{r.region_code}</Text>
                            <Text style={trendStyles.value}>
                                {(r.accuracy * 100).toFixed(0)}% ({r.correct}/{r.attempts})
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Daily summary */}
            {trends.daily.length > 0 && (
                <View style={cardStyles.card}>
                    <Text style={cardStyles.cardTitle}>Last 30 Days</Text>
                    {trends.daily.slice(-10).map((d) => (
                        <View key={d.date} style={trendStyles.row}>
                            <Text style={trendStyles.label}>{d.date}</Text>
                            <Text style={trendStyles.value}>
                                {d.sessions} game{d.sessions !== 1 ? "s" : ""} · {(d.accuracy * 100).toFixed(0)}% · {d.species_studied} sp.
                            </Text>
                        </View>
                    ))}
                    {trends.daily.length > 10 && (
                        <Text style={[cardStyles.subText, { marginTop: spacing.xs }]}>
                            Showing last 10 of {trends.daily.length} days
                        </Text>
                    )}
                </View>
            )}

            {trends.daily.length === 0 &&
                trends.by_quiz_mode.length === 0 &&
                trends.by_difficulty.length === 0 &&
                trends.by_region.length === 0 && (
                    <View style={cardStyles.card}>
                        <Text style={cardStyles.subText}>No trend data yet. Play some games!</Text>
                    </View>
                )}
        </View>
    );
}

// --- Shared sub-styles ---

const cardStyles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        ...shadows.sm,
    },
    cardTitle: {
        ...typography.h3,
        color: colors.text,
        marginBottom: spacing.sm,
    },
    bigNumber: {
        ...typography.h1,
        color: colors.primary,
        fontSize: 40,
        textAlign: "center",
    },
    subText: {
        ...typography.bodySmall,
        color: colors.textSecondary,
        textAlign: "center",
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
    },
    miniStat: {
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        padding: spacing.sm,
        alignItems: "center",
        width: "30%",
        flexGrow: 1,
        ...shadows.sm,
    },
    miniValue: {
        ...typography.h3,
        color: colors.text,
    },
    miniLabel: {
        ...typography.caption,
        color: colors.textSecondary,
        marginTop: 2,
    },
});

const speciesStyles = StyleSheet.create({
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    info: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        marginRight: spacing.sm,
    },
    name: {
        ...typography.label,
        color: colors.text,
        flexShrink: 1,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: radii.sm,
    },
    badgeText: {
        ...typography.caption,
        fontWeight: "600",
        textTransform: "capitalize",
    },
    stats: {
        alignItems: "flex-end",
    },
    accuracy: {
        ...typography.label,
        color: colors.text,
    },
    meta: {
        ...typography.caption,
        color: colors.textMuted,
    },
});

const confusionStyles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    rank: {
        ...typography.label,
        color: colors.textMuted,
        width: 30,
    },
    pair: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
    },
    target: {
        ...typography.label,
        color: colors.text,
        flexShrink: 1,
    },
    arrow: {
        ...typography.body,
        color: colors.textMuted,
    },
    confused: {
        ...typography.label,
        color: colors.error,
        flexShrink: 1,
    },
    count: {
        ...typography.label,
        color: colors.textSecondary,
    },
});

const trendStyles = StyleSheet.create({
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    label: {
        ...typography.label,
        color: colors.text,
    },
    value: {
        ...typography.bodySmall,
        color: colors.textSecondary,
    },
});

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    centered: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
    },
    emptyText: {
        ...typography.body,
        color: colors.textSecondary,
        marginBottom: spacing.lg,
    },
    scrollContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
    },
    backBtn: {
        paddingVertical: spacing.md,
    },
    backBtnText: {
        ...typography.label,
        color: colors.primary,
        fontSize: 16,
    },
    title: {
        ...typography.h1,
        color: colors.primary,
        textAlign: "center",
        marginBottom: spacing.sm,
    },
    tabRow: {
        flexDirection: "row",
        marginBottom: spacing.md,
        gap: spacing.xs,
    },
    tab: {
        flex: 1,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: "center",
    },
    tabActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },
    tabText: {
        ...typography.caption,
        fontWeight: "600",
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: "#fff",
    },
    sectionHeader: {
        ...typography.bodySmall,
        color: colors.textMuted,
        marginBottom: spacing.sm,
    },
    button: {
        paddingVertical: 14,
        paddingHorizontal: spacing.xl,
        borderRadius: radii.md,
        alignItems: "center",
    },
    buttonPrimary: {
        backgroundColor: colors.primary,
    },
    buttonPrimaryText: {
        ...typography.label,
        color: "#fff",
        fontSize: 16,
    },
});
