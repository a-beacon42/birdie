/**
 * ErrorBoundary — Catches unhandled JS errors and shows a recovery UI.
 *
 * Prevents the entire app from crashing on unexpected errors.
 * Users can tap "Try Again" to reset the error state.
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, spacing, radii, typography } from "../theme";
import { Sentry } from "../utils/sentry";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
        console.error("ErrorBoundary caught:", error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <Text style={styles.emoji}>🐦</Text>
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.message}>
                        An unexpected error occurred. Please try again.
                    </Text>
                    {__DEV__ && this.state.error && (
                        <Text style={styles.debug}>
                            {this.state.error.message}
                        </Text>
                    )}
                    <Pressable
                        style={({ pressed }) => [
                            styles.button,
                            pressed && styles.buttonPressed,
                        ]}
                        onPress={this.handleReset}
                        accessibilityRole="button"
                        accessibilityLabel="Try again"
                    >
                        <Text style={styles.buttonText}>Try Again</Text>
                    </Pressable>
                </View>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: spacing.xl,
        backgroundColor: colors.background,
    },
    emoji: {
        fontSize: 48,
        marginBottom: spacing.md,
    },
    title: {
        ...typography.h2,
        color: colors.text,
        marginBottom: spacing.sm,
        textAlign: "center",
    },
    message: {
        ...typography.body,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: spacing.lg,
    },
    debug: {
        ...typography.label,
        color: colors.incorrect,
        textAlign: "center",
        marginBottom: spacing.lg,
        fontSize: 12,
    },
    button: {
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderRadius: radii.md,
    },
    buttonPressed: {
        opacity: 0.8,
    },
    buttonText: {
        ...typography.label,
        color: "#fff",
        fontSize: 16,
    },
});
