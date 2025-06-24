import { getRandomBirds, getSppCodesByFamily, getAllSppCodes, Bird } from "./BirdsService";
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

  const sppCodesByRegion: string[] | null = regionCode ?
    await getSpeciesList(regionCode)
    : null;
  const sppCodesByFamily: string[] | null = selectedFamily
    ? await getSppCodesByFamily(selectedFamily)
    : null;

  let sppCodes: string[];

  if (sppCodesByFamily && sppCodesByRegion) {
    sppCodes = sppCodesByFamily.filter(sppCode => sppCodesByRegion.includes(sppCode));
  } else if (sppCodesByFamily) {
    sppCodes = sppCodesByFamily;
  } else if (sppCodesByRegion) {
    sppCodes = sppCodesByRegion;
  }
  else {
    sppCodes = getAllSppCodes();
  }

  if (sppCodes.length === 0) {
    return {
      status: "failure",
      message: "No birds found for the selected filters",
    };
  }
  const randomBirds: Bird[] = getRandomBirds(birdsNumber, sppCodes);
  return { status: "success", data: randomBirds };
};