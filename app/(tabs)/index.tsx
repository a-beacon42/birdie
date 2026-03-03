/**
 * Home tab — landing page with branding and quick navigation.
 *
 * Shows Decks/Stats shortcuts when authenticated, or a sign-up
 * prompt for anonymous users.
 */

import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii, typography, shadows } from "../../src/theme";
import { useAuthStore } from "../../src/stores/authStore";

export default function HomeScreen() {
    const router = useRouter();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const user = useAuthStore((s) => s.user);

    const memberSince = user
        ? new Date(user.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
        })
        : null;

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>birdie</Text>
                    <Text style={styles.subtitle}>Learn to identify birds</Text>
                </View>

                {/* Authenticated: quick-access cards */}
                {isAuthenticated() && (
                    <>
                        <View style={styles.cardsRow}>
                            <Pressable
                                style={styles.linkCard}
                                onPress={() => router.push("/decks")}
                                accessibilityRole="button"
                                accessibilityLabel="My saved decks"
                            >
                                <Ionicons name="albums-outline" size={28} color={colors.primary} />
                                <Text style={styles.linkCardTitle}>Decks</Text>
                                <Text style={styles.linkCardDesc}>Your saved decks</Text>
                            </Pressable>
                            <Pressable
                                style={styles.linkCard}
                                onPress={() => router.push("/stats")}
                                accessibilityRole="button"
                                accessibilityLabel="My stats"
                            >
                                <Ionicons name="bar-chart-outline" size={28} color={colors.primary} />
                                <Text style={styles.linkCardTitle}>Stats</Text>
                                <Text style={styles.linkCardDesc}>Track your progress</Text>
                            </Pressable>
                        </View>

                        <View style={styles.welcomeCard}>
                            <Text style={styles.welcomeText}>
                                Ready to play? Head to the{" "}
                                <Text style={styles.welcomeLink}>New Game</Text> tab to
                                start a round.
                            </Text>
                            {memberSince && (
                                <Text style={styles.memberSince}>
                                    Member since {memberSince}
                                </Text>
                            )}
                        </View>
                    </>
                )}

                {/* Anonymous: sign-up CTA */}
                {!isAuthenticated() && (
                    <View style={styles.ctaCard}>
                        <Text style={styles.ctaTitle}>Welcome to Birdie!</Text>
                        <Text style={styles.ctaText}>
                            Create an account to save decks, track your stats, and more.
                            Or jump straight into a game from the New Game tab.
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
        ...typography.body,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },
    cardsRow: {
        flexDirection: "row",
        gap: spacing.md,
        marginBottom: spacing.lg,
    },
    linkCard: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        alignItems: "center",
        gap: spacing.xs,
        ...shadows.md,
    },
    linkCardTitle: {
        ...typography.h3,
        color: colors.text,
    },
    linkCardDesc: {
        ...typography.caption,
        color: colors.textSecondary,
        textAlign: "center",
    },
    welcomeCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        ...shadows.sm,
    },
    welcomeText: {
        ...typography.body,
        color: colors.textSecondary,
        textAlign: "center",
    },
    welcomeLink: {
        color: colors.primary,
        fontWeight: "600",
    },
    memberSince: {
        ...typography.caption,
        color: colors.textMuted,
        textAlign: "center",
        marginTop: spacing.sm,
    },
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
