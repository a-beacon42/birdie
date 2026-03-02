/**
 * Login screen — authenticate with email + password.
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
import { loginUser } from "../src/api/birdieApi";
import { showAlert } from "../src/utils/alert";

export default function LoginScreen() {
    const router = useRouter();
    const setAuth = useAuthStore((s) => s.setAuth);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const isValid = email.includes("@") && password.length >= 1;

    const handleLogin = useCallback(async () => {
        if (!isValid) return;
        setSubmitting(true);
        try {
            const resp = await loginUser(email.trim(), password);
            setAuth(resp.token, resp.expires_in, resp.user);
            router.replace("/");
        } catch (err: unknown) {
            const msg =
                (err as any)?.response?.data?.detail ??
                (err instanceof Error ? err.message : "Login failed");
            showAlert("Login Error", msg);
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
                        <Text style={styles.title}>Log In</Text>
                        <Text style={styles.subtitle}>
                            Welcome back to Birdie
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
                            placeholder="Your password"
                            placeholderTextColor={colors.textMuted}
                            secureTextEntry
                            autoComplete="current-password"
                            value={password}
                            onChangeText={setPassword}
                            onSubmitEditing={handleLogin}
                            accessibilityLabel="Password"
                        />

                        {/* Submit */}
                        <Pressable
                            style={[
                                styles.button,
                                styles.buttonPrimary,
                                (!isValid || submitting) && styles.buttonDisabled,
                            ]}
                            onPress={handleLogin}
                            disabled={!isValid || submitting}
                            accessibilityRole="button"
                            accessibilityLabel="Log in"
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.buttonPrimaryText}>Log In</Text>
                            )}
                        </Pressable>

                        {/* Switch to register */}
                        <Pressable
                            onPress={() => router.replace("/register")}
                            style={styles.switchLink}
                        >
                            <Text style={styles.switchText}>
                                Don&apos;t have an account?{" "}
                                <Text style={styles.switchHighlight}>Sign up</Text>
                            </Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
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
