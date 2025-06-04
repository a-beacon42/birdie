import { getRandomBirds, getSppCodesByFamily, Bird } from "./BirdsService";
import { getSpeciesList } from "../api/ebirdAPI";

export interface CreateGameFilters {
  selectedCountyRegion?: string;
  selectedStateProvince?: string;
  selectedCountry?: string;
  selectedFamily?: string;
  birdsNumber: number;
}

export interface CreateGameSuccess {
  status: "success";
  data: Bird[];
}
export interface CreateGameFailure {
  status: "failure";
  message: string;
}
export type CreateGameResult = CreateGameSuccess | CreateGameFailure;

export const createGame = async (
  filtersToApply: CreateGameFilters
): Promise<CreateGameResult> => {
  const {
    selectedCountyRegion,
    selectedStateProvince,
    selectedCountry,
    selectedFamily,
    birdsNumber,
  } = filtersToApply;

  let regionCode: string | null =
    selectedCountyRegion || selectedStateProvince || selectedCountry || null;

  const sppCodesByRegion: string[] = regionCode ? await getSpeciesList(regionCode) : [];
  const sppCodesByFamily: string[] = selectedFamily
    ? await getSppCodesByFamily(selectedFamily)
    : [];

  const sppCodes: string[] = sppCodesByFamily.filter((sppCode) =>
    sppCodesByRegion.includes(sppCode)
  );

  if (sppCodes.length === 0) {
    return {
      status: "failure",
      message: "No birds found for the selected filters",
    };
  }
  const randomBirds: Bird[] = getRandomBirds(sppCodes, birdsNumber);
  return { status: "success", data: randomBirds };
};