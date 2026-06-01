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
  Image,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, spacing, radii, typography } from "../src/theme";
import { useGameStore } from "../src/stores/gameStore";
import { useAuthStore } from "../src/stores/authStore";
import { submitSession, type SessionCreatePayload } from "../src/api/birdieApi";
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
    cardIds,
    currentIndex,
    goToIndex,
    resetGame,
    answers,
    recordAnswer,
    markUnansweredAsSkipped,
    clearAnswers,
    filters,
    imageUrlsMap,
  } = useGameStore();

  const [showResults, setShowResults] = useState(false);
  const [chatBirdName, setChatBirdName] = useState<string | null>(null);
  const [wikiUrl, setWikiUrl] = useState<string | null>(null);
  const [wikiTitle, setWikiTitle] = useState<string>("");
  const [sessionSubmitted, setSessionSubmitted] = useState(false);

  // Auth state
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionStartedAt = useGameStore((s) => s.sessionStartedAt);

  // ---- Derived ----
  const deckSize = birds.length;
  const answeredCardIds = useMemo(
    () => new Set(answers.map((a) => a.cardId)),
    [answers],
  );
  const allAnswered = deckSize > 0 && answeredCardIds.size >= deckSize;
  const currentBird = birds[currentIndex] ?? null;
  const currentCardId = cardIds[currentIndex] ?? null;
  const remaining = deckSize - answeredCardIds.size;

  // Memoize score counts to avoid re-filtering on every render
  const { correctCount, incorrectCount, skippedCount } = useMemo(() => {
    let correct = 0, incorrect = 0, skipped = 0;
    for (const a of answers) {
      if (a.result === "correct") correct++;
      else if (a.result === "incorrect") incorrect++;
      else skipped++;
    }
    return { correctCount: correct, incorrectCount: incorrect, skippedCount: skipped };
  }, [answers]);

  // Position of current bird within the unanswered subset
  const unansweredPosition = useMemo(() => {
    if (!currentCardId || answeredCardIds.has(currentCardId)) return 0;
    let pos = 0;
    for (let i = 0; i < cardIds.length; i++) {
      if (answeredCardIds.has(cardIds[i])) continue;
      pos++;
      if (cardIds[i] === currentCardId) return pos;
    }
    return 0;
  }, [cardIds, currentCardId, answeredCardIds]);

  // ---- Helpers: find next/prev unanswered bird ----
  const findUnanswered = useCallback(
    (from: number, dir: 1 | -1): number => {
      for (let i = 1; i <= deckSize; i++) {
        const idx = (from + i * dir + deckSize) % deckSize;
        if (!answeredCardIds.has(cardIds[idx])) return idx;
      }
      return -1;
    },
    [cardIds, deckSize, answeredCardIds],
  );

  // ---- Per-card timer (resets when displayed bird changes) ----
  const cardStartTime = useRef(Date.now());

  useEffect(() => {
    cardStartTime.current = Date.now();
  }, [currentIndex]);

  // ---- Prefetch next unanswered card image ----
  useEffect(() => {
    const next = findUnanswered(currentIndex, 1);
    if (next !== -1 && birds[next]?.image_url) {
      Image.prefetch(birds[next].image_url).catch(() => { });
    }
  }, [currentIndex, birds, findUnanswered]);

  // ---- Answer handlers ----
  const handleCorrect = useCallback(() => {
    if (!currentBird || !currentCardId) return;
    recordAnswer(currentCardId, currentBird.species_code, "correct", Date.now() - cardStartTime.current);
  }, [currentBird, currentCardId, recordAnswer]);

  const handleIncorrect = useCallback(() => {
    if (!currentBird || !currentCardId) return;
    recordAnswer(currentCardId, currentBird.species_code, "incorrect", Date.now() - cardStartTime.current);
  }, [currentBird, currentCardId, recordAnswer]);

  const handleSkip = useCallback(() => {
    if (!currentBird || !currentCardId) return;
    recordAnswer(currentCardId, currentBird.species_code, "skipped", Date.now() - cardStartTime.current);
  }, [currentBird, currentCardId, recordAnswer]);

  const handleShowResults = useCallback(() => {
    markUnansweredAsSkipped();
    setShowResults(true);

    // Auto-submit session for authenticated users
    if (isAuthenticated() && !sessionSubmitted) {
      setSessionSubmitted(true);
      const now = new Date().toISOString();
      const startedIso = sessionStartedAt
        ? new Date(sessionStartedAt).toISOString()
        : now;

      const quizMode: SessionCreatePayload["quiz_mode"] = "flashcard";

      const currentAnswers = useGameStore.getState().answers;
      const payload: SessionCreatePayload = {
        quiz_mode: quizMode,
        started_at: startedIso,
        completed_at: now,
        region_code: filters.regionLabel ?? null,
        difficulty: (filters.difficultyLabel?.toLowerCase() as SessionCreatePayload["difficulty"]) ?? null,
        answers: currentAnswers.map((a) => ({
          species_code: a.speciesCode,
          result: a.result,
          time_ms: a.timeMs,
        })),
      };

      // Fire-and-forget — don't block UI on session submission
      submitSession(payload).catch((err) => {
        console.warn("Session save failed:", err);
      });
    }
  }, [markUnansweredAsSkipped, isAuthenticated, sessionSubmitted, sessionStartedAt, filters]);

  // ---- Auto-advance past answered cards ----
  useEffect(() => {
    if (currentCardId && answeredCardIds.has(currentCardId)) {
      if (allAnswered) {
        // Use handleShowResults so the session is submitted (not just setShowResults)
        if (!showResults) handleShowResults();
      } else {
        const next = findUnanswered(currentIndex, 1);
        if (next !== -1) goToIndex(next);
      }
    }
  }, [currentCardId, answeredCardIds, allAnswered, showResults, currentIndex, findUnanswered, goToIndex, handleShowResults]);

  const handleResetGame = useCallback(() => {
    clearAnswers();
    setShowResults(false);
    setSessionSubmitted(false);
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

  // ---- Non-gesture navigation (accessibility alternative to swipe) ----
  const handlePrevCard = useCallback(() => {
    const prev = findUnanswered(currentIndex, -1);
    if (prev !== -1) goToIndex(prev);
  }, [currentIndex, findUnanswered, goToIndex]);

  const handleNextCard = useCallback(() => {
    const next = findUnanswered(currentIndex, 1);
    if (next !== -1) goToIndex(next);
  }, [currentIndex, findUnanswered, goToIndex]);

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
          <Pressable
            style={styles.backButton}
            onPress={handleEndGame}
            accessibilityRole="button"
            accessibilityLabel="Go back to home screen"
          >
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
          correct={correctCount}
          incorrect={incorrectCount}
          skipped={skippedCount}
          familyLabel={filters.familyLabel}
          regionLabel={filters.regionLabel}
          difficultyLabel={filters.difficultyLabel}
        />

        {/* Card + answer row grouped together */}
        {currentBird && (
          <GestureDetector gesture={swipeGesture}>
            <View style={styles.cardSection}>
              {/* Card with swipe */}
              <View style={styles.cardArea}>
                <FlashCard
                  key={`${currentBird.species_code}-${currentIndex}`}
                  imageUrl={currentBird.image_url}
                  imageUrls={imageUrlsMap[currentBird.species_code]}
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
                  accessibilityRole="button"
                  accessibilityLabel="Incorrect — I didn't know this bird"
                >
                  <Text style={styles.emoji}>❌</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.skipButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={handleSkip}
                  accessibilityRole="button"
                  accessibilityLabel="Skip this bird"
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
                  accessibilityRole="button"
                  accessibilityLabel="Correct — I knew this bird"
                >
                  <Text style={styles.emoji}>✅</Text>
                </Pressable>
              </View>

              {/* Card navigation (non-gesture alternative) */}
              {remaining > 1 && (
                <View style={styles.navRow}>
                  <Pressable
                    onPress={handlePrevCard}
                    style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Previous card"
                  >
                    <Text style={styles.navButtonText}>‹ Prev</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleNextCard}
                    style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Next card"
                  >
                    <Text style={styles.navButtonText}>Next ›</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.endGameRow}>
                <Pressable
                  style={styles.endButton}
                  onPress={handleShowResults}
                  accessibilityRole="button"
                  accessibilityLabel="End game and see results"
                >
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
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  navButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  navButtonText: {
    ...typography.label,
    color: colors.primary,
    fontSize: 15,
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
