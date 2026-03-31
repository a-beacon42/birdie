/**
 * FlashCard — Tap-to-flip card showing a bird image (front) and
 * identification info (back).
 *
 * Uses Animated spring for the flip. Image loaded via expo-image
 * with disk caching and a graceful error fallback.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, radii, typography, shadows } from "../theme";

interface DeckPosition {
  idx: number;
  deckSize: number;
}

interface FlashCardProps {
  imageUrl: string;
  /** Multiple image URLs for lookalike mode — a random one is picked on mount */
  imageUrls?: string[];
  commonName: string;
  latinName: string;
  speciesCode: string;
  cardWidth?: number;
  /** Shows "{idx}/{deckSize}" badge in the top-right corner */
  deckPosition?: DeckPosition;
  /** Called when the user taps "Ask AI about this bird" */
  onAskAI?: () => void;
  /** Called when the user taps the (i) info button */
  onInfoPress?: () => void;
}

const PLACEHOLDER = require("../../assets/splash-icon.png");

const FlashCard: React.FC<FlashCardProps> = ({
  imageUrl,
  imageUrls,
  commonName,
  latinName,
  cardWidth = 350,
  deckPosition,
  onAskAI,
  onInfoPress,
}) => {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Use the pre-assigned image URL — for lookalike mode the unique
  // photo is already picked at deck-creation time in new-game.tsx.
  const resolvedImageUrl = imageUrl;

  const frontRotation = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ["0deg", "180deg"],
  });
  const backRotation = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ["180deg", "360deg"],
  });

  const flipCard = useCallback(() => {
    const toValue = flipped ? 0 : 180;
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setFlipped((f) => !f);
  }, [flipped, flipAnim]);

  const handleAskAI = useCallback(() => {
    onAskAI?.();
  }, [onAskAI]);

  const handleInfo = useCallback(() => {
    onInfoPress?.();
  }, [onInfoPress]);

  const cardHeight = cardWidth * 1.15;
  const imageSource = resolvedImageUrl && !imageError ? resolvedImageUrl : PLACEHOLDER;

  return (
    <Pressable
      onPress={flipCard}
      style={[styles.container, { width: cardWidth, height: cardHeight }]}
      accessibilityRole="button"
      accessibilityLabel={flipped ? `${commonName}, ${latinName}` : "Bird identification card. Tap to reveal the answer."}
      accessibilityHint={flipped ? undefined : "Double tap to flip the card and see the bird name"}
    >
      {/* ---- Front: image only ---- */}
      <Animated.View
        pointerEvents={flipped ? "none" : "auto"}
        style={[
          styles.card,
          { width: cardWidth, height: cardHeight },
          { transform: [{ rotateY: frontRotation }] },
        ]}
      >
        <Image
          source={imageSource}
          style={styles.image}
          contentFit="cover"
          transition={200}
          placeholder={PLACEHOLDER}
          cachePolicy="disk"
          onError={() => setImageError(true)}
        />
        {deckPosition && (
          <View style={styles.positionBadge}>
            <Text style={styles.positionText}>
              {deckPosition.idx}/{deckPosition.deckSize}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* ---- Back: image + info ---- */}
      <Animated.View
        pointerEvents={flipped ? "auto" : "none"}
        style={[
          styles.card,
          { width: cardWidth, height: cardHeight },
          { transform: [{ rotateY: backRotation }] },
        ]}
      >
        <View style={styles.imageBackContainer}>
          <Image
            source={imageSource}
            style={styles.imageBack}
            contentFit="contain"
            transition={0}
            cachePolicy="disk"
          />
        </View>
        {deckPosition && (
          <View style={styles.positionBadge}>
            <Text style={styles.positionText}>
              {deckPosition.idx}/{deckPosition.deckSize}
            </Text>
          </View>
        )}
        <View style={styles.infoArea}>
          <Text style={styles.commonName}>{commonName}</Text>
          <Text style={styles.latinName}>{latinName}</Text>
          <View style={styles.buttonRow}>
            {onAskAI && (
              <Pressable
                onPress={handleAskAI}
                style={styles.chatButton}
                accessibilityRole="button"
                accessibilityLabel={`Ask AI about ${commonName}`}
              >
                <Text style={styles.chatButtonText}>Ask 🦉 AI</Text>
              </Pressable>
            )}
            {onInfoPress && (
              <Pressable
                onPress={handleInfo}
                style={styles.infoButton}
                accessibilityRole="button"
                accessibilityLabel={`View Wikipedia article for ${commonName}`}
              >
                <Text style={styles.infoButtonText}>ⓘ</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

export default FlashCard;

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
  },
  card: {
    position: "absolute",
    backfaceVisibility: "hidden",
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...shadows.lg,
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: radii.lg,
  },
  imageBack: {
    width: "100%",
    height: "100%",
  },
  imageBackContainer: {
    width: "100%",
    height: "55%",
    backgroundColor: colors.surfaceElevated,
  },
  infoArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  commonName: {
    ...typography.h2,
    color: colors.text,
    textAlign: "center",
  },
  latinName: {
    ...typography.body,
    fontStyle: "italic",
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  chatButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  chatButtonText: {
    ...typography.label,
    color: "#fff",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  infoButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  infoButtonText: {
    fontSize: 20,
    color: colors.primary,
    lineHeight: 24,
  },
  positionBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  positionText: {
    ...typography.caption,
    color: "#fff",
    fontSize: 13,
  },
  badge: {
    position: "absolute",
    bottom: spacing.md,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  badgeText: {
    ...typography.caption,
    color: "#fff",
  },
});