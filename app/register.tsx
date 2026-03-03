/**
 * Register screen — create a new Birdie account.
 *
 * Validates email + password client-side, shows complexity hints,
 * then calls the register API and stores the JWT.
 */

import React, { useState, useCallback } from "react";
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Pressable,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radii, typography, shadows } from "../src/theme";
import { useAuthStore } from "../src/stores/authStore";
import { registerUser } from "../src/api/birdieApi";
import { showAlert } from "../src/utils/alert";

export default function RegisterScreen() {
    const router = useRouter();
    const setAuth = useAuthStore((s) => s.setAuth);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Password complexity indicators
    const hasMinLength = password.length >= 10;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const passwordsMatch = password === confirmPassword && password.length > 0;
    const isValid =
        email.includes("@") &&
        email.includes(".") &&
        hasMinLength &&
        hasLetter &&
        hasDigit &&
        passwordsMatch;

    const handleRegister = useCallback(async () => {
        if (!isValid) return;
        setSubmitting(true);
        try {
            const resp = await registerUser(email.trim(), password);
            setAuth(resp.token, resp.expires_in, resp.user);
            router.replace("/");
        } catch (err: unknown) {
            const msg =
                (err as any)?.response?.data?.detail ??
                (err instanceof Error ? err.message : "Registration failed");
            showAlert("Registration Error", msg);
        } finally {
            setSubmitting(false);
        }
    }, [email, password, isValid, setAuth, router]);

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
                    {/* Back button */}
                    <Pressable onPress={() => router.back()} style={styles.backBtn}>
                        <Text style={styles.backBtnText}>‹ Back</Text>
                    </Pressable>

                    <View style={styles.card}>
                        <Text style={styles.title}>Create Account</Text>
                        <Text style={styles.subtitle}>
                            Save your decks and track your progress
                        </Text>

                        {/* Email */}
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="you@example.com"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                            autoCorrect={false}
                            value={email}
                            onChangeText={setEmail}
                            accessibilityLabel="Email address"
                        />

                        {/* Password */}
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="At least 10 characters"
                            placeholderTextColor={colors.textMuted}
                            secureTextEntry
                            autoComplete="new-password"
                            value={password}
                            onChangeText={setPassword}
                            accessibilityLabel="Password"
                        />

                        {/* Complexity hints */}
                        {password.length > 0 && (
                            <View style={styles.hints}>
                                <HintRow ok={hasMinLength} label="10+ characters" />
                                <HintRow ok={hasLetter} label="At least one letter" />
                                <HintRow ok={hasDigit} label="At least one number" />
                            </View>
                        )}

                        {/* Confirm password */}
                        <Text style={styles.label}>Confirm Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Re-enter password"
                            placeholderTextColor={colors.textMuted}
                            secureTextEntry
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            accessibilityLabel="Confirm password"
                        />
                        {confirmPassword.length > 0 && !passwordsMatch && (
                            <Text style={styles.errorHint}>Passwords do not match</Text>
                        )}

                        {/* Submit */}
                        <Pressable
                            style={[
                                styles.button,
                                styles.buttonPrimary,
                                (!isValid || submitting) && styles.buttonDisabled,
                            ]}
                            onPress={handleRegister}
                            disabled={!isValid || submitting}
                            accessibilityRole="button"
                            accessibilityLabel="Create account"
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.buttonPrimaryText}>Create Account</Text>
                            )}
                        </Pressable>

                        {/* Switch to login */}
                        <Pressable
                            onPress={() => router.replace("/login")}
                            style={styles.switchLink}
                        >
                            <Text style={styles.switchText}>
                                Already have an account?{" "}
                                <Text style={styles.switchHighlight}>Log in</Text>
                            </Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function HintRow({ ok, label }: { ok: boolean; label: string }) {
    return (
        <Text style={[styles.hintText, ok ? styles.hintOk : styles.hintBad]}>
            {ok ? "✓" : "✗"} {label}
        </Text>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
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
    card: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        ...shadows.md,
    },
    title: {
        ...typography.h1,
        color: colors.primary,
        textAlign: "center",
        marginBottom: spacing.xs,
    },
    subtitle: {
        ...typography.body,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: spacing.lg,
    },
    label: {
        ...typography.label,
        color: colors.text,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
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
    hints: {
        marginTop: spacing.xs,
        gap: 2,
    },
    hintText: {
        ...typography.caption,
    },
    hintOk: { color: colors.success },
    hintBad: { color: colors.textMuted },
    errorHint: {
        ...typography.caption,
        color: colors.error,
        marginTop: spacing.xs,
    },
    button: {
        paddingVertical: 14,
        borderRadius: radii.md,
        alignItems: "center",
        marginTop: spacing.xl,
    },
    buttonPrimary: {
        backgroundColor: colors.primary,
    },
    buttonPrimaryText: {
        ...typography.label,
        color: "#fff",
        fontSize: 16,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    switchLink: {
        marginTop: spacing.lg,
        alignItems: "center",
    },
    switchText: {
        ...typography.bodySmall,
        color: colors.textSecondary,
    },
    switchHighlight: {
        color: colors.primary,
        fontWeight: "600",
    },
});
