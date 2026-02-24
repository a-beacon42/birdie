/**
 * OfflineBanner — displays a prominent warning when the device is offline.
 *
 * Rendered at the top of the screen as a fixed banner.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme";

const OfflineBanner: React.FC = () => (
    <View style={styles.banner} accessibilityRole="alert">
        <Text style={styles.text}>You are offline. Some features may be unavailable.</Text>
    </View>
);

export default OfflineBanner;

const styles = StyleSheet.create({
    banner: {
        backgroundColor: colors.incorrect,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        alignItems: "center",
    },
    text: {
        color: "#fff",
        ...typography.body,
        fontWeight: "600" as const,
        textAlign: "center" as const,
    },
});
