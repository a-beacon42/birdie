import birdsDataRaw from "../data/BirdsData.json";
const birdsData = birdsDataRaw as Bird[];

// Define data types
export interface Bird {
  speciesCode: string;
  sppCode: string;
  famComName: string;
  famComNameCode: string;
  [key: string]: any;
}
export interface Family {
  famComNameCode: string;
  famComName: string;
}

export const getAllSppCodes = (): string[] => {
  return birdsData.map((bird: Bird) => bird.speciesCode);
};

export const getRandomBirds = (sppCodes: string[], count: number): Bird[] => {
  const allBirds = getBirdsBySpeciesCodes(sppCodes);
  const randomBirds = allBirds
    .sort(() => Math.random() - Math.random())
    .slice(0, count);
  return randomBirds;
};

export const getBirdsByFamily = (famComNameCode: string): Bird[] => {
  return birdsData.filter((bird: Bird) => bird.famComNameCode === famComNameCode);
};

export const getSppCodesByFamily = (famComNameCode: string): string[] => {
  return birdsData
    .filter((bird: Bird) => bird.famComNameCode === famComNameCode)
    .map((bird: Bird) => bird.sppCode);
};

export const getUniqueFamilies = (): Family[] => {
  return birdsData.reduce<Family[]>((
    acc: Family[],
    bird: Bird
  ) => {
    if (!acc.some((family: Family) => family.famComNameCode === bird.famComNameCode)) {
      acc.push({
        famComNameCode: bird.famComNameCode,
        famComName: bird.famComName,
      });
    }
    return acc;
  }, [] as Family[]);
};

export const getSingleBirdBySpeciesCode = (speciesCode: string): Bird | undefined => {
  return birdsData.find((bird: Bird) => bird.speciesCode === speciesCode);
};

export const getBirdsBySpeciesCodes = (speciesCodes: string[]): Bird[] => {
  return birdsData.filter(
    (bird: Bird) => speciesCodes.includes(bird.sppCode)
  );
};