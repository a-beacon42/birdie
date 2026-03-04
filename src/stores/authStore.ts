/**
 * Auth store — user authentication state with AsyncStorage persistence.
 *
 * Manages user JWT tokens, login/register/logout flows, and account
 * operations. Persists auth state across app restarts.
 *
 * Token strategy:
 *   - Authenticated users get a 24hr user JWT (stored here).
 *   - Anonymous users fall back to the short-lived anonymous token
 *     managed by birdieApi.ts.
 *   - The API client reads the user token from this store when available.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// --- Types ---

export interface UserProfile {
    id: string;
    created_at: string;
    account_tier: "free" | "premium";
    max_saved_decks: number;
}

interface AuthState {
    // --- Persisted data ---
    token: string | null;
    tokenExpiresAt: number; // epoch ms
    user: UserProfile | null;

    // --- Transient state ---
    isLoading: boolean;

    // --- Derived ---
    isAuthenticated: () => boolean;

    // --- Actions ---
    setAuth: (token: string, expiresIn: number, user: UserProfile) => void;
    clearAuth: () => void;
    setLoading: (loading: boolean) => void;
}

const DEFAULT_AUTH = {
    token: null,
    tokenExpiresAt: 0,
    user: null,
    isLoading: false,
};

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            ...DEFAULT_AUTH,

            isAuthenticated: () => {
                const { token, tokenExpiresAt } = get();
                return !!token && Date.now() < tokenExpiresAt;
            },

            setAuth: (token, expiresIn, user) =>
                set({
                    token,
                    tokenExpiresAt: Date.now() + expiresIn * 1000,
                    user,
                }),

            clearAuth: () =>
                set({
                    token: null,
                    tokenExpiresAt: 0,
                    user: null,
                }),

            setLoading: (isLoading) => set({ isLoading }),
        }),
        {
            name: "birdie-auth",
            storage: createJSONStorage(() => AsyncStorage),
            // Only persist auth data, not functions or transient state
            partialize: (state) => ({
                token: state.token,
                tokenExpiresAt: state.tokenExpiresAt,
                user: state.user,
            }),
            // Auto-fix corrupted persisted state (e.g. user present but token missing)
            onRehydrateStorage: () => (state) => {
                if (state && state.user && !state.token) {
                    console.warn("[authStore] Clearing corrupted persisted state (user without token)");
                    state.clearAuth();
                }
            },
        },
    ),
);
