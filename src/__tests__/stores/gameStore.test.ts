/**
 * Tests for gameStore — Zustand game state management.
 */

import { useGameStore } from "../../stores/gameStore";
import type { BirdSummary } from "../../types/bird";

// Helper to create mock birds
function makeBird(code: string, family = "Accipitridae"): BirdSummary {
    return {
        id: code,
        species_code: code,
        sci_name: `Sciname ${code}`,
        com_name: `Bird ${code}`,
        family_code: family,
        family_com_name: "Hawks",
        image_url: `https://example.com/${code}.jpg`,
        global_frequency: 0.5,
        lookalike_count: 0,
    };
}

const birds = [makeBird("norcar"), makeBird("baleag"), makeBird("rethaw")];

describe("gameStore", () => {
    beforeEach(() => {
        // Reset store to initial state before each test
        useGameStore.setState({
            birds: [],
            currentIndex: 0,
            quizMode: "flashcard",
            isPlaying: false,
            filters: {},
            answers: [],
            sessionStartedAt: null,
        });
    });

    describe("startGame", () => {
        it("sets birds, mode, and isPlaying", () => {
            useGameStore.getState().startGame(birds, "flashcard", { familyLabel: "Hawks" });
            const state = useGameStore.getState();
            expect(state.birds).toHaveLength(3);
            expect(state.isPlaying).toBe(true);
            expect(state.quizMode).toBe("flashcard");
            expect(state.filters.familyLabel).toBe("Hawks");
            expect(state.currentIndex).toBe(0);
            expect(state.answers).toHaveLength(0);
            expect(state.sessionStartedAt).toBeGreaterThan(0);
        });
    });

    describe("navigation", () => {
        beforeEach(() => {
            useGameStore.getState().startGame(birds);
        });

        it("nextBird wraps around", () => {
            const { nextBird } = useGameStore.getState();
            nextBird();
            expect(useGameStore.getState().currentIndex).toBe(1);
            nextBird();
            expect(useGameStore.getState().currentIndex).toBe(2);
            nextBird();
            expect(useGameStore.getState().currentIndex).toBe(0); // wrap
        });

        it("prevBird wraps around", () => {
            const { prevBird } = useGameStore.getState();
            prevBird(); // from 0 → 2
            expect(useGameStore.getState().currentIndex).toBe(2);
        });

        it("goToIndex sets the index", () => {
            useGameStore.getState().goToIndex(2);
            expect(useGameStore.getState().currentIndex).toBe(2);
        });
    });

    describe("currentBird", () => {
        it("returns null when no birds loaded", () => {
            expect(useGameStore.getState().currentBird()).toBeNull();
        });

        it("returns the bird at currentIndex", () => {
            useGameStore.getState().startGame(birds);
            expect(useGameStore.getState().currentBird()?.species_code).toBe("norcar");
            useGameStore.getState().goToIndex(1);
            expect(useGameStore.getState().currentBird()?.species_code).toBe("baleag");
        });
    });

    describe("recordAnswer", () => {
        beforeEach(() => {
            useGameStore.getState().startGame(birds);
        });

        it("adds a new answer", () => {
            useGameStore.getState().recordAnswer("norcar", "norcar", "correct", 1500);
            const answers = useGameStore.getState().answers;
            expect(answers).toHaveLength(1);
            expect(answers[0]).toEqual({ cardId: "norcar", speciesCode: "norcar", result: "correct", timeMs: 1500 });
        });

        it("updates an existing answer for same card", () => {
            useGameStore.getState().recordAnswer("norcar", "norcar", "correct", 1500);
            useGameStore.getState().recordAnswer("norcar", "norcar", "incorrect", 2000);
            const answers = useGameStore.getState().answers;
            expect(answers).toHaveLength(1);
            expect(answers[0].result).toBe("incorrect");
        });
    });

    describe("markUnansweredAsSkipped", () => {
        it("marks remaining birds as skipped", () => {
            useGameStore.getState().startGame(birds);
            useGameStore.getState().recordAnswer("norcar", "norcar", "correct", 1000);
            useGameStore.getState().markUnansweredAsSkipped();
            const answers = useGameStore.getState().answers;
            expect(answers).toHaveLength(3);
            expect(answers.filter((a) => a.result === "skipped")).toHaveLength(2);
        });
    });

    describe("score", () => {
        it("tallies correct, incorrect, skipped", () => {
            useGameStore.getState().startGame(birds);
            useGameStore.getState().recordAnswer("norcar", "norcar", "correct", 1000);
            useGameStore.getState().recordAnswer("baleag", "baleag", "incorrect", 2000);
            useGameStore.getState().recordAnswer("rethaw", "rethaw", "skipped", 0);
            const score = useGameStore.getState().score();
            expect(score).toEqual({ correct: 1, incorrect: 1, skipped: 1, total: 3 });
        });
    });

    describe("resetGame", () => {
        it("clears all state", () => {
            useGameStore.getState().startGame(birds);
            useGameStore.getState().recordAnswer("norcar", "norcar", "correct", 1000);
            useGameStore.getState().resetGame();
            const state = useGameStore.getState();
            expect(state.isPlaying).toBe(false);
            expect(state.birds).toHaveLength(0);
            expect(state.answers).toHaveLength(0);
            expect(state.sessionStartedAt).toBeNull();
        });
    });

    describe("clearAnswers", () => {
        it("resets answers and index but keeps birds", () => {
            useGameStore.getState().startGame(birds);
            useGameStore.getState().goToIndex(2);
            useGameStore.getState().recordAnswer("norcar", "norcar", "correct", 1000);
            useGameStore.getState().clearAnswers();
            const state = useGameStore.getState();
            expect(state.answers).toHaveLength(0);
            expect(state.currentIndex).toBe(0);
            expect(state.birds).toHaveLength(3);
        });
    });
});
