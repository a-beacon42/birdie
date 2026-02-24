/**
 * Custom hooks for API data fetching with loading/error states.
 *
 * These fetch from the backend (Cosmos DB) instead of bundled JSON.
 * Responses are cached in-memory with a 5-minute TTL to avoid redundant
 * network requests when navigating back and forth.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchBirds,
  fetchBirdDetail,
  fetchFamilies,
  getSubnational1Regions,
  getSubnational2Regions,
  getSpeciesList,
} from "../api/birdieApi";
import type { BirdSummary, Bird, BirdFamily, Region } from "../types/bird";

// --- In-memory response cache ---

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function getCachedValue<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCachedValue<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/** Clear the in-memory cache — exposed for tests. */
export function clearApiCache(): void {
  cache.clear();
}

// --- Generic async hook ---

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Generic hook that runs an async function and tracks loading/error/data.
 *
 * @param asyncFn  — factory returning the promise (called on mount + when deps change)
 * @param deps     — primitive values that trigger a refetch when they change
 * @param enabled  — set to false to skip execution until ready
 * @param cacheKey — optional key for in-memory caching; when provided, stale data
 *                   is served instantly while a background refetch runs.
 */
function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: readonly unknown[] = [],
  enabled = true,
  cacheKey?: string,
): AsyncState<T> {
  const cached = cacheKey ? getCachedValue<T>(cacheKey) : undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(enabled && cached === undefined);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    // Only show loading spinner when there's no cached data
    if (!cacheKey || !getCachedValue(cacheKey)) {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await asyncFn();
      if (mountedRef.current) {
        setData(result);
        if (cacheKey) setCachedValue(cacheKey, result);
      }
    } catch (err: unknown) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // We intentionally list `deps` contents here; asyncFn captures them via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) execute();
    return () => {
      mountedRef.current = false;
    };
  }, [execute, enabled]);

  return { data, loading, error, refetch: execute };
}

// --- Bird hooks ---

export function useFamilies(): AsyncState<BirdFamily[]> {
  return useAsync(() => fetchFamilies(), [], true, "families");
}

export function useBirds(params: {
  family?: string;
  species_codes?: string;
  limit?: number;
  offset?: number;
}): AsyncState<BirdSummary[]> {
  return useAsync(
    () => fetchBirds(params),
    [params.family, params.species_codes, params.limit, params.offset],
  );
}

export function useBirdDetail(speciesCode: string | null): AsyncState<Bird> {
  return useAsync(
    () => {
      if (!speciesCode) return Promise.reject(new Error("No species code"));
      return fetchBirdDetail(speciesCode);
    },
    [speciesCode],
    !!speciesCode,
  );
}

// --- Region hooks ---

export function useSubnational1(countryCode: string | null): AsyncState<Region[]> {
  return useAsync(
    () => {
      if (!countryCode) return Promise.resolve([]);
      return getSubnational1Regions(countryCode);
    },
    [countryCode],
    !!countryCode,
    countryCode ? `sub1:${countryCode}` : undefined,
  );
}

export function useSubnational2(stateCode: string | null): AsyncState<Region[]> {
  return useAsync(
    () => {
      if (!stateCode) return Promise.resolve([]);
      return getSubnational2Regions(stateCode);
    },
    [stateCode],
    !!stateCode,
    stateCode ? `sub2:${stateCode}` : undefined,
  );
}

export function useSpeciesList(regionCode: string | null): AsyncState<string[]> {
  return useAsync(
    () => {
      if (!regionCode) return Promise.resolve([]);
      return getSpeciesList(regionCode);
    },
    [regionCode],
    !!regionCode,
    regionCode ? `species:${regionCode}` : undefined,
  );
}
