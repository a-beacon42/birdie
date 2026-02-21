/**
 * WikipediaModal — Shows a bird's Wikipedia page in an in-app WebView.
 *
 * Uses SafeAreaView with explicit edges and generous tap targets to ensure
 * the Done button is always visible and tappable on all devices.
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
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { colors, spacing, radii, typography } from "../theme";

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
    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
                {/* Header — explicit padding ensures it clears the notch */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {title || "Wikipedia"}
                    </Text>
                    <Pressable
                        onPress={onClose}
                        style={styles.closeButton}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <Text style={styles.closeText}>Done</Text>
                    </Pressable>
                </View>

                {/* WebView */}
                {url ? (
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
                ) : (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No Wikipedia page available.</Text>
                    </View>
                )}
            </SafeAreaView>
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
        paddingTop: Platform.OS === "ios" ? spacing.sm : spacing.md,
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
