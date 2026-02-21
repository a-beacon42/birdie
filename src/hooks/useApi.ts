/**
 * Custom hooks for API data fetching with loading/error states.
 *
 * These fetch from the backend (Cosmos DB) instead of bundled JSON.
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
import type { BirdSummary, Bird, BirdFamily } from "../types/bird";

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
 */
function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: readonly unknown[] = [],
  enabled = true,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn();
      if (mountedRef.current) setData(result);
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message ?? "Something went wrong");
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
  return useAsync(() => fetchFamilies(), []);
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

export interface Region {
  code: string;
  name: string;
}

export function useSubnational1(countryCode: string | null): AsyncState<Region[]> {
  return useAsync(
    () => {
      if (!countryCode) return Promise.resolve([]);
      return getSubnational1Regions(countryCode);
    },
    [countryCode],
    !!countryCode,
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
  );
}
