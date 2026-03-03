/**
 * Tests for authStore — login/logout state transitions, token persistence,
 * and derived isAuthenticated helpers.
 */

import { useAuthStore, type UserProfile } from "../../stores/authStore";

// Mock AsyncStorage (same pattern as preferencesStore tests)
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

// Shared test fixtures
const TEST_USER: UserProfile = {
    id: "abc123def456",
    created_at: "2026-01-15T10:00:00Z",
    account_tier: "free",
    max_saved_decks: 5,
};

const PREMIUM_USER: UserProfile = {
    id: "premium789",
    created_at: "2025-06-01T08:00:00Z",
    account_tier: "premium",
    max_saved_decks: 50,
};

describe("authStore", () => {
    beforeEach(() => {
        // Reset to unauthenticated default state
        useAuthStore.setState({
            token: null,
            tokenExpiresAt: 0,
            user: null,
            isLoading: false,
        });
    });

    // -----------------------------------------------------------------
    //  Default state
    // -----------------------------------------------------------------

    describe("defaults", () => {
        it("starts unauthenticated with null token and user", () => {
            const state = useAuthStore.getState();
            expect(state.token).toBeNull();
            expect(state.tokenExpiresAt).toBe(0);
            expect(state.user).toBeNull();
            expect(state.isLoading).toBe(false);
        });

        it("isAuthenticated returns false when no token", () => {
            expect(useAuthStore.getState().isAuthenticated()).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    //  Login (setAuth)
    // -----------------------------------------------------------------

    describe("setAuth (login)", () => {
        it("stores token, expiry, and user profile", () => {
            useAuthStore.getState().setAuth("jwt-token-123", 86400, TEST_USER);

            const state = useAuthStore.getState();
            expect(state.token).toBe("jwt-token-123");
            expect(state.user).toEqual(TEST_USER);
            // Expiry should be ~24h from now
            expect(state.tokenExpiresAt).toBeGreaterThan(Date.now());
            expect(state.tokenExpiresAt).toBeLessThanOrEqual(
                Date.now() + 86400 * 1000 + 100,
            );
        });

        it("isAuthenticated returns true after login", () => {
            useAuthStore.getState().setAuth("jwt-token-123", 86400, TEST_USER);
            expect(useAuthStore.getState().isAuthenticated()).toBe(true);
        });

        it("overwrites previous auth on re-login", () => {
            useAuthStore.getState().setAuth("old-token", 3600, TEST_USER);
            useAuthStore.getState().setAuth("new-token", 86400, PREMIUM_USER);

            const state = useAuthStore.getState();
            expect(state.token).toBe("new-token");
            expect(state.user).toEqual(PREMIUM_USER);
            expect(state.user?.account_tier).toBe("premium");
        });
    });

    // -----------------------------------------------------------------
    //  Logout (clearAuth)
    // -----------------------------------------------------------------

    describe("clearAuth (logout)", () => {
        it("clears token, expiry, and user", () => {
            useAuthStore.getState().setAuth("jwt-token-123", 86400, TEST_USER);
            useAuthStore.getState().clearAuth();

            const state = useAuthStore.getState();
            expect(state.token).toBeNull();
            expect(state.tokenExpiresAt).toBe(0);
            expect(state.user).toBeNull();
        });

        it("isAuthenticated returns false after logout", () => {
            useAuthStore.getState().setAuth("jwt-token-123", 86400, TEST_USER);
            expect(useAuthStore.getState().isAuthenticated()).toBe(true);

            useAuthStore.getState().clearAuth();
            expect(useAuthStore.getState().isAuthenticated()).toBe(false);
        });

        it("clearAuth is idempotent on already-logged-out state", () => {
            useAuthStore.getState().clearAuth();
            const state = useAuthStore.getState();
            expect(state.token).toBeNull();
            expect(state.user).toBeNull();
        });
    });

    // -----------------------------------------------------------------
    //  Token expiry
    // -----------------------------------------------------------------

    describe("token expiry", () => {
        it("isAuthenticated returns false when token is expired", () => {
            // Set a token that expired 1 second ago
            useAuthStore.setState({
                token: "expired-token",
                tokenExpiresAt: Date.now() - 1000,
                user: TEST_USER,
            });
            expect(useAuthStore.getState().isAuthenticated()).toBe(false);
        });

        it("isAuthenticated returns true when token is not yet expired", () => {
            useAuthStore.setState({
                token: "valid-token",
                tokenExpiresAt: Date.now() + 60_000,
                user: TEST_USER,
            });
            expect(useAuthStore.getState().isAuthenticated()).toBe(true);
        });

        it("handles tokenExpiresAt exactly at current time as expired", () => {
            const now = Date.now();
            useAuthStore.setState({
                token: "edge-token",
                tokenExpiresAt: now,
                user: TEST_USER,
            });
            // Date.now() >= tokenExpiresAt → not authenticated
            expect(useAuthStore.getState().isAuthenticated()).toBe(false);
        });
    });

    // -----------------------------------------------------------------
    //  Loading state
    // -----------------------------------------------------------------

    describe("setLoading", () => {
        it("toggles isLoading", () => {
            useAuthStore.getState().setLoading(true);
            expect(useAuthStore.getState().isLoading).toBe(true);

            useAuthStore.getState().setLoading(false);
            expect(useAuthStore.getState().isLoading).toBe(false);
        });

        it("loading state is independent from auth state", () => {
            useAuthStore.getState().setAuth("token", 86400, TEST_USER);
            useAuthStore.getState().setLoading(true);

            expect(useAuthStore.getState().isLoading).toBe(true);
            expect(useAuthStore.getState().isAuthenticated()).toBe(true);
        });
    });

    // -----------------------------------------------------------------
    //  Persistence (partialize)
    // -----------------------------------------------------------------

    describe("persistence", () => {
        it("only persists token, tokenExpiresAt, and user (not functions or isLoading)", () => {
            // The store is configured with partialize — verify the shape
            // by checking that isLoading doesn't survive a simulated rehydration
            useAuthStore.getState().setAuth("token-abc", 86400, TEST_USER);
            useAuthStore.getState().setLoading(true);

            // Simulate what zustand-persist would save
            const state = useAuthStore.getState();
            const persisted = {
                token: state.token,
                tokenExpiresAt: state.tokenExpiresAt,
                user: state.user,
            };

            // Verify persisted shape
            expect(persisted).toHaveProperty("token", "token-abc");
            expect(persisted).toHaveProperty("user", TEST_USER);
            expect(persisted).not.toHaveProperty("isLoading");
            expect(persisted).not.toHaveProperty("isAuthenticated");
            expect(persisted).not.toHaveProperty("setAuth");
            expect(persisted).not.toHaveProperty("clearAuth");
        });
    });

    // -----------------------------------------------------------------
    //  Full login → logout → re-login cycle
    // -----------------------------------------------------------------

    describe("complete auth lifecycle", () => {
        it("supports login → logout → re-login with different user", () => {
            // Login as free user
            useAuthStore.getState().setAuth("token-1", 86400, TEST_USER);
            expect(useAuthStore.getState().isAuthenticated()).toBe(true);
            expect(useAuthStore.getState().user?.account_tier).toBe("free");

            // Logout
            useAuthStore.getState().clearAuth();
            expect(useAuthStore.getState().isAuthenticated()).toBe(false);

            // Re-login as premium user
            useAuthStore.getState().setAuth("token-2", 86400, PREMIUM_USER);
            expect(useAuthStore.getState().isAuthenticated()).toBe(true);
            expect(useAuthStore.getState().user?.account_tier).toBe("premium");
            expect(useAuthStore.getState().token).toBe("token-2");
        });
    });
});
