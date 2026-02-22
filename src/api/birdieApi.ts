/**
 * API client for the Birdie backend.
 */

import axios, { AxiosInstance } from "axios";
import { BACKEND_URL, BACKEND_API_KEY } from "@env";
import type { Bird, BirdSummary, BirdFamily } from "../types/bird";

export type { Bird, BirdSummary, BirdFamily };

export const birdieApi: AxiosInstance = axios.create({
  baseURL: BACKEND_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
    ...(BACKEND_API_KEY ? { "X-API-Key": BACKEND_API_KEY } : {}),
  },
});

// --- Bird data ---

export const fetchBirds = async (params: {
  family?: string;
  species_codes?: string;
  limit?: number;
  offset?: number;
}): Promise<BirdSummary[]> => {
  const res = await birdieApi.get("/api/birds", { params });
  return res.data;
};

export const fetchBirdDetail = async (
  speciesCode: string
): Promise<Bird> => {
  const res = await birdieApi.get(`/api/birds/${speciesCode}`);
  return res.data;
};

export const fetchFamilies = async (): Promise<BirdFamily[]> => {
  const res = await birdieApi.get("/api/birds/families");
  return res.data;
};

// --- Region proxy ---

export interface Region {
  code: string;
  name: string;
}

export const getSubnational1Regions = async (
  countryCode: string
): Promise<Region[]> => {
  const res = await birdieApi.get(
    `/api/regions/subnational1/${countryCode}`
  );
  return res.data;
};

export const getSubnational2Regions = async (
  stateCode: string
): Promise<Region[]> => {
  const res = await birdieApi.get(
    `/api/regions/subnational2/${stateCode}`
  );
  return res.data;
};

export const getSpeciesList = async (
  regionCode: string
): Promise<string[]> => {
  const res = await birdieApi.get(
    `/api/regions/species/${regionCode}`
  );
  return res.data;
};

// --- Chat proxy ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const sendChatMessage = async (
  birdName: string,
  messages: ChatMessage[]
): Promise<ChatMessage> => {
  const res = await birdieApi.post("/api/chat", { bird_name: birdName, messages });
  return res.data;
};
