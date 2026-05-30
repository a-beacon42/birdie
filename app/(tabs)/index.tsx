/**
 * Home tab — dashboard with live stats and saved decks.
 *
 * Authenticated users see a stats summary and their most recent saved
 * decks with inline play buttons. Anonymous users see a sign-up CTA.
 */

import React, { useState, useCallback } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii, typography, shadows } from "../../src/theme";
import { useAuthStore } from "../../src/stores/authStore";
import { useGameStore } from "../../src/stores/gameStore";
import { usePreferencesStore } from "../../src/stores/preferencesStore";
import {
    fetchOverview,
    fetchSavedDecks,
    playSavedDeck,
    type LookalikeBirdSummary,
    type OverviewStats,
    type SavedDeckSummary,
} from "../../src/api/birdieApi";
import { showAlert } from "../../src/utils/alert";
import { formatPct } from "../../src/utils/format";
import { buildLookalikeDeck } from "../../src/utils/lookalikes";

/** How many saved decks to show on the home screen before "See all". */
const MAX_DECKS_SHOWN = 3;

export default function HomeScreen() {
    const router = useRouter();
    const token = useAuthStore((s) => s.token);
    const user = useAuthStore((s) => s.user);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const loggedIn = !!token && !!user;
    const startGame = useGameStore((s) => s.startGame);
    const startLookalikeGame = useGameStore((s) => s.startLookalikeGame);
    const cardCount = usePreferencesStore((s) => s.cardCount);

    const [overview, setOverview] = useState<OverviewStats | null>(null);
    const [decks, setDecks] = useState<SavedDeckSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [playingId, setPlayingId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        try {
            const [ov, dk] = await Promise.all([
                fetchOverview(),
                fetchSavedDecks(),
            ]);
            setOverview(ov);
            setDecks(dk);
        } catch (err: unknown) {
            showAlert(
                "Error",
                err instanceof Error ? err.message : "Failed to load home data",
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Re-fetch stats every time the tab gains focus (e.g. after finishing a game)
    useFocusEffect(
        useCallback(() => {
            if (loggedIn) {
                loadData();
            } else {
                setLoading(false);
            }
        }, [loggedIn, loadData]),
    );

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        loadData();
    }, [loadData]);

    const handlePlay = useCallback(
        async (deck: SavedDeckSummary) => {
            setPlayingId(deck.id);
            try {
                const birds = await playSavedDeck(deck.id, cardCount);
                if (birds.length === 0) {
                    showAlert(
                        "Empty deck",
                        "No birds found for this deck configuration.",
                    );
                    return;
                }
                if (deck.deck_type === "lookalike") {
                    const lookalikes = birds as LookalikeBirdSummary[];
                    const { birds: expandedBirds, imageUrlsMap } = buildLookalikeDeck(
                        lookalikes,
                        cardCount,
                    );
                    if (expandedBirds.length === 0) {
                        showAlert("Empty deck", "No birds found for this lookalike deck.");
                        return;
                    }
                    startLookalikeGame(expandedBirds, imageUrlsMap, {
                        familyLabel: lookalikes.map((bird) => bird.com_name).join(" vs "),
                    });
                } else {
                    startGame(birds, "flashcard", {});
                }
                router.push("/game");
            } catch (err: unknown) {
                showAlert(
                    "Error",
                    err instanceof Error ? err.message : "Failed to load deck",
                );
            } finally {
                setPlayingId(null);
            }
        },
        [cardCount, startGame, startLookalikeGame, router],
    );

    const memberSince = user
        ? new Date(user.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
        })
        : null;

    const visibleDecks = decks.slice(0, MAX_DECKS_SHOWN);
    const hasMoreDecks = decks.length > MAX_DECKS_SHOWN;

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    loggedIn ? (
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                        />
                    ) : undefined
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>birdie</Text>
                    {memberSince && (
                        <Text style={styles.subtitle}>
                            Member since {memberSince}
                        </Text>
                    )}
                    {!loggedIn && (
                        <Text style={styles.subtitle}>
                            Learn to identify birds
                        </Text>
                    )}
                </View>

                {/* ── Authenticated dashboard ────────────────────────── */}
                {loggedIn && (
                    <>
                        {loading ? (
                            <ActivityIndicator
                                color={colors.primary}
                                size="large"
                                style={{ marginVertical: spacing.xl }}
                            />
                        ) : (
                            <>
                                {/* Stats summary */}
                                {overview && <StatsCard overview={overview} onSeeAll={() => router.push("/stats")} />}

                                {/* Saved decks */}
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>Saved Decks</Text>
                                    <Pressable
                                        onPress={() => router.push("/decks")}
                                        accessibilityRole="button"
                                        accessibilityLabel="See all decks"
                                    >
                                        <Text style={styles.seeAll}>See all</Text>
                                    </Pressable>
                                </View>

                                {visibleDecks.length === 0 ? (
                                    <View style={styles.emptyCard}>
                                        <Ionicons
                                            name="albums-outline"
                                            size={32}
                                            color={colors.textMuted}
                                        />
                                        <Text style={styles.emptyText}>
                                            No saved decks yet. Play a game and save it
                                            from the results screen!
                                        </Text>
                                    </View>
                                ) : (
                                    visibleDecks.map((deck) => (
                                        <DeckRow
                                            key={deck.id}
                                            deck={deck}
                                            playing={playingId === deck.id}
                                            onPlay={() => handlePlay(deck)}
                                        />
                                    ))
                                )}

                                {hasMoreDecks && (
                                    <Pressable
                                        style={styles.seeAllButton}
                                        onPress={() => router.push("/decks")}
                                        accessibilityRole="button"
                                    >
                                        <Text style={styles.seeAllButtonText}>
                                            View all {decks.length} decks
                                        </Text>
                                    </Pressable>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* ── Anonymous CTA ──────────────────────────────────── */}
                {!loggedIn && (
                    <View style={styles.ctaCard}>
                        <Text style={styles.ctaTitle}>Welcome to Birdie!</Text>
                        <Text style={styles.ctaText}>
                            Create an account to save decks, track your stats, and
                            more. Or jump straight into a game from the New Game tab.
                        </Text>
                        <View style={styles.ctaButtons}>
                            <Pressable
                                style={[styles.button, styles.buttonPrimary]}
                                onPress={() => router.push("/register")}
                                accessibilityRole="button"
                            >
                                <Text style={styles.buttonPrimaryText}>Sign Up</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.button, styles.buttonSecondary]}
                                onPress={() => router.push("/login")}
                                accessibilityRole="button"
                            >
                                <Text style={styles.buttonSecondaryText}>Log In</Text>
                            </Pressable>
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Stats summary card                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

function StatsCard({
    overview,
    onSeeAll,
}: {
    overview: OverviewStats;
    onSeeAll: () => void;
}) {
    const accuracyDeltaSign = overview.accuracy_delta_week >= 0 ? "+" : "";
    const accuracyDeltaColor =
        overview.accuracy_delta_week >= 0 ? colors.success : colors.error;

    return (
        <View style={styles.statsCard}>
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your Stats</Text>
                <Pressable
                    onPress={onSeeAll}
                    accessibilityRole="button"
                    accessibilityLabel="See all stats"
                >
                    <Text style={styles.seeAll}>See all</Text>
                </Pressable>
            </View>

            {/* Top row — big numbers */}
            <View style={styles.statsRow}>
                <StatTile
                    label="Life List"
                    value={overview.life_list_count.toString()}
                    sub={formatPct(overview.life_list_pct)}
                />
                <StatTile
                    label="Accuracy"
                    value={formatPct(overview.overall_accuracy)}
                    sub={`${accuracyDeltaSign}${formatPct(overview.accuracy_delta_week)} this week`}
                    subColor={accuracyDeltaColor}
                />
            </View>

            {/* Bottom row — secondary stats */}
            <View style={styles.statsRow}>
                <StatTile
                    label="Games"
                    value={overview.total_sessions.toString()}
                    sub={`${overview.games_this_week} this week`}
                />
                <StatTile
                    label="Streak"
                    value={`${overview.daily_practice_streak}d`}
                    sub={`Best: ${overview.longest_streak}d`}
                />
            </View>
        </View>
    );
}

function StatTile({
    label,
    value,
    sub,
    subColor,
}: {
    label: string;
    value: string;
    sub?: string;
    subColor?: string;
}) {
    return (
        <View style={styles.statTile}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
            {sub && (
                <Text
                    style={[
                        styles.statSub,
                        subColor ? { color: subColor } : undefined,
                    ]}
                >
                    {sub}
                </Text>
            )}
        </View>
    );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Deck row                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

function DeckRow({
    deck,
    playing,
    onPlay,
}: {
    deck: SavedDeckSummary;
    playing: boolean;
    onPlay: () => void;
}) {
    const filterParts: string[] = [];
    if (deck.filters?.region_code) filterParts.push(deck.filters.region_code);
    if (deck.filters?.difficulty) filterParts.push(deck.filters.difficulty);
    if (deck.filters?.family) filterParts.push(deck.filters.family);
    const meta = [
        deck.species_count != null ? `${deck.species_count} species` : null,
        ...filterParts,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <View style={styles.deckRow}>
            <View style={styles.deckInfo}>
                <Text style={styles.deckName} numberOfLines={1}>
                    {deck.name}
                </Text>
                {meta ? (
                    <Text style={styles.deckMeta} numberOfLines={1}>
                        {meta}
                    </Text>
                ) : null}
            </View>
            <Pressable
                style={[styles.playBtn, playing && styles.playBtnDisabled]}
                onPress={onPlay}
                disabled={playing}
                accessibilityRole="button"
                accessibilityLabel={`Play ${deck.name}`}
            >
                {playing ? (
                    <ActivityIndicator color="#fff" size="small" />
                ) : (
                    <Ionicons name="play" size={16} color="#fff" />
                )}
            </Pressable>
        </View>
    );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Styles                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
    },
    header: {
        alignItems: "center",
        paddingTop: spacing.xl,
        paddingBottom: spacing.lg,
    },
    title: {
        ...typography.h1,
        color: colors.primary,
        fontSize: 36,
    },
    subtitle: {
        ...typography.bodySmall,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },

    /* Section header (stats / decks) */
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: spacing.sm,
    },
    sectionTitle: {
        ...typography.h3,
        color: colors.text,
    },
    seeAll: {
        ...typography.label,
        color: colors.primary,
    },

    /* Stats card */
    statsCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        ...shadows.sm,
    },
    statsRow: {
        flexDirection: "row",
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    statTile: {
        flex: 1,
        backgroundColor: colors.background,
        borderRadius: radii.md,
        padding: spacing.md,
        alignItems: "center",
    },
    statValue: {
        ...typography.h2,
        color: colors.primary,
    },
    statLabel: {
        ...typography.caption,
        color: colors.textSecondary,
        marginTop: 2,
    },
    statSub: {
        ...typography.caption,
        color: colors.textMuted,
        marginTop: 2,
    },

    /* Deck rows */
    deckRow: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        padding: spacing.md,
        marginBottom: spacing.sm,
        ...shadows.sm,
    },
    deckInfo: {
        flex: 1,
        marginRight: spacing.sm,
    },
    deckName: {
        ...typography.label,
        color: colors.text,
        fontSize: 15,
    },
    deckMeta: {
        ...typography.caption,
        color: colors.textSecondary,
        marginTop: 2,
    },
    playBtn: {
        width: 36,
        height: 36,
        borderRadius: radii.full,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    playBtnDisabled: {
        opacity: 0.5,
    },
    seeAllButton: {
        alignItems: "center",
        paddingVertical: spacing.sm,
        marginBottom: spacing.lg,
    },
    seeAllButtonText: {
        ...typography.label,
        color: colors.primary,
    },

    /* Empty state */
    emptyCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        alignItems: "center",
        gap: spacing.sm,
        marginBottom: spacing.lg,
        ...shadows.sm,
    },
    emptyText: {
        ...typography.body,
        color: colors.textSecondary,
        textAlign: "center",
    },

    /* Anonymous CTA */
    ctaCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        alignItems: "center",
        ...shadows.md,
    },
    ctaTitle: {
        ...typography.h2,
        color: colors.text,
        marginBottom: spacing.sm,
    },
    ctaText: {
        ...typography.body,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: spacing.lg,
    },
    ctaButtons: {
        flexDirection: "row",
        gap: spacing.sm,
        width: "100%",
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
});
