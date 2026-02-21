/**
 * BirdChatModal — AI-powered bird identification chat.
 *
 * Opens a full-screen modal with a conversation about a specific bird.
 * Auto-fires an initial identification question, shows a loading indicator
 * while waiting for the API, and displays errors gracefully.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatMessage, sendChatMessage } from "../api/birdieApi";
import { colors, spacing, radii, typography } from "../theme";

interface BirdChatModalProps {
  visible: boolean;
  onClose: () => void;
  commonName: string;
}

const BirdChatModal: React.FC<BirdChatModalProps> = ({ visible, onClose, commonName }) => {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  // ---- Reset & auto-send first question when modal opens ----
  useEffect(() => {
    if (!visible || !commonName) return;

    const firstUserMsg: ChatMessage = {
      role: "user",
      content: `What are the key field identifiers for ${commonName}?`,
    };

    setMessages([firstUserMsg]);
    setInput("");
    setError(null);
    setLoading(true);

    let cancelled = false;

    sendChatMessage(commonName, [firstUserMsg])
      .then((reply) => {
        if (!cancelled) {
          setMessages([firstUserMsg, reply]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "Failed to reach AI assistant");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, commonName]);

  // ---- Send follow-up question ----
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const convo = [...messages, userMsg];
    setMessages(convo);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const reply = await sendChatMessage(commonName, convo);
      setMessages((prev) => [...prev, reply]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send message");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  // ---- Render ----
  const visibleMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <View style={item.role === "user" ? styles.userMsg : styles.assistantMsg}>
      <Text style={item.role === "user" ? styles.userText : styles.assistantText}>
        {item.content}
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {commonName}
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </View>

          {/* AI disclaimer */}
          <View style={styles.disclaimerRow}>
            <Text style={styles.disclaimer}>AI-generated content may be incorrect.</Text>
          </View>

          {/* Messages */}
          <FlatList
            ref={listRef}
            data={visibleMessages}
            keyExtractor={(_, idx) => String(idx)}
            renderItem={renderItem}
            contentContainerStyle={styles.messagesContainer}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          />

          {/* Loading / Error */}
          {loading && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>Thinking…</Text>
            </View>
          )}
          {error && (
            <View style={styles.statusRow}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Input */}
          <View style={styles.inputContainer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              style={styles.input}
              placeholder="Ask a follow-up…"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={!loading}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit
            />
            <Pressable
              onPress={handleSend}
              disabled={!input.trim() || loading}
              style={({ pressed }) => [
                styles.sendButton,
                (!input.trim() || loading) && styles.sendDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

export default BirdChatModal;

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  disclaimerRow: {
    alignItems: "center",
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceElevated,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textMuted,
  },
  messagesContainer: {
    flexGrow: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  userMsg: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary + "18",
    borderRadius: radii.md,
    borderBottomRightRadius: radii.sm,
    padding: spacing.sm,
    maxWidth: "80%",
  },
  assistantMsg: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderBottomLeftRadius: radii.sm,
    padding: spacing.sm,
    maxWidth: "85%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  userText: {
    ...typography.body,
    color: colors.text,
  },
  assistantText: {
    ...typography.body,
    color: colors.text,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  statusText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
  },
  inputContainer: {
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
  sendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  sendText: {
    ...typography.label,
    color: "#fff",
  },
});
