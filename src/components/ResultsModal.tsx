/**
 * ResultsModal — End-of-game summary showing score breakdown.
 */

import React from "react";
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
}

const ResultsModal: React.FC<ResultsModalProps> = ({
    visible,
    onClose,
    onEndGame,
}) => {
    const { answers, birds } = useGameStore();
    const correct = answers.filter((a) => a.result === "correct").length;
    const incorrect = answers.filter((a) => a.result === "incorrect").length;
    const skipped = answers.filter((a) => a.result === "skipped").length;
    const total = birds.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    const avgTime =
        answers.length > 0
            ? Math.round(
                answers.reduce((sum, a) => sum + a.timeMs, 0) / answers.length / 1000
            )
            : 0;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.overlay}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.card}>
                        <Text style={styles.title}>🎉 Game Complete!</Text>
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
                                style={[styles.button, styles.buttonPrimary]}
                                onPress={onEndGame}
                            >
                                <Text style={styles.buttonPrimaryText}>New Game</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.button, styles.buttonSecondary]}
                                onPress={onClose}
                            >
                                <Text style={styles.buttonSecondaryText}>Review Cards</Text>
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
