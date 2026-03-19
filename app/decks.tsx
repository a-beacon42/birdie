/**
 * Decks screen — manage saved decks.
 *
 * Lists all saved decks with play/delete options.
 * Shows deck count vs tier limit. Only accessible when authenticated.
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
import { useGameStore } from "../src/stores/gameStore";
import {
    fetchSavedDecks,
    playSavedDeck,
    deleteSavedDeck,
    type SavedDeckSummary,
    type LookalikeBirdSummary,
} from "../src/api/birdieApi";
import { showAlert } from "../src/utils/alert";

export default function DecksScreen() {
    const router = useRouter();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const user = useAuthStore((s) => s.user);
    const startGame = useGameStore((s) => s.startGame);
    const startLookalikeGame = useGameStore((s) => s.startLookalikeGame);

    const [decks, setDecks] = useState<SavedDeckSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [playingId, setPlayingId] = useState<string | null>(null);

    const loadDecks = useCallback(async () => {
        try {
            const data = await fetchSavedDecks();
            setDecks(data);
        } catch (err: unknown) {
            showAlert("Error", err instanceof Error ? err.message : "Failed to load decks");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated()) {
            loadDecks();
        } else {
            setLoading(false);
        }
    }, [isAuthenticated, loadDecks]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        loadDecks();
    }, [loadDecks]);

    const handlePlay = useCallback(async (deck: SavedDeckSummary) => {
        setPlayingId(deck.id);
        try {
            const birds = await playSavedDeck(deck.id);
            if (birds.length === 0) {
                showAlert("Empty deck", "No birds found for this deck configuration.");
                return;
            }
            if (deck.deck_type === "lookalike") {
                const lookalikes = birds as LookalikeBirdSummary[];
                const imageUrlsMap: Record<string, string[]> = {};
                for (const b of lookalikes) {
                    imageUrlsMap[b.species_code] = b.image_urls;
                }
                startLookalikeGame(lookalikes, imageUrlsMap);
            } else {
                startGame(birds, "flashcard", {});
            }
            router.push("/game");
        } catch (err: unknown) {
            showAlert("Error", err instanceof Error ? err.message : "Failed to load deck");
        } finally {
            setPlayingId(null);
        }
    }, [startGame, startLookalikeGame, router]);

    const handleDelete = useCallback(async (deck: SavedDeckSummary) => {
        try {
            await deleteSavedDeck(deck.id);
            setDecks((prev) => prev.filter((d) => d.id !== deck.id));
        } catch (err: unknown) {
            showAlert("Error", err instanceof Error ? err.message : "Failed to delete deck");
        }
    }, []);

    if (!isAuthenticated()) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["top"]}>
                <View style={styles.centered}>
                    <Text style={styles.emptyText}>Log in to save and manage decks.</Text>
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

                <Text style={styles.title}>Saved Decks</Text>

                {/* Deck limit indicator */}
                {user && (
                    <Text style={styles.limitText}>
                        {decks.length} / {user.max_saved_decks} decks used
                    </Text>
                )}

                {loading ? (
                    <ActivityIndicator
                        color={colors.primary}
                        size="large"
                        style={{ marginTop: spacing.xl }}
                    />
                ) : decks.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyCardTitle}>No saved decks yet</Text>
                        <Text style={styles.emptyCardSubtitle}>
                            Play a game and save the deck from the results screen!
                        </Text>
                    </View>
                ) : (
                    decks.map((deck) => (
                        <DeckCard
                            key={deck.id}
                            deck={deck}
                            playing={playingId === deck.id}
                            onPlay={() => handlePlay(deck)}
                            onDelete={() => handleDelete(deck)}
                        />
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function DeckCard({
    deck,
    playing,
    onPlay,
    onDelete,
}: {
    deck: SavedDeckSummary;
    playing: boolean;
    onPlay: () => void;
    onDelete: () => void;
}) {
    const typeLabel =
        deck.deck_type === "lookalike"
            ? "Lookalike"
            : deck.deck_type === "frozen"
                ? "🔒 Frozen"
                : "🔄 Dynamic";
    const speciesInfo = deck.species_count != null ? `${deck.species_count} species` : "";
    const filterInfo: string[] = [];
    if (deck.filters) {
        if (deck.filters.family) filterInfo.push(deck.filters.family);
        if (deck.filters.region_code) filterInfo.push(deck.filters.region_code);
        if (deck.filters.difficulty) filterInfo.push(deck.filters.difficulty);
    }
    const lastPlayed = deck.last_played_at
        ? `Last played ${new Date(deck.last_played_at).toLocaleDateString()}`
        : "Never played";

    return (
        <View style={deckStyles.card}>
            <View style={deckStyles.header}>
                <Text style={deckStyles.name} numberOfLines={1}>
                    {deck.name}
                </Text>
                <Text style={deckStyles.type}>{typeLabel}</Text>
            </View>

            <Text style={deckStyles.meta}>
                {[speciesInfo, ...filterInfo].filter(Boolean).join(" · ") || "No filters"}
            </Text>
            <Text style={deckStyles.lastPlayed}>{lastPlayed}</Text>

            <View style={deckStyles.actionRow}>
                <Pressable
                    style={[deckStyles.playBtn, playing && deckStyles.btnDisabled]}
                    onPress={onPlay}
                    disabled={playing}
                >
                    {playing ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={deckStyles.playBtnText}>▶ Play</Text>
                    )}
                </Pressable>
                <Pressable style={deckStyles.deleteBtn} onPress={onDelete}>
                    <Text style={deckStyles.deleteBtnText}>🗑 Delete</Text>
                </Pressable>
            </View>
        </View>
    );
}

const deckStyles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        ...shadows.sm,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: spacing.xs,
    },
    name: {
        ...typography.h3,
        color: colors.text,
        flex: 1,
        marginRight: spacing.sm,
    },
    type: {
        ...typography.caption,
        color: colors.primary,
        fontWeight: "600",
    },
    meta: {
        ...typography.bodySmall,
        color: colors.textSecondary,
    },
    lastPlayed: {
        ...typography.caption,
        color: colors.textMuted,
        marginTop: 2,
        marginBottom: spacing.sm,
    },
    actionRow: {
        flexDirection: "row",
        gap: spacing.sm,
    },
    playBtn: {
        flex: 1,
        backgroundColor: colors.primary,
        paddingVertical: 10,
        borderRadius: radii.md,
        alignItems: "center",
    },
    playBtnText: {
        ...typography.label,
        color: "#fff",
    },
    deleteBtn: {
        paddingVertical: 10,
        paddingHorizontal: spacing.md,
        borderRadius: radii.md,
        borderWidth: 1.5,
        borderColor: colors.error + "60",
    },
    deleteBtnText: {
        ...typography.label,
        color: colors.error,
    },
    btnDisabled: {
        opacity: 0.6,
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
        marginBottom: spacing.xs,
    },
    limitText: {
        ...typography.bodySmall,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: spacing.lg,
    },
    emptyCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.xl,
        alignItems: "center",
        marginTop: spacing.md,
        ...shadows.sm,
    },
    emptyCardTitle: {
        ...typography.h3,
        color: colors.text,
        marginBottom: spacing.xs,
    },
    emptyCardSubtitle: {
        ...typography.bodySmall,
        color: colors.textSecondary,
        textAlign: "center",
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
