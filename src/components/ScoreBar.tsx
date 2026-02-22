/**
 * ScoreBar — Shows progress through the deck and running correct/incorrect count.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, radii, typography } from "../theme";

interface ScoreBarProps {
    current: number;
    total: number;
    correct: number;
    incorrect: number;
    skipped: number;
    familyLabel?: string;
    regionLabel?: string;
    difficultyLabel?: string;
}

const ScoreBar: React.FC<ScoreBarProps> = ({
    current,
    total,
    correct,
    incorrect,
    skipped,
    familyLabel,
    regionLabel,
    difficultyLabel,
}) => {
    const progress = total > 0 ? current / total : 0;
    const filterText = [difficultyLabel, familyLabel, regionLabel].filter(Boolean).join(" — ");

    return (
        <View style={styles.container}>
            <View style={styles.statsRow}>
                <Text style={[styles.stat, { color: colors.incorrect }]}>✗ {incorrect}</Text>
                <Text style={[styles.stat, { color: colors.textMuted }]}>⊘ {skipped}</Text>
                <Text style={[styles.stat, { color: colors.correct }]}>✓ {correct}</Text>
            </View>
            <View style={styles.track}>
                <View style={[styles.fill, { flex: progress }]} />
                <View style={{ flex: 1 - progress }} />
            </View>
            {filterText ? (
                <Text style={styles.filterText} numberOfLines={1}>
                    {filterText}
                </Text>
            ) : null}
        </View>
    );
};

export default ScoreBar;

const styles = StyleSheet.create({
    container: {
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: spacing.xs,
    },
    stat: {
        ...typography.label,
        fontSize: 15,
    },
    position: {
        ...typography.label,
        color: colors.textSecondary,
    },
    track: {
        height: 4,
        backgroundColor: colors.border,
        borderRadius: radii.full,
        flexDirection: "row",
        overflow: "hidden",
    },
    fill: {
        backgroundColor: colors.primary,
        borderRadius: radii.full,
    },
    filterText: {
        ...typography.caption,
        color: colors.textMuted,
        textAlign: "center" as const,
        marginTop: spacing.xs,
    },
});
