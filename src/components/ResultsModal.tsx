/**
 * ResultsModal — End-of-game summary showing score breakdown.
 *
 * Authenticated users see a "Save Deck" button to save the current
 * deck configuration for future replay.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
    Modal,
    View,
    Text,
    TextInput,
    StyleSheet,
    Pressable,
    ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGameStore } from "../stores/gameStore";
import { useAuthStore } from "../stores/authStore";
import { saveDeck, type SaveDeckRequest } from "../api/birdieApi";
import { showAlert } from "../utils/alert";
import { colors, spacing, radii, typography, shadows } from "../theme";

interface ResultsModalProps {
    visible: boolean;
    onClose: () => void;
    onEndGame: () => void;
    onResetGame: () => void;
}

const ResultsModal: React.FC<ResultsModalProps> = ({
    visible,
    onClose: _onClose,
    onEndGame,
    onResetGame,
}) => {
    const { answers, birds } = useGameStore();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const user = useAuthStore((s) => s.user);
    const primaryBtnRef = useRef<View>(null);

    // Save deck state
    const [showSaveDeck, setShowSaveDeck] = useState(false);
    const [deckName, setDeckName] = useState("");
    const [deckType, setDeckType] = useState<"frozen" | "dynamic">("frozen");
    const [saving, setSaving] = useState(false);
    const [deckSaved, setDeckSaved] = useState(false);

    /* Move accessibility focus to the primary action when the modal opens */
    useEffect(() => {
        if (visible) {
            const id = setTimeout(() => primaryBtnRef.current?.focus(), 150);
            // Reset save deck state on modal open
            setShowSaveDeck(false);
            setDeckName("");
            setDeckSaved(false);
            return () => clearTimeout(id);
        }
    }, [visible]);

    const { correct, incorrect, skipped, total, pct, avgTime } = useMemo(() => {
        let c = 0, inc = 0, sk = 0;
        let totalTime = 0;
        for (const a of answers) {
            if (a.result === "correct") c++;
            else if (a.result === "incorrect") inc++;
            else sk++;
            totalTime += a.timeMs;
        }
        const t = birds.length;
        const p = t > 0 ? Math.round((c / t) * 100) : 0;
        const avg = answers.length > 0 ? Math.round(totalTime / answers.length / 1000) : 0;
        return { correct: c, incorrect: inc, skipped: sk, total: t, pct: p, avgTime: avg };
    }, [answers, birds.length]);

    const handleSaveDeck = useCallback(async () => {
        if (!deckName.trim()) {
            showAlert("Error", "Please enter a deck name.");
            return;
        }
        setSaving(true);
        try {
            const speciesCodes = birds.map((b) => b.species_code);
            const req: SaveDeckRequest = {
                name: deckName.trim(),
                deck_type: deckType,
                ...(deckType === "frozen" ? { species_codes: speciesCodes } : {}),
            };
            await saveDeck(req);
            setDeckSaved(true);
            showAlert("Saved!", `Deck "${deckName.trim()}" has been saved.`);
        } catch (err: unknown) {
            const msg =
                (err as any)?.response?.data?.detail ??
                (err instanceof Error ? err.message : "Failed to save deck");
            showAlert("Error", msg);
        } finally {
            setSaving(false);
        }
    }, [deckName, deckType, birds]);

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay} accessibilityViewIsModal={true}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.card}>
                        <Text style={styles.title} accessibilityRole="header">🎉 Game Complete!</Text>
                        <Text style={styles.subtitle}>
                            You scored {correct} out of {total}
                        </Text>

                        <View style={styles.scoreCircle}>
                            <Text style={styles.scorePct}>{pct}%</Text>
                        </View>

                        <View style={styles.statsGrid}>
                            <StatBox
                                label="Correct"
                                value={correct}
                                color={colors.correct}
                            />
                            <StatBox
                                label="Incorrect"
                                value={incorrect}
                                color={colors.incorrect}
                            />
                            <StatBox
                                label="Skipped"
                                value={skipped}
                                color={colors.textMuted}
                            />
                            <StatBox
                                label="Avg Time"
                                value={`${avgTime}s`}
                                color={colors.info}
                            />
                        </View>

                        <View style={styles.actionRow}>
                            <Pressable
                                ref={primaryBtnRef}
                                style={[styles.button, styles.buttonPrimary]}
                                onPress={onEndGame}
                                accessibilityRole="button"
                                accessibilityLabel="Start a new game"
                            >
                                <Text style={styles.buttonPrimaryText}>New Game</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.button, styles.buttonSecondary]}
                                onPress={onResetGame}
                                accessibilityRole="button"
                                accessibilityLabel="Reset and replay the same deck"
                            >
                                <Text style={styles.buttonSecondaryText}>Reset Game</Text>
                            </Pressable>
                        </View>

                        {/* Save Deck — only for authenticated users */}
                        {isAuthenticated() && !deckSaved && (
                            <View style={styles.saveDeckSection}>
                                {!showSaveDeck ? (
                                    <Pressable
                                        style={styles.saveDeckToggle}
                                        onPress={() => setShowSaveDeck(true)}
                                        accessibilityRole="button"
                                        accessibilityLabel="Save this deck"
                                    >
                                        <Text style={styles.saveDeckToggleText}>📚 Save Deck</Text>
                                    </Pressable>
                                ) : (
                                    <View>
                                        <TextInput
                                            style={styles.saveDeckInput}
                                            placeholder="Deck name"
                                            placeholderTextColor={colors.textMuted}
                                            value={deckName}
                                            onChangeText={setDeckName}
                                            maxLength={100}
                                            accessibilityLabel="Deck name"
                                        />
                                        <View style={styles.deckTypeRow}>
                                            <Pressable
                                                style={[
                                                    styles.deckTypeChip,
                                                    deckType === "frozen" && styles.deckTypeActive,
                                                ]}
                                                onPress={() => setDeckType("frozen")}
                                            >
                                                <Text
                                                    style={[
                                                        styles.deckTypeText,
                                                        deckType === "frozen" && styles.deckTypeTextActive,
                                                    ]}
                                                >
                                                    🔒 Frozen
                                                </Text>
                                            </Pressable>
                                            <Pressable
                                                style={[
                                                    styles.deckTypeChip,
                                                    deckType === "dynamic" && styles.deckTypeActive,
                                                ]}
                                                onPress={() => setDeckType("dynamic")}
                                            >
                                                <Text
                                                    style={[
                                                        styles.deckTypeText,
                                                        deckType === "dynamic" && styles.deckTypeTextActive,
                                                    ]}
                                                >
                                                    🔄 Dynamic
                                                </Text>
                                            </Pressable>
                                        </View>
                                        <Pressable
                                            style={[
                                                styles.button,
                                                styles.buttonPrimary,
                                                (saving || !deckName.trim()) && styles.buttonDisabled,
                                            ]}
                                            onPress={handleSaveDeck}
                                            disabled={saving || !deckName.trim()}
                                        >
                                            {saving ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <Text style={styles.buttonPrimaryText}>Save</Text>
                                            )}
                                        </Pressable>
                                        {user && (
                                            <Text style={styles.deckLimitHint}>
                                                Deck limit: {user.max_saved_decks}
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </View>
                        )}
                        {deckSaved && (
                            <Text style={styles.deckSavedText}>✅ Deck saved!</Text>
                        )}
                    </View>
                </SafeAreaView>
            </View>
        </Modal>
    );
};

function StatBox({
    label,
    value,
    color,
}: {
    label: string;
    value: number | string;
    color: string;
}) {
    return (
        <View style={statStyles.box}>
            <Text style={[statStyles.value, { color }]}>{value}</Text>
            <Text style={statStyles.label}>{label}</Text>
        </View>
    );
}

const statStyles = StyleSheet.create({
    box: {
        alignItems: "center",
        flex: 1,
    },
    value: {
        ...typography.h2,
        fontSize: 26,
    },
    label: {
        ...typography.caption,
        color: colors.textSecondary,
        marginTop: 2,
    },
});

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
    },
    safeArea: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radii.xl,
        padding: spacing.xl,
        alignItems: "center",
        ...shadows.lg,
    },
    title: {
        ...typography.h1,
        color: colors.text,
        marginBottom: spacing.xs,
    },
    subtitle: {
        ...typography.body,
        color: colors.textSecondary,
        marginBottom: spacing.lg,
    },
    scoreCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        borderColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: spacing.lg,
    },
    scorePct: {
        ...typography.h1,
        color: colors.primary,
        fontSize: 32,
    },
    statsGrid: {
        flexDirection: "row",
        width: "100%",
        marginBottom: spacing.xl,
    },
    actionRow: {
        flexDirection: "row",
        gap: spacing.sm,
        width: "100%",
    },
    button: {
        flex: 1,
        paddingVertical: 14,
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
        opacity: 0.5,
    },
    saveDeckSection: {
        marginTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: spacing.md,
    },
    saveDeckToggle: {
        alignItems: "center",
        paddingVertical: spacing.sm,
    },
    saveDeckToggleText: {
        ...typography.label,
        color: colors.primary,
        fontSize: 15,
    },
    saveDeckInput: {
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radii.md,
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
        ...typography.body,
        color: colors.text,
        marginBottom: spacing.sm,
    },
    deckTypeRow: {
        flexDirection: "row",
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    deckTypeChip: {
        flex: 1,
        paddingVertical: spacing.xs,
        borderRadius: radii.md,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: "center",
    },
    deckTypeActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },
    deckTypeText: {
        ...typography.caption,
        fontWeight: "600",
        color: colors.textSecondary,
    },
    deckTypeTextActive: {
        color: "#fff",
    },
    deckLimitHint: {
        ...typography.caption,
        color: colors.textMuted,
        textAlign: "center",
        marginTop: spacing.xs,
    },
    deckSavedText: {
        ...typography.label,
        color: colors.success,
        textAlign: "center",
        marginTop: spacing.md,
    },
});

export default ResultsModal;
