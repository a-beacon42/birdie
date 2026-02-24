/**
 * BirdChatModal — AI-powered bird identification chat.
 *
 * Uses a plain ScrollView for reliable scroll-to-bottom behaviour.
 * Auto-fires an initial question (hidden), renders AI Markdown via
 * react-native-remark, and enforces 20 msg/hr client-side rate limit.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    ListRenderItemInfo,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { showAlert } from "../utils/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MarkdownText from "./MarkdownText";
import { ChatMessage, sendChatMessage } from "../api/birdieApi";
import { colors, spacing, radii, typography } from "../theme";

/* ------------------------------------------------------------------ */
/*  Rate limiting — 20 messages per rolling hour                       */
/* ------------------------------------------------------------------ */
const MAX_PER_HOUR = 20;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 4000;
let stamps: number[] = [];
const prune = () => {
    stamps = stamps.filter((t) => Date.now() - t < WINDOW_MS);
};
const limited = () => {
    prune();
    return stamps.length >= MAX_PER_HOUR;
};
const record = () => stamps.push(Date.now());

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */
interface Props {
    visible: boolean;
    onClose: () => void;
    commonName: string;
}

const makePrompt = (name: string) =>
    `What are the key field identifiers for ${name}?`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
const BirdChatModal: React.FC<Props> = ({ visible, onClose, commonName }) => {
    const insets = useSafeAreaInsets();
    const listRef = useRef<FlatList<ChatMessage>>(null);
    const closeBtnRef = useRef<View>(null);

    /* Move accessibility focus to the close button when the modal opens */
    useEffect(() => {
        if (visible) {
            const id = setTimeout(() => closeBtnRef.current?.focus(), 150);
            return () => clearTimeout(id);
        }
    }, [visible]);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* ---- scroll to bottom when messages change ---- */
    const msgCount = messages.length;
    useEffect(() => {
        if (msgCount === 0) return;
        const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
        return () => clearTimeout(id);
    }, [msgCount]);

    /* ---- FlatList renderItem ---- */
    const renderMessage = useCallback(({ item: m }: ListRenderItemInfo<ChatMessage>) => (
        <View style={m.role === "user" ? styles.userBubble : styles.aiBubble}>
            {m.role === "assistant" && (
                <Text style={styles.aiLabel}>Birdie AI</Text>
            )}
            {m.role === "user" ? (
                <Text style={styles.userText}>{m.content}</Text>
            ) : (
                <MarkdownText>{m.content}</MarkdownText>
            )}
        </View>
    ), []);

    const keyExtractor = useCallback((_: ChatMessage, index: number) => String(index), []);

    /* ---- auto-send first question on open ---- */
    useEffect(() => {
        if (!visible || !commonName) return;

        const first: ChatMessage = { role: "user", content: makePrompt(commonName) };
        setMessages([first]);
        setInput("");
        setError(null);
        setLoading(true);
        record();

        let cancelled = false;
        sendChatMessage(commonName, [first])
            .then((reply) => !cancelled && setMessages([first, reply]))
            .catch((e) => !cancelled && setError(e?.message ?? "Could not reach AI"))
            .finally(() => !cancelled && setLoading(false));

        return () => { cancelled = true; };
    }, [visible, commonName]);

    /* ---- send follow-up ---- */
    const send = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;
        if (text.length > MAX_MESSAGE_LENGTH) {
            showAlert("Too long", `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
            return;
        }
        if (limited()) {
            showAlert("Slow down!", `Limit of ${MAX_PER_HOUR} messages per hour reached.`);
            return;
        }

        const userMsg: ChatMessage = { role: "user", content: text };
        const convo = [...messages, userMsg];
        setMessages(convo);
        setInput("");
        setError(null);
        setLoading(true);
        record();

        try {
            const reply = await sendChatMessage(commonName, convo);
            setMessages((prev) => [...prev, reply]);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to send message";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [commonName, input, loading, messages]);

    /* ---- display messages (hide the auto-fired first prompt) ---- */
    const prompt = makePrompt(commonName);
    const visible_msgs = messages.filter(
        (m, i) => !(i === 0 && m.role === "user" && m.content === prompt),
    );

    /* ---- JSX ---- */
    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal={true}>
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                    keyboardVerticalOffset={0}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{commonName}</Text>
                        <Pressable ref={closeBtnRef} onPress={onClose} style={styles.doneBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close chat">
                            <Text style={styles.doneText}>Done</Text>
                        </Pressable>
                    </View>

                    {/* Disclaimer */}
                    <View style={styles.disclaimerRow}>
                        <Text style={styles.disclaimer}>AI-generated · may be incorrect</Text>
                    </View>

                    {/* Messages */}
                    <FlatList<ChatMessage>
                        ref={listRef}
                        data={visible_msgs}
                        renderItem={renderMessage}
                        keyExtractor={keyExtractor}
                        style={styles.flex}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        ListFooterComponent={
                            <>
                                {loading && (
                                    <View style={styles.loadingRow}>
                                        <ActivityIndicator size="small" color={colors.primary} />
                                        <Text style={styles.loadingText}>Thinking…</Text>
                                    </View>
                                )}
                                {!!error && !loading && (
                                    <View style={styles.loadingRow}>
                                        <Text style={styles.errorText}>{error}</Text>
                                    </View>
                                )}
                            </>
                        }
                    />

                    {/* Input */}
                    <View style={styles.inputBar}>
                        <TextInput
                            value={input}
                            onChangeText={setInput}
                            style={styles.input}
                            placeholder="Ask a follow-up…"
                            placeholderTextColor={colors.textMuted}
                            multiline
                            editable={!loading}
                            returnKeyType="send"
                            onSubmitEditing={send}
                            blurOnSubmit
                        />
                        <Pressable
                            onPress={send}
                            disabled={!input.trim() || loading}
                            style={({ pressed }) => [
                                styles.sendBtn,
                                (!input.trim() || loading) && styles.sendDisabled,
                                pressed && styles.sendPressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="Send message"
                        >
                            <Text style={styles.sendLabel}>Send</Text>
                        </Pressable>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

export default BirdChatModal;

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
    flex: { flex: 1 },
    root: { flex: 1, backgroundColor: colors.background },

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
    title: { ...typography.h3, color: colors.text, flex: 1 },
    doneBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, marginLeft: spacing.sm },
    doneText: { ...typography.label, color: colors.primary, fontSize: 16 },

    disclaimerRow: {
        alignItems: "center",
        paddingVertical: spacing.xs,
        backgroundColor: colors.surfaceElevated,
    },
    disclaimer: { ...typography.caption, color: colors.textMuted },

    scrollContent: {
        padding: spacing.md,
        gap: spacing.sm,
    },

    userBubble: {
        alignSelf: "flex-end",
        backgroundColor: colors.primary + "18",
        borderRadius: radii.md,
        borderBottomRightRadius: radii.sm,
        padding: spacing.sm,
        maxWidth: "80%",
    },
    aiBubble: {
        alignSelf: "flex-start",
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        borderBottomLeftRadius: radii.sm,
        padding: spacing.md,
        maxWidth: "88%",
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.xs,
    },
    userText: { ...typography.body, color: colors.text },
    markdownWrap: {
        flexShrink: 1,
        flexGrow: 0,
    },
    aiLabel: {
        ...typography.caption,
        color: colors.primary,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.6,
    },

    loadingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        paddingVertical: spacing.sm,
    },
    loadingText: { ...typography.bodySmall, color: colors.textSecondary },
    errorText: { ...typography.bodySmall, color: colors.error },

    inputBar: {
        flexDirection: "row",
        alignItems: "flex-end",
        borderTopWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.surface,
        gap: spacing.sm,
    },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        maxHeight: 100,
        ...typography.body,
        color: colors.text,
    },
    sendBtn: {
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
    },
    sendDisabled: { opacity: 0.4 },
    sendPressed: { opacity: 0.7 },
    sendLabel: { ...typography.label, color: "#fff" },
});
