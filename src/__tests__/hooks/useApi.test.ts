/**
 * Tests for useApi hooks — verifies data fetching, loading, and error states.
 */

import { renderHook, waitFor } from "@testing-library/react-native";
import { useFamilies, useSubnational1, useSubnational2, clearApiCache } from "../../hooks/useApi";

import {
    fetchFamilies,
    getSubnational1Regions,
    getSubnational2Regions,
} from "../../api/birdieApi";

// Mock the API module
jest.mock("../../api/birdieApi", () => ({
    fetchFamilies: jest.fn(),
    fetchBirds: jest.fn(),
    fetchBirdDetail: jest.fn(),
    getSubnational1Regions: jest.fn(),
    getSubnational2Regions: jest.fn(),
    getSpeciesList: jest.fn(),
}));

const mockFetchFamilies = fetchFamilies as jest.MockedFunction<typeof fetchFamilies>;
const mockGetSub1 = getSubnational1Regions as jest.MockedFunction<typeof getSubnational1Regions>;
const mockGetSub2 = getSubnational2Regions as jest.MockedFunction<typeof getSubnational2Regions>;

describe("useApi hooks", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearApiCache();
    });

    describe("useFamilies", () => {
        it("returns data on successful fetch", async () => {
            const families = [
                { family_code: "Accipitridae", family_com_name: "Hawks, Eagles, and Kites" },
            ];
            mockFetchFamilies.mockResolvedValueOnce(families);

            const { result } = renderHook(() => useFamilies());

            // Initially loading
            expect(result.current.loading).toBe(true);
            expect(result.current.data).toBeNull();

            await waitFor(() => expect(result.current.loading).toBe(false));

            expect(result.current.data).toEqual(families);
            expect(result.current.error).toBeNull();
        });

        it("sets error on failure", async () => {
            mockFetchFamilies.mockRejectedValueOnce(new Error("Network error"));

            const { result } = renderHook(() => useFamilies());

            await waitFor(() => expect(result.current.loading).toBe(false));

            expect(result.current.data).toBeNull();
            expect(result.current.error).toBe("Network error");
        });
    });

    describe("useSubnational1", () => {
        it("skips fetch when countryCode is null", async () => {
            const { result } = renderHook(() => useSubnational1(null));

            // Should not be loading since enabled = false
            expect(result.current.loading).toBe(false);
            expect(mockGetSub1).not.toHaveBeenCalled();
        });

        it("fetches regions for a valid country code", async () => {
            const regions = [{ code: "US-NY", name: "New York" }];
            mockGetSub1.mockResolvedValueOnce(regions);

            const { result } = renderHook(() => useSubnational1("US"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            expect(result.current.data).toEqual(regions);
            expect(mockGetSub1).toHaveBeenCalledWith("US");
        });
    });

    describe("useSubnational2", () => {
        it("skips fetch when stateCode is null", async () => {
            const { result } = renderHook(() => useSubnational2(null));

            expect(result.current.loading).toBe(false);
            expect(mockGetSub2).not.toHaveBeenCalled();
        });

        it("fetches counties for a valid state code", async () => {
            const counties = [{ code: "US-NY-061", name: "New York County" }];
            mockGetSub2.mockResolvedValueOnce(counties);

            const { result } = renderHook(() => useSubnational2("US-NY"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            expect(result.current.data).toEqual(counties);
        });
    });
});
