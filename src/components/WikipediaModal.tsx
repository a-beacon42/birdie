/**
 * WikipediaModal — Shows a bird's Wikipedia page in an in-app WebView.
 *
 * Uses SafeAreaView with explicit edges and generous tap targets to ensure
 * the Done button is always visible and tappable on all devices.
 *
 * On web, falls back to an <iframe> since react-native-webview has no web support.
 */

import React from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radii, typography } from "../theme";

// react-native-webview has no web support — only import on native
const WebView = Platform.OS !== "web"
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ? require("react-native-webview").WebView
    : null;

/** Only allow URLs from Wikipedia domains. */
const isAllowedWikipediaUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return (
            parsed.protocol === "https:" &&
            (parsed.hostname.endsWith(".wikipedia.org") ||
                parsed.hostname === "wikipedia.org")
        );
    } catch {
        return false;
    }
};

interface WikipediaModalProps {
    visible: boolean;
    onClose: () => void;
    url: string;
    title?: string;
}

const WikipediaModal: React.FC<WikipediaModalProps> = ({
    visible,
    onClose,
    url,
    title,
}) => {
    const insets = useSafeAreaInsets();

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal={true}>
                {/* Header — explicit padding ensures it clears the notch */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
                        {title || "Wikipedia"}
                    </Text>
                    <Pressable
                        onPress={onClose}
                        style={styles.closeButton}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        accessibilityRole="button"
                        accessibilityLabel="Close Wikipedia viewer"
                    >
                        <Text style={styles.closeText}>Done</Text>
                    </Pressable>
                </View>

                {/* Content — iframe on web, WebView on native */}
                {url && isAllowedWikipediaUrl(url) ? (
                    Platform.OS === "web" ? (
                        <iframe
                            src={url}
                            title={title || "Wikipedia"}
                            style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
                        />
                    ) : WebView ? (
                        <WebView
                            source={{ uri: url }}
                            style={styles.webview}
                            startInLoadingState
                            renderLoading={() => (
                                <View style={styles.loading}>
                                    <ActivityIndicator size="large" color={colors.primary} />
                                </View>
                            )}
                        />
                    ) : null
                ) : (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No Wikipedia page available.</Text>
                    </View>
                )}
            </View>
        </Modal>
    );
};

export default WikipediaModal;

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
        minHeight: 48,
    },
    headerTitle: {
        ...typography.h3,
        color: colors.text,
        flex: 1,
    },
    closeButton: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        marginLeft: spacing.sm,
    },
    closeText: {
        ...typography.label,
        color: colors.primary,
        fontSize: 16,
    },
    webview: {
        flex: 1,
    },
    loading: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.background,
    },
    emptyContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    emptyText: {
        ...typography.body,
        color: colors.textSecondary,
    },
});
