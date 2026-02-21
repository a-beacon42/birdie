/**
 * FlashCard — Tap-to-flip card showing a bird image (front) and
 * identification info (back).
 *
 * Uses Animated spring for the flip. Image loaded via expo-image
 * with disk caching and a graceful error fallback.
 */

import React, { useCallback, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, radii, typography, shadows } from "../theme";

interface FlashCardProps {
  imageUrl: string;
  commonName: string;
  latinName: string;
  speciesCode: string;
  cardWidth?: number;
  /** Called when the user taps "Ask AI about this bird" */
  onAskAI?: () => void;
}

const PLACEHOLDER = require("../../assets/splash-icon.png");

const FlashCard: React.FC<FlashCardProps> = ({
  imageUrl,
  commonName,
  latinName,
  cardWidth = 350,
  onAskAI,
}) => {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);
  const [imageError, setImageError] = useState(false);

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

  const cardHeight = cardWidth * 1.15;
  const imageSource = imageUrl && !imageError ? imageUrl : PLACEHOLDER;

  return (
    <Pressable onPress={flipCard} style={[styles.container, { width: cardWidth, height: cardHeight }]}>
      {/* ---- Front: image only ---- */}
      <Animated.View
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
      </Animated.View>

      {/* ---- Back: image + info ---- */}
      <Animated.View
        style={[
          styles.card,
          { width: cardWidth, height: cardHeight },
          { transform: [{ rotateY: backRotation }] },
        ]}
      >
        <Image
          source={imageSource}
          style={styles.imageBack}
          contentFit="cover"
          transition={0}
          cachePolicy="disk"
        />
        <View style={styles.infoArea}>
          <Text style={styles.commonName}>{commonName}</Text>
          <Text style={styles.latinName}>{latinName}</Text>
          {onAskAI && (
            <Pressable onPress={handleAskAI} style={styles.chatButton}>
              <Text style={styles.chatButtonText}>Ask AI about this bird</Text>
            </Pressable>
          )}
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
    height: "55%",
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
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  chatButtonText: {
    ...typography.label,
    color: "#fff",
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