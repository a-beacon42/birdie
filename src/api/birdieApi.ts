/**
 * API client for the Birdie backend.
 *
 * Authentication uses short-lived anonymous tokens fetched from the backend
 * at startup. The server's API_KEY never leaves the server.
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { Platform } from "react-native";
import { BACKEND_URL } from "@env";
import type { Bird, BirdSummary, BirdFamily, Region } from "../types/bird";

export type { Bird, BirdSummary, BirdFamily, Region };

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

// Attach Bearer token to every request
birdieApi.interceptors.request.use(async (config) => {
  const token = await ensureToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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

  config.__retryCount = config.__retryCount ?? 0;

  const status = error.response?.status;
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
