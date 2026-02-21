/**
 * Zustand store — game state management.
 *
 * Replaces prop drilling of gameBirds/isPlaying with a global store.
 * Also tracks score, quiz mode, and session progress.
 */

import { create } from "zustand";
import type { Bird, BirdSummary } from "../types/bird";

export type QuizMode = "flashcard" | "multiple-choice" | "audio";
export type AnswerResult = "correct" | "incorrect" | "skipped";

export interface SessionAnswer {
    speciesCode: string;
    result: AnswerResult;
    timeMs: number;
}

export interface GameFilters {
    familyLabel?: string;
    regionLabel?: string;
}


interface GameState {
    // --- Game Setup ---
    birds: BirdSummary[];
    currentIndex: number;
    quizMode: QuizMode;
    isPlaying: boolean;
    filters: GameFilters;

    // --- Score Tracking ---
    answers: SessionAnswer[];
    sessionStartedAt: number | null;

    // --- Actions ---
    startGame: (birds: BirdSummary[], mode?: QuizMode, filters?: GameFilters) => void;
    endGame: () => void;
    resetGame: () => void;
    nextBird: () => void;
    prevBird: () => void;
    goToIndex: (index: number) => void;
    recordAnswer: (speciesCode: string, result: AnswerResult, timeMs: number) => void;
    setQuizMode: (mode: QuizMode) => void;

    // --- Derived ---
    currentBird: () => BirdSummary | null;
    score: () => { correct: number; incorrect: number; skipped: number; total: number };
}

export const useGameStore = create<GameState>((set, get) => ({
    birds: [],
    currentIndex: 0,
    quizMode: "flashcard",
    isPlaying: false,
    filters: {},
    answers: [],
    sessionStartedAt: null,

    startGame: (birds, mode = "flashcard", filters = {}) =>
        set({
            birds,
            currentIndex: 0,
            quizMode: mode,
            isPlaying: true,
            filters,
            answers: [],
            sessionStartedAt: Date.now(),
        }),

    endGame: () =>
        set({
            isPlaying: false,
        }),

    resetGame: () =>
        set({
            isPlaying: false,
            birds: [],
            currentIndex: 0,
            filters: {},
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

    recordAnswer: (speciesCode, result, timeMs) =>
        set((state) => ({
            answers: [...state.answers, { speciesCode, result, timeMs }],
        })),

    setQuizMode: (mode) => set({ quizMode: mode }),

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
