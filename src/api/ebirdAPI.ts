import axios, { AxiosInstance } from "axios";
import { EBIRD_API_KEY } from "@env";

export const eBirdApi: AxiosInstance = axios.create({
  baseURL: "https://api.ebird.org/v2",
  headers: {
    "X-eBirdApiToken": EBIRD_API_KEY || "",
    "Content-Type": "application/json",
  },
});

const subNational1Url = `/ref/region/list/subnational1`;
const subNational2Url = `/ref/region/list/subnational2`;

export const getSubnational1Regions = async (
  selectedCountry: string
): Promise<any[]> => {
  try {
    const res = await eBirdApi.get(`${subNational1Url}/${selectedCountry}`);
    return res.data;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

export const getSubnational2Regions = async (
  selectedStateProvince: string
): Promise<any[]> => {
  try {
    const res = await eBirdApi.get(
      `${subNational2Url}/${selectedStateProvince}`
    );
    return res.data;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

export const getSpeciesList = async (regionCode: string): Promise<any[]> => {
  try {
    const res = await eBirdApi.get(`/product/spplist/${regionCode}`);
    return res.data;
  } catch (err) {
    console.error(err);
    throw err;
  }
};