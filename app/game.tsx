/**
 * Game screen — the flashcard quiz experience.
 *
 * Reads birds from the Zustand store, displays them one at a time,
 * tracks per-card timing, and shows results at the end.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radii, typography } from "../src/theme";
import { useGameStore } from "../src/stores/gameStore";
import FlashCard from "../src/components/FlashCard";
import ScoreBar from "../src/components/ScoreBar";
import ResultsModal from "../src/components/ResultsModal";
import BirdChatModal from "../src/components/BirdChatModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = Math.min(SCREEN_WIDTH - spacing.lg * 2, 400);

export default function GameScreen() {
  const router = useRouter();
  const { birds, currentIndex, nextBird, prevBird, resetGame, answers, recordAnswer } =
    useGameStore();

  const [showResults, setShowResults] = useState(false);
  const [chatBirdName, setChatBirdName] = useState<string | null>(null);

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

  const handleSkip = useCallback(() => {
    if (!hasAnswered && currentBird) {
      recordAnswer(currentBird.species_code, "skipped", 0);
    }
    advance();
  }, [hasAnswered, currentBird, recordAnswer, advance]);

  const handleEndGame = useCallback(() => {
    setShowResults(false);
    resetGame();
    router.replace("/");
  }, [resetGame, router]);

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
        />

        {/* Card */}
        <View style={styles.cardArea}>
          <FlashCard
            key={currentBird.species_code}
            imageUrl={currentBird.image_url}
            commonName={currentBird.com_name}
            latinName={currentBird.sci_name}
            speciesCode={currentBird.species_code}
            cardWidth={CARD_WIDTH}
            onAskAI={() => setChatBirdName(currentBird.com_name)}
          />
        </View>

        {/* Self-assessment buttons */}
        <View style={styles.answerRow}>
          <Pressable
            style={({ pressed }) => [styles.answerButton, styles.incorrectBtn, pressed && styles.pressed]}
            onPress={handleIncorrect}
          >
            <Text style={styles.answerBtnText}>Didn't Know</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.answerButton, styles.skipBtn, pressed && styles.pressed]}
            onPress={handleSkip}
          >
            <Text style={[styles.answerBtnText, { color: colors.textSecondary }]}>Skip</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.answerButton, styles.correctBtn, pressed && styles.pressed]}
            onPress={handleCorrect}
          >
            <Text style={styles.answerBtnText}>Knew It</Text>
          </Pressable>
        </View>

        {/* Navigation */}
        <View style={styles.navRow}>
          <Pressable
            style={styles.navButton}
            onPress={prevBird}
            disabled={currentIndex === 0}
          >
            <Text style={[styles.navText, currentIndex === 0 && styles.navTextDisabled]}>
              ← Prev
            </Text>
          </Pressable>

          <Pressable style={styles.endButton} onPress={handleEndGame}>
            <Text style={styles.endButtonText}>End Game</Text>
          </Pressable>

          <Pressable style={styles.navButton} onPress={handleSkip}>
            <Text style={styles.navText}>{isLastCard ? "Finish →" : "Next →"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Modals */}
      <ResultsModal visible={showResults} onClose={() => setShowResults(false)} onEndGame={handleEndGame} />
      <BirdChatModal
        visible={!!chatBirdName}
        onClose={() => setChatBirdName(null)}
        commonName={chatBirdName ?? ""}
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
  cardArea: {
    flex: 1,
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
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  answerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: "center",
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
  skipBtn: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  answerBtnText: {
    ...typography.label,
    fontSize: 13,
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.lg,
  },
  navButton: {
    padding: spacing.sm,
  },
  navText: {
    ...typography.label,
    color: colors.primary,
  },
  navTextDisabled: {
    color: colors.textMuted,
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
