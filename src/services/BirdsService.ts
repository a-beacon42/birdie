import birdsDataRaw from "../data/BirdsData.json";
const birdsData = birdsDataRaw as Bird[];

export interface Bird {
  sppCode: string;
  famComName: string;
  famNameCode: string;
  [key: string]: any;
}
export interface Family {
  famNameCode: string;
  famComName: string;
}

export const getAllBirds = (): Bird[] => {
  return birdsData;
}

export const getAllSppCodes = (): string[] => {
  return birdsData.map((bird: Bird) => bird.speciesCode);
};

export const getRandomBirds = (count: number, sppCodes: string[]): Bird[] => {
  const allBirds = getBirdsBySpeciesCodes(sppCodes);
  const randomBirds = allBirds
    .sort(() => Math.random() - Math.random())
    .slice(0, count);
  return randomBirds;
};

export const getBirdsByFamily = (famNameCode: string): Bird[] => {
  return birdsData.filter((bird: Bird) => bird.famNameCode === famNameCode);
};

export const getSppCodesByFamily = (famNameCode: string): string[] => {
  return birdsData
    .filter((bird: Bird) => bird.famNameCode === famNameCode)
    .map((bird: Bird) => bird.sppCode);
};

export const getUniqueFamilies = (): Family[] => {
  return birdsData.reduce<Family[]>((
    acc: Family[],
    bird: Bird
  ) => {
    if (!acc.some((family: Family) => family.famNameCode === bird.famNameCode)) {
      acc.push({
        famNameCode: bird.famNameCode,
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