/**
 * Persisted user preferences store.
 *
 * Saves the last-used filter selections (family, region, difficulty, card count)
 * to AsyncStorage so they're restored on next app launch.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Difficulty } from "../api/birdieApi";

type ColorScheme = "light" | "dark";

interface PreferencesState {
    cardCount: number;
    selectedFamily: string;
    selectedCountry: string;
    selectedState: string;
    selectedCounty: string;
    selectedDifficulty: Difficulty | null;
    colorScheme: ColorScheme;

    setCardCount: (count: number) => void;
    setSelectedFamily: (family: string) => void;
    setSelectedCountry: (country: string) => void;
    setSelectedState: (state: string) => void;
    setSelectedCounty: (county: string) => void;
    setSelectedDifficulty: (difficulty: Difficulty | null) => void;
    setColorScheme: (scheme: ColorScheme) => void;
    clearAll: () => void;
}

const DEFAULT_STATE = {
    cardCount: 25,
    selectedFamily: "",
    selectedCountry: "",
    selectedState: "",
    selectedCounty: "",
    selectedDifficulty: null as Difficulty | null,
    colorScheme: "light" as ColorScheme,
};

export const usePreferencesStore = create<PreferencesState>()(
    persist(
        (set) => ({
            ...DEFAULT_STATE,

            setCardCount: (cardCount) => set({ cardCount }),
            setSelectedFamily: (selectedFamily) => set({ selectedFamily }),
            setSelectedCountry: (selectedCountry) =>
                set({ selectedCountry, selectedState: "", selectedCounty: "" }),
            setSelectedState: (selectedState) =>
                set({ selectedState, selectedCounty: "" }),
            setSelectedCounty: (selectedCounty) => set({ selectedCounty }),
            setSelectedDifficulty: (selectedDifficulty) => set({ selectedDifficulty }),
            setColorScheme: (colorScheme) => set({ colorScheme }),
            clearAll: () => set(DEFAULT_STATE),
        }),
        {
            name: "birdie-preferences",
            storage: createJSONStorage(() => AsyncStorage),
            // Only persist filter values, not action functions
            partialize: (state) => ({
                cardCount: state.cardCount,
                selectedFamily: state.selectedFamily,
                selectedCountry: state.selectedCountry,
                selectedState: state.selectedState,
                selectedCounty: state.selectedCounty,
                selectedDifficulty: state.selectedDifficulty,
                colorScheme: state.colorScheme,
            }),
        },
    ),
);
