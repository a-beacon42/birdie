/**
 * Account tab — authentication and account management.
 *
 * Logged-in: shows account info, change password, logout, delete account.
 * Logged-out: shows login / sign-up prompt.
 *
 * Change email and reset password are deferred (coming soon).
 */

import React, { useState, useCallback } from "react";
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Pressable,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii, typography, shadows } from "../../src/theme";
import { useAuthStore } from "../../src/stores/authStore";
import { changePassword, deleteAccount } from "../../src/api/birdieApi";
import { showAlert } from "../../src/utils/alert";

export default function AccountScreen() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const clearAuth = useAuthStore((s) => s.clearAuth);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    // Change password form
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [changingPw, setChangingPw] = useState(false);

    // Delete account form
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletePw, setDeletePw] = useState("");
    const [deleting, setDeleting] = useState(false);

    const handleLogout = useCallback(() => {
        clearAuth();
        router.replace("/");
    }, [clearAuth, router]);

    const handleChangePassword = useCallback(async () => {
        if (newPw !== confirmPw) {
            showAlert("Error", "New passwords do not match");
            return;
        }
        setChangingPw(true);
        try {
            await changePassword(currentPw, newPw);
            showAlert("Success", "Password changed successfully");
            setShowChangePassword(false);
            setCurrentPw("");
            setNewPw("");
            setConfirmPw("");
        } catch (err: unknown) {
            const msg =
                (err as any)?.response?.data?.detail ??
                (err instanceof Error ? err.message : "Failed to change password");
            showAlert("Error", msg);
        } finally {
            setChangingPw(false);
        }
    }, [currentPw, newPw, confirmPw]);

    const handleDeleteAccount = useCallback(async () => {
        setDeleting(true);
        try {
            await deleteAccount(deletePw);
            clearAuth();
            showAlert(
                "Account Deleted",
                "Your account and all data have been permanently removed.",
            );
            router.replace("/");
        } catch (err: unknown) {
            const msg =
                (err as any)?.response?.data?.detail ??
                (err instanceof Error ? err.message : "Failed to delete account");
            showAlert("Error", msg);
        } finally {
            setDeleting(false);
        }
    }, [deletePw, clearAuth, router]);

    // ── Not authenticated ────────────────────────────────────────────────
    if (!isAuthenticated() || !user) {
        return (
            <SafeAreaView style={styles.safeArea} edges={["top"]}>
                <ScrollView contentContainerStyle={styles.centeredContent}>
                    <Ionicons
                        name="person-circle-outline"
                        size={64}
                        color={colors.textMuted}
                    />
                    <Text style={styles.emptyTitle}>Not logged in</Text>
                    <Text style={styles.emptyText}>
                        Log in or create an account to save decks, track stats, and manage
                        your profile.
                    </Text>
                    <View style={styles.ctaButtons}>
                        <Pressable
                            style={[styles.button, styles.buttonPrimary]}
                            onPress={() => router.push("/login")}
                            accessibilityRole="button"
                        >
                            <Text style={styles.buttonPrimaryText}>Log In</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.button, styles.buttonSecondary]}
                            onPress={() => router.push("/register")}
                            accessibilityRole="button"
                        >
                            <Text style={styles.buttonSecondaryText}>Sign Up</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Authenticated ────────────────────────────────────────────────────
    const memberSince = new Date(user.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.screenTitle}>Account</Text>

                    {/* Account Info Card */}
                    <View style={styles.card}>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Account Tier</Text>
                            <View
                                style={[
                                    styles.tierBadge,
                                    user.account_tier === "premium" && styles.tierPremium,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.tierText,
                                        user.account_tier === "premium" &&
                                        styles.tierTextPremium,
                                    ]}
                                >
                                    {user.account_tier.toUpperCase()}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Member Since</Text>
                            <Text style={styles.infoValue}>{memberSince}</Text>
                        </View>

                        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                            <Text style={styles.infoLabel}>Saved Deck Limit</Text>
                            <Text style={styles.infoValue}>{user.max_saved_decks}</Text>
                        </View>
                    </View>

                    {/* Actions Card */}
                    <View style={styles.card}>
                        {/* Change Password */}
                        <Pressable
                            style={[styles.button, styles.buttonSecondary]}
                            onPress={() => setShowChangePassword(!showChangePassword)}
                        >
                            <Text style={styles.buttonSecondaryText}>
                                {showChangePassword ? "Cancel" : "Change Password"}
                            </Text>
                        </Pressable>

                        {showChangePassword && (
                            <View style={styles.formSection}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Current password"
                                    placeholderTextColor={colors.textMuted}
                                    secureTextEntry
                                    value={currentPw}
                                    onChangeText={setCurrentPw}
                                    accessibilityLabel="Current password"
                                />
                                <TextInput
                                    style={[styles.input, { marginTop: spacing.sm }]}
                                    placeholder="New password (10+ chars)"
                                    placeholderTextColor={colors.textMuted}
                                    secureTextEntry
                                    value={newPw}
                                    onChangeText={setNewPw}
                                    accessibilityLabel="New password"
                                />
                                <TextInput
                                    style={[styles.input, { marginTop: spacing.sm }]}
                                    placeholder="Confirm new password"
                                    placeholderTextColor={colors.textMuted}
                                    secureTextEntry
                                    value={confirmPw}
                                    onChangeText={setConfirmPw}
                                    accessibilityLabel="Confirm new password"
                                />
                                <Pressable
                                    style={[
                                        styles.button,
                                        styles.buttonPrimary,
                                        { marginTop: spacing.md },
                                        changingPw && styles.buttonDisabled,
                                    ]}
                                    onPress={handleChangePassword}
                                    disabled={changingPw || newPw.length < 10}
                                >
                                    {changingPw ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={styles.buttonPrimaryText}>
                                            Update Password
                                        </Text>
                                    )}
                                </Pressable>
                            </View>
                        )}

                        {/* Deferred: Change Email */}
                        <View style={[styles.disabledRow, { marginTop: spacing.md }]}>
                            <Text style={styles.disabledLabel}>Change Email</Text>
                            <Text style={styles.comingSoon}>Coming soon</Text>
                        </View>

                        {/* Deferred: Reset Password */}
                        <View style={styles.disabledRow}>
                            <Text style={styles.disabledLabel}>Reset Password</Text>
                            <Text style={styles.comingSoon}>Coming soon</Text>
                        </View>

                        {/* Logout */}
                        <Pressable
                            style={[
                                styles.button,
                                styles.buttonSecondary,
                                { marginTop: spacing.md },
                            ]}
                            onPress={handleLogout}
                        >
                            <Text style={styles.buttonSecondaryText}>Log Out</Text>
                        </Pressable>
                    </View>

                    {/* Danger Zone */}
                    <View style={[styles.card, styles.dangerCard]}>
                        <Text style={styles.dangerTitle}>Danger Zone</Text>
                        <Text style={styles.dangerText}>
                            Permanently delete your account, saved decks, and all stats.
                            This cannot be undone.
                        </Text>

                        {!showDeleteConfirm ? (
                            <Pressable
                                style={[styles.button, styles.buttonDanger]}
                                onPress={() => setShowDeleteConfirm(true)}
                            >
                                <Text style={styles.buttonDangerText}>Delete Account</Text>
                            </Pressable>
                        ) : (
                            <View style={styles.formSection}>
                                <Text style={styles.dangerText}>
                                    Enter your password to confirm deletion:
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Your password"
                                    placeholderTextColor={colors.textMuted}
                                    secureTextEntry
                                    value={deletePw}
                                    onChangeText={setDeletePw}
                                    accessibilityLabel="Password to confirm account deletion"
                                />
                                <View style={styles.dangerActionRow}>
                                    <Pressable
                                        style={[
                                            styles.button,
                                            styles.buttonSecondary,
                                            { flex: 1 },
                                        ]}
                                        onPress={() => {
                                            setShowDeleteConfirm(false);
                                            setDeletePw("");
                                        }}
                                    >
                                        <Text style={styles.buttonSecondaryText}>Cancel</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[
                                            styles.button,
                                            styles.buttonDanger,
                                            { flex: 1 },
                                            (deleting || deletePw.length < 1) &&
                                            styles.buttonDisabled,
                                        ]}
                                        onPress={handleDeleteAccount}
                                        disabled={deleting || deletePw.length < 1}
                                    >
                                        {deleting ? (
                                            <ActivityIndicator color="#fff" size="small" />
                                        ) : (
                                            <Text style={styles.buttonDangerText}>
                                                Confirm Delete
                                            </Text>
                                        )}
                                    </Pressable>
                                </View>
                            </View>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    centeredContent: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
        gap: spacing.md,
    },
    emptyTitle: {
        ...typography.h2,
        color: colors.text,
    },
    emptyText: {
        ...typography.body,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: spacing.sm,
    },
    ctaButtons: {
        flexDirection: "row",
        gap: spacing.sm,
        width: "100%",
    },
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
    infoRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    infoLabel: {
        ...typography.label,
        color: colors.textSecondary,
    },
    infoValue: {
        ...typography.body,
        color: colors.text,
    },
    tierBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radii.sm,
        backgroundColor: colors.border,
    },
    tierPremium: {
        backgroundColor: colors.primary,
    },
    tierText: {
        ...typography.caption,
        fontWeight: "700",
        color: colors.textSecondary,
    },
    tierTextPremium: {
        color: "#fff",
    },
    formSection: {
        marginTop: spacing.md,
    },
    input: {
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radii.md,
        paddingHorizontal: spacing.md,
        paddingVertical: 12,
        ...typography.body,
        color: colors.text,
        backgroundColor: colors.surface,
    },
    disabledRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 14,
        borderRadius: radii.md,
        borderWidth: 1.5,
        borderColor: colors.border,
        paddingHorizontal: spacing.md,
        opacity: 0.5,
        marginTop: spacing.sm,
    },
    disabledLabel: {
        ...typography.label,
        color: colors.textSecondary,
        fontSize: 16,
    },
    comingSoon: {
        ...typography.caption,
        color: colors.textMuted,
        fontStyle: "italic",
    },
    button: {
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
    buttonDanger: {
        backgroundColor: colors.error,
        marginTop: spacing.md,
    },
    buttonDangerText: {
        ...typography.label,
        color: "#fff",
        fontSize: 16,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    dangerCard: {
        borderWidth: 1.5,
        borderColor: colors.error + "40",
    },
    dangerTitle: {
        ...typography.h3,
        color: colors.error,
        marginBottom: spacing.xs,
    },
    dangerText: {
        ...typography.bodySmall,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    dangerActionRow: {
        flexDirection: "row",
        gap: spacing.sm,
        marginTop: spacing.sm,
    },
});
