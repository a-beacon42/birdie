import React, { useState, useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";
import Button from "../components/Button";
import RadioButton from "../components/RadioButton";
import Dropdown from "../components/Dropdown";
import allCountries from "../data/AllCountries.json";
import { Bird, getAllSppCodes, Family, getUniqueFamilies } from "../services/BirdsService";
import { createGame } from "../services/CreateGameService";
import {
    getSubnational1Regions,
    getSubnational2Regions,
} from "../api/ebirdAPI";
import colors from "../../assets/colors";

type Country = {
    name: string;
    code: string;
};

type Region = {
    name: string;
    code: string;
};

type CreateGameScreenProps = {
    setGameBirds: (birds: Bird[]) => void;
    setIsPlaying: (isPlaying: boolean) => void;
};

const CreateGameScreen: React.FC<CreateGameScreenProps> = ({ setGameBirds, setIsPlaying }) => {
    const uniqueFamilies: Family[] = getUniqueFamilies();
    const birdNumberOpts = ["25", "50", "all"];
    const [birdsNumber, setBirdsNumber] = useState<string>("25");
    const [selectedFamily, setSelectedFamily] = useState<string>("");
    const [selectedCountry, setSelectedCountry] = useState<string>("");
    const [selectedStateProvince, setSelectedStateProvince] = useState<string>("");
    const [selectedCountyRegion, setSelectedCountyRegion] = useState<string>("");
    const [allSubnational1, setAllSubnational1] = useState<Region[]>([]);
    const [allSubnational2, setAllSubnational2] = useState<Region[]>([]);

    useEffect(() => {
        setSelectedCountyRegion("");
        setSelectedStateProvince("");
        setAllSubnational2([]);
        if (selectedCountry) {
            getSubnational1Regions(selectedCountry)
                .then((subNational1Regions: Region[]) => {
                    setAllSubnational1(subNational1Regions);
                })
                .catch((error: any) => {
                    console.log(error);
                });
        };

    }, [selectedCountry]);

    useEffect(() => {
        if (selectedStateProvince) {
            getSubnational2Regions(selectedStateProvince)
                .then((subNational2Regions: Region[]) => {
                    setAllSubnational2(subNational2Regions);
                })
                .catch((error: any) => {
                    console.log(error);
                });
        }
    }, [selectedStateProvince]);

    const handleCreateGame = async () => {
        const filtersToApply = {
            birdsNumber: birdsNumber === "all" ? -1 : Number(birdsNumber),
            selectedFamily,
            selectedCountry,
            selectedStateProvince,
            selectedCountyRegion,
        };
        const gameBirds = await createGame(filtersToApply);
        if (gameBirds.status === "failure") {
            alert(gameBirds.message);
            return;
        } else {
            setGameBirds(gameBirds.data);
            setIsPlaying(true);
        }
    };

    const handleClearFilters = () => {
        setBirdsNumber("25");
        setSelectedFamily("");
        setSelectedCountry("");
        setSelectedStateProvince("");
        setSelectedCountyRegion("");
        setAllSubnational1([]);
        setAllSubnational2([]);
    };

    return (
        <View style={{ justifyContent: "center", marginTop: 50 }}>
            <View style={styles.container}>
                <Text
                    style={{
                        fontWeight: "bold",
                        fontSize: 24,
                        color: "purple",
                        paddingVertical: 5,
                    }}
                >
                    Create New Game
                </Text>
                <View
                    style={{
                        flexDirection: "row", alignItems: "center", paddingTop: 10,
                    }}
                >
                    <View style={{
                        flex: 1, height: 1, backgroundColor: "purple",
                    }} />
                    <Text
                        style={{
                            textAlign: "center",
                            paddingHorizontal: 4,
                            color: "purple",
                        }}
                    >
                        Number of flashcards
                    </Text>
                    <View style={{
                        flex: 1, height: 1, backgroundColor: "purple",
                    }} />
                </View>
                <View style={{
                    flexDirection: "row", marginBottom: 20, marginTop: 10,
                }}>
                    {birdNumberOpts.map((opt, i) => (
                        <RadioButton
                            key={i}
                            idx={i}
                            radioText={opt}
                            selected={opt === birdsNumber}
                            onClick={() => {
                                setBirdsNumber(opt);
                            }}
                        />
                    ))}
                </View>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingTop: 10,
                    }}
                >
                    <View style={{
                        flex: 1, height: 1, backgroundColor: "purple",
                    }} />
                    <Text
                        style={{
                            textAlign: "center",
                            paddingHorizontal: 4,
                            color: "purple",
                        }}
                    >
                        Family (optional)
                    </Text>
                    <View style={{
                        flex: 1, height: 1, backgroundColor: "purple",
                    }} />
                </View>
                <Dropdown
                    dropdownLabel={"Family"}
                    dropdownData={uniqueFamilies}
                    labelField={"famComName"}
                    valueField={"famNameCode"}
                    placeholder={"Select a family"}
                    selectedValue={selectedFamily}
                    onSelect={(item: Family) => {
                        console.log("Selected family:", item);
                        setSelectedFamily(item.famNameCode);
                    }}
                />
                <View
                    style={{
                        flexDirection: "row", alignItems: "center", paddingTop: 10,
                    }}
                >
                    <View style={{
                        flex: 1, height: 1, backgroundColor: "purple",
                    }} />
                    <View>
                        <Text
                            style={{
                                textAlign: "center",
                                paddingHorizontal: 4,
                                color: "purple",
                            }}
                        >
                            Location (optional)
                        </Text>
                    </View>
                    <View style={{
                        flex: 1, height: 1, backgroundColor: "purple",
                    }} />
                </View>
                <Dropdown
                    dropdownLabel={"Country"}
                    dropdownData={allCountries as Country[]}
                    labelField={"name"}
                    valueField={"code"}
                    placeholder={"Select a country"}
                    selectedValue={selectedCountry}
                    onSelect={(item: Country) => {
                        setSelectedCountry(item.code);
                    }}
                />
                {selectedCountry && allSubnational1.length > 0 && (
                    <Dropdown
                        dropdownLabel={"State/Province"}
                        dropdownData={allSubnational1}
                        labelField={"name"}
                        valueField={"code"}
                        placeholder={"Select a state/province"}
                        selectedValue={selectedStateProvince}
                        onSelect={(item: Region) => {
                            setSelectedStateProvince(item.code);
                        }}
                    />
                )}
                {selectedStateProvince && allSubnational2.length > 0 && (
                    <Dropdown
                        dropdownLabel={"County/Region"}
                        dropdownData={allSubnational2}
                        labelField={"name"}
                        valueField={"code"}
                        placeholder={"Select a county/region"}
                        selectedValue={selectedCountyRegion}
                        onSelect={(item: Region) => {
                            setSelectedCountyRegion(item.code);
                        }}
                    />
                )}
                <View style={styles.buttonRow}>
                    <Button title="create game" onClick={handleCreateGame} />
                    <Button title="reset filters" onClick={handleClearFilters} />
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 20,
        borderWidth: 2,
        borderColor: colors.purple,
        backgroundColor: "#fff",
        paddingHorizontal: 10,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
    },
});

export default CreateGameScreen;