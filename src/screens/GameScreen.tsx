import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import FlashCard from "../components/FlashCard";
import Button from "../components/Button";

interface GameScreenProps {
  birds: any[];
  setGameBirds: React.Dispatch<React.SetStateAction<any[]>>;
}

const GameScreen: React.FC<GameScreenProps> = ({ birds, setGameBirds }) => {
  const [currentBirdIndex, setCurrentBirdIndex] = useState<number>(0);
  const gameBirds = birds;
  
  const handlePrevBird = () => {
    setCurrentBirdIndex((prev) =>
      (prev + gameBirds.length - 1) % gameBirds.length
    );
  };

  const handleNextBird = () => {
    setCurrentBirdIndex((prev) => (prev + 1) % gameBirds.length);
  };

  const handleRestartGame = () => {
    setCurrentBirdIndex(0);
  };

  const handleEndGame = () => {
    setCurrentBirdIndex(0);
    setGameBirds([]);
  };

  return (
    <View style={styles.container}>
      <FlashCard
        imageSource={{uri: gameBirds[currentBirdIndex].imageUrl}}
        commonName={gameBirds[currentBirdIndex].comName}
        latinName={gameBirds[currentBirdIndex].latinName}
      />

      <View style={styles.buttonRow}>
        <Button title="previous" onClick={handlePrevBird} />
        <Button title="next" onClick={handleNextBird} />
      </View>

      <View style={styles.buttonRow}>
        <Button
          title="restart"
          onClick={handleRestartGame}
          isDisabled={currentBirdIndex === 0}
        />
        <Button title="end" onClick={handleEndGame} />
      </View>
    </View>
  );
};

export default GameScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
});