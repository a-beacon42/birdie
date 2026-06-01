/**
 * Zustand store — game state management.
 *
 * Replaces prop drilling of gameBirds/isPlaying with a global store.
 * Also tracks score, quiz mode, and session progress.
 */

import { create } from "zustand";
import type { BirdSummary } from "../types/bird";

export type QuizMode = "flashcard";
export type AnswerResult = "correct" | "incorrect" | "skipped";

export interface SessionAnswer {
    cardId: string;
    speciesCode: string;
    result: AnswerResult;
    timeMs: number;
}

export interface GameFilters {
    familyLabel?: string;
    regionLabel?: string;
    difficultyLabel?: string;
}


interface GameState {
    // --- Game Setup ---
    birds: BirdSummary[];
    cardIds: string[];
    currentIndex: number;
    quizMode: QuizMode;
    isPlaying: boolean;
    filters: GameFilters;
    isLookalike: boolean;
    imageUrlsMap: Record<string, string[]>;

    // --- Score Tracking ---
    answers: SessionAnswer[];
    sessionStartedAt: number | null;

    // --- Actions ---
    startGame: (birds: BirdSummary[], mode?: QuizMode, filters?: GameFilters) => void;
    startLookalikeGame: (birds: BirdSummary[], imageUrlsMap: Record<string, string[]>, filters?: GameFilters) => void;
    endGame: () => void;
    resetGame: () => void;
    nextBird: () => void;
    prevBird: () => void;
    goToIndex: (index: number) => void;
    recordAnswer: (cardId: string, speciesCode: string, result: AnswerResult, timeMs: number) => void;
    markUnansweredAsSkipped: () => void;
    clearAnswers: () => void;

    // --- Derived ---
    currentBird: () => BirdSummary | null;
    score: () => { correct: number; incorrect: number; skipped: number; total: number };
}

export const useGameStore = create<GameState>((set, get) => ({
    birds: [],
    cardIds: [],
    currentIndex: 0,
    quizMode: "flashcard",
    isPlaying: false,
    filters: {},
    isLookalike: false,
    imageUrlsMap: {},
    answers: [],
    sessionStartedAt: null,

    startGame: (birds, mode = "flashcard", filters = {}) =>
        set({
            birds,
            cardIds: birds.map((b) => b.species_code),
            currentIndex: 0,
            quizMode: mode,
            isPlaying: true,
            filters,
            isLookalike: false,
            imageUrlsMap: {},
            answers: [],
            sessionStartedAt: Date.now(),
        }),

    startLookalikeGame: (birds, imageUrlsMap, filters = {}) => {
        // Assign unique cardIds — species may appear multiple times
        const counts: Record<string, number> = {};
        const cardIds = birds.map((b) => {
            const n = counts[b.species_code] ?? 0;
            counts[b.species_code] = n + 1;
            return `${b.species_code}:${n}`;
        });
        set({
            birds,
            cardIds,
            currentIndex: 0,
            quizMode: "flashcard",
            isPlaying: true,
            filters,
            isLookalike: true,
            imageUrlsMap,
            answers: [],
            sessionStartedAt: Date.now(),
        });
    },

    endGame: () =>
        set({
            isPlaying: false,
        }),

    resetGame: () =>
        set({
            isPlaying: false,
            birds: [],
            cardIds: [],
            currentIndex: 0,
            filters: {},
            isLookalike: false,
            imageUrlsMap: {},
            answers: [],
            sessionStartedAt: null,
        }),

    nextBird: () =>
        set((state) => ({
            currentIndex: (state.currentIndex + 1) % state.birds.length,
        })),

    prevBird: () =>
        set((state) => ({
            currentIndex:
                (state.currentIndex + state.birds.length - 1) % state.birds.length,
        })),

    goToIndex: (index) => set({ currentIndex: index }),

    clearAnswers: () =>
        set({
            answers: [],
            currentIndex: 0,
        }),

    recordAnswer: (cardId, speciesCode, result, timeMs) =>
        set((state) => {
            const idx = state.answers.findIndex((a) => a.cardId === cardId);
            if (idx >= 0) {
                const updated = [...state.answers];
                updated[idx] = { cardId, speciesCode, result, timeMs };
                return { answers: updated };
            }
            return { answers: [...state.answers, { cardId, speciesCode, result, timeMs }] };
        }),

    markUnansweredAsSkipped: () =>
        set((state) => {
            const answered = new Set(state.answers.map((a) => a.cardId));
            const skipped = state.cardIds
                .map((id, i) => ({ cardId: id, bird: state.birds[i] }))
                .filter(({ cardId }) => !answered.has(cardId))
                .map(({ cardId, bird }) => ({
                    cardId,
                    speciesCode: bird.species_code,
                    result: "skipped" as AnswerResult,
                    timeMs: 0,
                }));
            return { answers: [...state.answers, ...skipped] };
        }),

    currentBird: () => {
        const { birds, currentIndex } = get();
        return birds[currentIndex] ?? null;
    },

    score: () => {
        const { answers } = get();
        return {
            correct: answers.filter((a) => a.result === "correct").length,
            incorrect: answers.filter((a) => a.result === "incorrect").length,
            skipped: answers.filter((a) => a.result === "skipped").length,
            total: answers.length,
        };
    },
}));
