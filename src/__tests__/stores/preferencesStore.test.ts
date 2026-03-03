/**
 * Tests for preferencesStore — persisted user filter preferences.
 */

import { usePreferencesStore } from "../../stores/preferencesStore";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => {
    const store: Record<string, string> = {};
    return {
        __esModule: true,
        default: {
            getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
            setItem: jest.fn((key: string, value: string) => {
                store[key] = value;
                return Promise.resolve();
            }),
            removeItem: jest.fn((key: string) => {
                delete store[key];
                return Promise.resolve();
            }),
            multiGet: jest.fn((keys: string[]) =>
                Promise.resolve(keys.map((k) => [k, store[k] ?? null])),
            ),
            multiSet: jest.fn((pairs: [string, string][]) => {
                pairs.forEach(([k, v]) => { store[k] = v; });
                return Promise.resolve();
            }),
        },
    };
});

describe("preferencesStore", () => {
    beforeEach(() => {
        // Reset to defaults
        usePreferencesStore.setState({
            cardCount: 25,
            selectedFamily: "",
            selectedCountry: "",
            selectedState: "",
            selectedCounty: "",
            selectedDifficulty: null,
            colorScheme: "light",
        });
    });

    it("has correct defaults", () => {
        const state = usePreferencesStore.getState();
        expect(state.cardCount).toBe(25);
        expect(state.selectedFamily).toBe("");
        expect(state.selectedCountry).toBe("");
        expect(state.selectedDifficulty).toBeNull();
    });

    it("setCardCount updates count", () => {
        usePreferencesStore.getState().setCardCount(50);
        expect(usePreferencesStore.getState().cardCount).toBe(50);
    });

    it("setSelectedCountry clears state and county", () => {
        usePreferencesStore.setState({ selectedState: "US-NY", selectedCounty: "US-NY-061" });
        usePreferencesStore.getState().setSelectedCountry("CA");

        const state = usePreferencesStore.getState();
        expect(state.selectedCountry).toBe("CA");
        expect(state.selectedState).toBe("");
        expect(state.selectedCounty).toBe("");
    });

    it("setSelectedState clears county", () => {
        usePreferencesStore.setState({ selectedCounty: "US-NY-061" });
        usePreferencesStore.getState().setSelectedState("US-CA");

        const state = usePreferencesStore.getState();
        expect(state.selectedState).toBe("US-CA");
        expect(state.selectedCounty).toBe("");
    });

    it("clearAll resets to defaults", () => {
        usePreferencesStore.setState({
            cardCount: 50,
            selectedFamily: "Accipitridae",
            selectedCountry: "US",
            selectedState: "US-NY",
            selectedCounty: "US-NY-061",
            selectedDifficulty: "hard",
        });

        usePreferencesStore.getState().clearAll();

        const state = usePreferencesStore.getState();
        expect(state.cardCount).toBe(25);
        expect(state.selectedFamily).toBe("");
        expect(state.selectedCountry).toBe("");
        expect(state.selectedDifficulty).toBeNull();
    });
});
