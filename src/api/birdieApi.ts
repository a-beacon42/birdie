/**
 * API client for the Birdie backend.
 *
 * Authentication priority:
 *   1. User JWT (from authStore) — preferred when the user is logged in.
 *   2. Anonymous token (fetched from /auth/token) — fallback for guests.
 *
 * The server's API_KEY never leaves the server.
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { Platform } from "react-native";
import { BACKEND_URL } from "@env";
import type { Bird, BirdSummary, BirdFamily, Region, LookalikeBirdSummary } from "../types/bird";
import { useAuthStore, type UserProfile } from "../stores/authStore";

export type { Bird, BirdSummary, BirdFamily, Region, LookalikeBirdSummary };

// On web, default to same-origin (empty string) so API calls are relative.
// On native, default to localhost for development.
const defaultBaseURL =
  Platform.OS === "web" ? "" : "http://localhost:8000";

export const birdieApi: AxiosInstance = axios.create({
  baseURL: BACKEND_URL || defaultBaseURL,
  timeout: 15_000, // 15 second timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// --- Anonymous token management ---
let _token: string | null = null;
let _tokenExpiresAt = 0; // epoch ms

/**
 * Fetch or refresh an anonymous API token from the backend.
 * Tokens are short-lived (~1 hour) and signed server-side.
 */
async function ensureToken(): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
  if (_token && Date.now() < _tokenExpiresAt - 60_000) {
    return _token;
  }
  try {
    const resp = await axios.post(
      `${BACKEND_URL || defaultBaseURL}/api/v1/auth/token`,
      null,
      { timeout: 10_000 },
    );
    const { token, expires_in } = resp.data;
    _token = token || null;
    _tokenExpiresAt = Date.now() + (expires_in ?? 3600) * 1000;
    return _token;
  } catch {
    // If token fetch fails, proceed without auth — the backend will
    // reject protected endpoints but unprotected ones still work.
    return null;
  }
}

// Attach Bearer token to every request.
// Prefer the user JWT from authStore; fall back to anonymous token.
birdieApi.interceptors.request.use(async (config) => {
  const { token, tokenExpiresAt } = useAuthStore.getState();
  if (token && Date.now() < tokenExpiresAt) {
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  }
  // Fallback: anonymous token
  const anonToken = await ensureToken();
  if (anonToken) {
    config.headers.Authorization = `Bearer ${anonToken}`;
  }
  return config;
});

// --- Retry interceptor for transient failures ---
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

birdieApi.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as any;
  if (!config) return Promise.reject(error);

  // 401 for authenticated users: attempt one token refresh
  const status = error.response?.status;
  if (status === 401 && !config.__authRetried) {
    const { token } = useAuthStore.getState();
    if (token) {
      config.__authRetried = true;
      try {
        const refreshed = await refreshUserToken();
        if (refreshed) {
          config.headers.Authorization = `Bearer ${refreshed}`;
          return birdieApi.request(config);
        }
      } catch {
        // Refresh failed — clear auth and reject
        useAuthStore.getState().clearAuth();
      }
    }
    return Promise.reject(error);
  }

  config.__retryCount = config.__retryCount ?? 0;

  const isRetryable =
    !error.response || // network error
    (status != null && RETRYABLE_STATUS.has(status));

  if (isRetryable && config.__retryCount < MAX_RETRIES) {
    config.__retryCount += 1;
    const delay = RETRY_DELAY_MS * config.__retryCount;
    await new Promise((r) => setTimeout(r, delay));
    return birdieApi.request(config);
  }

  return Promise.reject(error);
});

// --- Bird data ---

export const fetchBirds = async (params: {
  family?: string;
  species_codes?: string;
  limit?: number;
  offset?: number;
}): Promise<BirdSummary[]> => {
  const res = await birdieApi.get("/api/v1/birds", { params });
  return res.data;
};

export const fetchBirdDetail = async (
  speciesCode: string
): Promise<Bird> => {
  const res = await birdieApi.get(`/api/v1/birds/${speciesCode}`);
  return res.data;
};

export const fetchFamilies = async (): Promise<BirdFamily[]> => {
  const res = await birdieApi.get("/api/v1/birds/families");
  return res.data;
};

// --- Region proxy ---

export const getSubnational1Regions = async (
  countryCode: string
): Promise<Region[]> => {
  const res = await birdieApi.get(
    `/api/v1/regions/subnational1/${countryCode}`
  );
  return res.data;
};

export const getSubnational2Regions = async (
  stateCode: string
): Promise<Region[]> => {
  const res = await birdieApi.get(
    `/api/v1/regions/subnational2/${stateCode}`
  );
  return res.data;
};

export const getSpeciesList = async (
  regionCode: string
): Promise<string[]> => {
  const res = await birdieApi.get(
    `/api/v1/regions/species/${regionCode}`
  );
  return res.data;
};

// --- Chat proxy ---

export type Difficulty = "easy" | "medium" | "hard";

export interface DeckRequest {
  family?: string;
  species_codes?: string[];
  difficulty?: Difficulty;
  region_code?: string;
  limit?: number;
}

export const createDeck = async (req: DeckRequest): Promise<BirdSummary[]> => {
  const res = await birdieApi.post("/api/v1/birds/deck", req);
  return res.data;
};

export const createLookalikeDeck = async (
  speciesCodes: string[],
): Promise<LookalikeBirdSummary[]> => {
  const res = await birdieApi.post("/api/v1/birds/lookalike-deck", {
    species_codes: speciesCodes,
  });
  return res.data;
};

// --- Chat messages ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const sendChatMessage = async (
  birdName: string,
  messages: ChatMessage[]
): Promise<ChatMessage> => {
  const res = await birdieApi.post("/api/v1/chat", { bird_name: birdName, messages });
  return res.data;
};

// ---------------------------------------------------------------------------
//  Auth — register / login / refresh / account management
// ---------------------------------------------------------------------------

export interface AuthResponse {
  user: UserProfile;
  token: string;
  expires_in: number;
}

export const registerUser = async (
  email: string,
  password: string,
): Promise<AuthResponse> => {
  const res = await axios.post(
    `${BACKEND_URL || defaultBaseURL}/api/v1/auth/register`,
    { email, password },
    { timeout: 15_000 },
  );
  return res.data;
};

export const loginUser = async (
  email: string,
  password: string,
): Promise<AuthResponse> => {
  const res = await axios.post(
    `${BACKEND_URL || defaultBaseURL}/api/v1/auth/login`,
    { email, password },
    { timeout: 15_000 },
  );
  return res.data;
};

/**
 * Refresh the user JWT. Returns the new token or null on failure.
 * Uses the current token from authStore directly.
 */
export const refreshUserToken = async (): Promise<string | null> => {
  const { token } = useAuthStore.getState();
  if (!token) return null;
  try {
    const res = await axios.post(
      `${BACKEND_URL || defaultBaseURL}/api/v1/auth/refresh`,
      null,
      {
        timeout: 10_000,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const { token: newToken, expires_in } = res.data;
    // Update store (pass current user to keep profile intact)
    const { user } = useAuthStore.getState();
    if (user && newToken) {
      useAuthStore.getState().setAuth(newToken, expires_in, user);
    }
    return newToken || null;
  } catch {
    return null;
  }
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  await birdieApi.post("/api/v1/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
};

export const deleteAccount = async (password: string): Promise<void> => {
  await birdieApi.request({
    method: "DELETE",
    url: "/api/v1/auth/account",
    data: { password },
  });
};

export const fetchCurrentUser = async (): Promise<UserProfile> => {
  const res = await birdieApi.get("/api/v1/auth/me");
  return res.data;
};

// ---------------------------------------------------------------------------
//  Saved Decks
// ---------------------------------------------------------------------------

export interface SavedDeckSummary {
  id: string;
  name: string;
  deck_type: "dynamic" | "frozen" | "lookalike";
  filters: DeckFilters | null;
  species_count: number | null;
  created_at: string;
  last_played_at: string | null;
}

export interface SavedDeck {
  id: string;
  name: string;
  deck_type: "dynamic" | "frozen" | "lookalike";
  filters: DeckFilters | null;
  species_codes: string[] | null;
  created_at: string;
  last_played_at: string | null;
}

export interface DeckFilters {
  family: string | null;
  region_code: string | null;
  difficulty: Difficulty | null;
  limit: number;
}

export interface SaveDeckRequest {
  name: string;
  deck_type: "dynamic" | "frozen" | "lookalike";
  filters?: DeckFilters | null;
  species_codes?: string[] | null;
}

export const fetchSavedDecks = async (): Promise<SavedDeckSummary[]> => {
  const res = await birdieApi.get("/api/v1/decks");
  return res.data;
};

export const fetchSavedDeck = async (deckId: string): Promise<SavedDeck> => {
  const res = await birdieApi.get(`/api/v1/decks/${deckId}`);
  return res.data;
};

export const saveDeck = async (req: SaveDeckRequest): Promise<SavedDeck> => {
  const res = await birdieApi.post("/api/v1/decks", req);
  return res.data;
};

export const updateSavedDeck = async (
  deckId: string,
  req: Partial<SaveDeckRequest>,
): Promise<SavedDeck> => {
  const res = await birdieApi.put(`/api/v1/decks/${deckId}`, req);
  return res.data;
};

export const deleteSavedDeck = async (deckId: string): Promise<void> => {
  await birdieApi.delete(`/api/v1/decks/${deckId}`);
};

export const playSavedDeck = async (
  deckId: string,
): Promise<BirdSummary[] | LookalikeBirdSummary[]> => {
  const res = await birdieApi.post(`/api/v1/decks/${deckId}/play`);
  return res.data;
};

// ---------------------------------------------------------------------------
//  Stats — sessions & performance data
// ---------------------------------------------------------------------------

export interface AnswerRecord {
  species_code: string;
  result: "correct" | "incorrect" | "skipped";
  time_ms: number;
  presented_options?: string[] | null;
  selected_code?: string | null;
}

export interface SessionCreatePayload {
  deck_id?: string | null;
  quiz_mode: "flashcard" | "multiple_choice" | "audio";
  started_at: string;
  completed_at: string;
  region_code?: string | null;
  difficulty?: Difficulty | null;
  answers: AnswerRecord[];
}

export interface SessionResponse {
  id: string;
  deck_id: string | null;
  quiz_mode: string;
  started_at: string;
  completed_at: string;
  region_code: string | null;
  difficulty: string | null;
  total_answers: number;
  correct_count: number;
  accuracy: number;
}

export const submitSession = async (
  payload: SessionCreatePayload,
): Promise<SessionResponse> => {
  const res = await birdieApi.post("/api/v1/stats/sessions", payload);
  return res.data;
};

export interface OverviewStats {
  life_list_count: number;
  total_species_available: number;
  life_list_pct: number;
  total_sessions: number;
  total_answers: number;
  overall_accuracy: number;
  current_streak: number;
  longest_streak: number;
  daily_practice_streak: number;
  games_this_week: number;
  accuracy_delta_week: number;
}

export const fetchOverview = async (): Promise<OverviewStats> => {
  const res = await birdieApi.get("/api/v1/stats/overview");
  return res.data;
};

export interface SpeciesMastery {
  species_code: string;
  attempts: number;
  correct: number;
  accuracy: number;
  avg_time_ms: number;
  mastery: "unfamiliar" | "novice" | "familiar" | "expert" | "master";
}

export const fetchSpeciesStats = async (
  sort: "accuracy" | "attempts" = "accuracy",
): Promise<SpeciesMastery[]> => {
  const res = await birdieApi.get("/api/v1/stats/species", { params: { sort } });
  return res.data;
};

export const fetchSpeciesDetail = async (
  speciesCode: string,
): Promise<SpeciesMastery> => {
  const res = await birdieApi.get(`/api/v1/stats/species/${speciesCode}`);
  return res.data;
};

export interface TrendPoint {
  date: string;
  sessions: number;
  accuracy: number;
  avg_time_ms: number;
  species_studied: number;
}

export interface QuizModeStats {
  mode: string;
  attempts: number;
  correct: number;
  accuracy: number;
}

export interface RegionalStats {
  region_code: string;
  attempts: number;
  correct: number;
  accuracy: number;
}

export interface DifficultyStats {
  difficulty: string;
  attempts: number;
  correct: number;
  accuracy: number;
}

export interface TrendsResponse {
  daily: TrendPoint[];
  by_quiz_mode: QuizModeStats[];
  by_region: RegionalStats[];
  by_difficulty: DifficultyStats[];
}

export const fetchTrends = async (days = 30): Promise<TrendsResponse> => {
  const res = await birdieApi.get("/api/v1/stats/trends", { params: { days } });
  return res.data;
};

export interface ConfusionPair {
  target_code: string;
  confused_with: string;
  occurrences: number;
}

export const fetchConfusions = async (limit = 20): Promise<ConfusionPair[]> => {
  const res = await birdieApi.get("/api/v1/stats/confusions", { params: { limit } });
  return res.data;
};
