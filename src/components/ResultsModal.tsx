/**
 * ResultsModal — End-of-game summary showing score breakdown.
 */

import React, { useEffect, useMemo, useRef } from "react";
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGameStore } from "../stores/gameStore";
import { colors, spacing, radii, typography, shadows } from "../theme";

interface ResultsModalProps {
    visible: boolean;
    onClose: () => void;
    onEndGame: () => void;
    onResetGame: () => void;
}

const ResultsModal: React.FC<ResultsModalProps> = ({
    visible,
    onClose,
    onEndGame,
    onResetGame,
}) => {
    const { answers, birds } = useGameStore();
    const primaryBtnRef = useRef<View>(null);

    /* Move accessibility focus to the primary action when the modal opens */
    useEffect(() => {
        if (visible) {
            const id = setTimeout(() => primaryBtnRef.current?.focus(), 150);
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
});

export default ResultsModal;
