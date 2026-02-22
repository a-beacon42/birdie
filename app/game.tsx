/**
 * Game screen — the flashcard quiz experience.
 *
 * Reads birds from the Zustand store, displays them one at a time,
 * tracks per-card timing, and shows results at the end.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, spacing, radii, typography } from "../src/theme";
import { useGameStore } from "../src/stores/gameStore";
import FlashCard from "../src/components/FlashCard";
import ScoreBar from "../src/components/ScoreBar";
import ResultsModal from "../src/components/ResultsModal";
import BirdChatModal from "../src/components/BirdChatModal";
import WikipediaModal from "../src/components/WikipediaModal";

const SWIPE_THRESHOLD = 50;

export default function GameScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = useMemo(
    () => Math.min(screenWidth - spacing.lg * 2, 400),
    [screenWidth],
  );
  const {
    birds,
    currentIndex,
    nextBird,
    prevBird,
    resetGame,
    answers,
    recordAnswer,
    filters,
  } = useGameStore();

  const [showResults, setShowResults] = useState(false);
  const [chatBirdName, setChatBirdName] = useState<string | null>(null);
  const [wikiUrl, setWikiUrl] = useState<string | null>(null);
  const [wikiTitle, setWikiTitle] = useState<string>("");

  // ---- Per-card timer (resets every time currentIndex changes) ----
  const cardStartTime = useRef(Date.now());

  useEffect(() => {
    cardStartTime.current = Date.now();
  }, [currentIndex]);

  // ---- Derived ----
  const currentBird = birds[currentIndex] ?? null;
  const deckSize = birds.length;
  const isLastCard = currentIndex === deckSize - 1;
  const hasAnswered = currentBird
    ? answers.some((a) => a.speciesCode === currentBird.species_code)
    : false;

  // ---- Answer handlers ----
  const advance = useCallback(() => {
    if (isLastCard) {
      setShowResults(true);
    } else {
      nextBird();
    }
  }, [isLastCard, nextBird]);

  const handleCorrect = useCallback(() => {
    if (!currentBird || hasAnswered) return;
    recordAnswer(currentBird.species_code, "correct", Date.now() - cardStartTime.current);
    advance();
  }, [currentBird, hasAnswered, recordAnswer, advance]);

  const handleIncorrect = useCallback(() => {
    if (!currentBird || hasAnswered) return;
    recordAnswer(currentBird.species_code, "incorrect", Date.now() - cardStartTime.current);
    advance();
  }, [currentBird, hasAnswered, recordAnswer, advance]);

  const handleEndGame = useCallback(() => {
    setShowResults(false);
    resetGame();
    router.replace("/");
  }, [resetGame, router]);

  const handleInfoPress = useCallback(() => {
    if (!currentBird) return;
    const url = currentBird.wikipedia_url;
    if (url) {
      setWikiTitle(currentBird.com_name);
      setWikiUrl(url);
    }
  }, [currentBird]);

  // ---- Swipe gesture ----
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((event) => {
      if (event.translationX < -SWIPE_THRESHOLD) {
        // Swipe left → advance
        if (isLastCard) {
          setShowResults(true);
        } else {
          if (!hasAnswered && currentBird) {
            recordAnswer(currentBird.species_code, "skipped", 0);
          }
          nextBird();
        }
      } else if (event.translationX > SWIPE_THRESHOLD) {
        // Swipe right → go back
        if (currentIndex > 0) {
          prevBird();
        }
      }
    });

  // ---- Empty state ----
  if (!currentBird) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No birds to display.</Text>
          <Pressable style={styles.backButton} onPress={handleEndGame}>
            <Text style={styles.backButtonText}>Back to Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        {/* Progress */}
        <ScoreBar
          current={currentIndex + 1}
          total={deckSize}
          correct={answers.filter((a) => a.result === "correct").length}
          incorrect={answers.filter((a) => a.result === "incorrect").length}
          familyLabel={filters.familyLabel}
          regionLabel={filters.regionLabel}
        />

        {/* Card + answer row grouped together */}
        <View style={styles.cardSection}>
          {/* Card with swipe */}
          <GestureDetector gesture={swipeGesture}>
            <View style={styles.cardArea}>
              <FlashCard
                key={currentBird.species_code}
                imageUrl={currentBird.image_url}
                commonName={currentBird.com_name}
                latinName={currentBird.sci_name}
                speciesCode={currentBird.species_code}
                cardWidth={cardWidth}
                onAskAI={() => setChatBirdName(currentBird.com_name)}
                onInfoPress={
                  currentBird.wikipedia_url ? handleInfoPress : undefined
                }
              />
            </View>
          </GestureDetector>

          {/* Emoji answer buttons — snug under the card */}
          <View style={styles.answerRow}>
            <Pressable
              style={({ pressed }) => [
                styles.emojiButton,
                styles.incorrectBtn,
                pressed && styles.pressed,
              ]}
              onPress={handleIncorrect}
            >
              <Text style={styles.emoji}>❌</Text>
            </Pressable>

            <Pressable style={styles.endButton} onPress={handleEndGame}>
              <Text style={styles.endButtonText}>End Game</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.emojiButton,
                styles.correctBtn,
                pressed && styles.pressed,
              ]}
              onPress={handleCorrect}
            >
              <Text style={styles.emoji}>✅</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Modals */}
      <ResultsModal
        visible={showResults}
        onClose={() => setShowResults(false)}
        onEndGame={handleEndGame}
      />
      <BirdChatModal
        visible={!!chatBirdName}
        onClose={() => setChatBirdName(null)}
        commonName={chatBirdName ?? ""}
      />
      <WikipediaModal
        visible={!!wikiUrl}
        onClose={() => setWikiUrl(null)}
        url={wikiUrl ?? ""}
        title={wikiTitle}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  cardSection: {
    flex: 1,
    justifyContent: "center",
  },
  cardArea: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
  },
  backButtonText: {
    ...typography.label,
    color: "#fff",
  },
  answerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  emojiButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  correctBtn: {
    backgroundColor: colors.correct + "20",
    borderWidth: 1.5,
    borderColor: colors.correct,
  },
  incorrectBtn: {
    backgroundColor: colors.incorrect + "20",
    borderWidth: 1.5,
    borderColor: colors.incorrect,
  },
  pressed: {
    opacity: 0.7,
  },
  emoji: {
    fontSize: 28,
  },
  endButton: {
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  endButtonText: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
