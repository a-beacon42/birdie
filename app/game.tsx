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
    goToIndex,
    resetGame,
    answers,
    recordAnswer,
    markUnansweredAsSkipped,
    clearAnswers,
    filters,
  } = useGameStore();

  const [showResults, setShowResults] = useState(false);
  const [chatBirdName, setChatBirdName] = useState<string | null>(null);
  const [wikiUrl, setWikiUrl] = useState<string | null>(null);
  const [wikiTitle, setWikiTitle] = useState<string>("");

  // ---- Derived ----
  const deckSize = birds.length;
  const answeredCodes = useMemo(
    () => new Set(answers.map((a) => a.speciesCode)),
    [answers],
  );
  const allAnswered = deckSize > 0 && answeredCodes.size >= deckSize;
  const currentBird = birds[currentIndex] ?? null;
  const remaining = deckSize - answeredCodes.size;

  // Position of current bird within the unanswered subset
  const unansweredPosition = useMemo(() => {
    if (!currentBird || answeredCodes.has(currentBird.species_code)) return 0;
    let pos = 0;
    for (const b of birds) {
      if (answeredCodes.has(b.species_code)) continue;
      pos++;
      if (b.species_code === currentBird.species_code) return pos;
    }
    return 0;
  }, [birds, currentBird, answeredCodes]);

  // ---- Helpers: find next/prev unanswered bird ----
  const findUnanswered = useCallback(
    (from: number, dir: 1 | -1): number => {
      for (let i = 1; i <= deckSize; i++) {
        const idx = (from + i * dir + deckSize) % deckSize;
        if (!answeredCodes.has(birds[idx].species_code)) return idx;
      }
      return -1;
    },
    [birds, deckSize, answeredCodes],
  );

  // ---- Auto-advance past answered cards ----
  useEffect(() => {
    if (currentBird && answeredCodes.has(currentBird.species_code)) {
      if (allAnswered) {
        if (!showResults) setShowResults(true);
      } else {
        const next = findUnanswered(currentIndex, 1);
        if (next !== -1) goToIndex(next);
      }
    }
  }, [currentBird, answeredCodes, allAnswered, showResults, currentIndex, findUnanswered, goToIndex]);

  // ---- Per-card timer (resets when displayed bird changes) ----
  const cardStartTime = useRef(Date.now());

  useEffect(() => {
    cardStartTime.current = Date.now();
  }, [currentIndex]);

  // ---- Answer handlers ----
  const handleCorrect = useCallback(() => {
    if (!currentBird) return;
    recordAnswer(currentBird.species_code, "correct", Date.now() - cardStartTime.current);
  }, [currentBird, recordAnswer]);

  const handleIncorrect = useCallback(() => {
    if (!currentBird) return;
    recordAnswer(currentBird.species_code, "incorrect", Date.now() - cardStartTime.current);
  }, [currentBird, recordAnswer]);

  const handleSkip = useCallback(() => {
    if (!currentBird) return;
    recordAnswer(currentBird.species_code, "skipped", Date.now() - cardStartTime.current);
  }, [currentBird, recordAnswer]);

  const handleShowResults = useCallback(() => {
    markUnansweredAsSkipped();
    setShowResults(true);
  }, [markUnansweredAsSkipped]);

  const handleResetGame = useCallback(() => {
    clearAnswers();
    setShowResults(false);
  }, [clearAnswers]);

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

  // ---- Swipe gesture (navigate between unanswered cards) ----
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((event) => {
      if (event.translationX < -SWIPE_THRESHOLD) {
        const next = findUnanswered(currentIndex, 1);
        if (next !== -1) goToIndex(next);
      } else if (event.translationX > SWIPE_THRESHOLD) {
        const prev = findUnanswered(currentIndex, -1);
        if (prev !== -1) goToIndex(prev);
      }
    });

  // ---- Empty state (only if deck is truly empty) ----
  if (deckSize === 0) {
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
          current={answers.length}
          total={deckSize}
          correct={answers.filter((a) => a.result === "correct").length}
          incorrect={answers.filter((a) => a.result === "incorrect").length}
          skipped={answers.filter((a) => a.result === "skipped").length}
          familyLabel={filters.familyLabel}
          regionLabel={filters.regionLabel}
        />

        {/* Card + answer row grouped together */}
        {currentBird && (
          <GestureDetector gesture={swipeGesture}>
            <View style={styles.cardSection}>
              {/* Card with swipe */}
              <View style={styles.cardArea}>
                <FlashCard
                  key={currentBird.species_code}
                  imageUrl={currentBird.image_url}
                  commonName={currentBird.com_name}
                  latinName={currentBird.sci_name}
                  speciesCode={currentBird.species_code}
                  cardWidth={cardWidth}
                  deckPosition={{ idx: unansweredPosition, deckSize: remaining }}
                  onAskAI={() => setChatBirdName(currentBird.com_name)}
                  onInfoPress={
                    currentBird.wikipedia_url ? handleInfoPress : undefined
                  }
                />
              </View>

              {/* Answer buttons */}
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

                <Pressable
                  style={({ pressed }) => [
                    styles.skipButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={handleSkip}
                >
                  <Text style={styles.skipButtonText}>skip</Text>
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

              <View style={styles.endGameRow}>
                <Pressable style={styles.endButton} onPress={handleShowResults}>
                  <Text style={styles.endButtonText}>End Game</Text>
                </Pressable>
              </View>
            </View>
          </GestureDetector>
        )}
      </View>

      {/* Modals */}
      <ResultsModal
        visible={showResults}
        onClose={() => setShowResults(false)}
        onEndGame={handleEndGame}
        onResetGame={handleResetGame}
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
    justifyContent: "flex-start",
    paddingTop: spacing.xxl,
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
  skipButton: {
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: colors.textMuted + "15",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.full,
  },
  skipButtonText: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 18,
    color: colors.textMuted,
  },
  endGameRow: {
    alignItems: "center",
    marginTop: spacing.sm,
    paddingBottom: spacing.sm,
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
