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
        imageSource={gameBirds[currentBirdIndex].imageSource}
        commonName={gameBirds[currentBirdIndex].commonName}
        latinName={gameBirds[currentBirdIndex].latinName}
      />

      <View style={styles.buttonRow}>
        <Button title="Prev Bird" onClick={handlePrevBird} />
        <Button title="Next Bird" onClick={handleNextBird} />
      </View>

      <View style={styles.buttonRow}>
        <Button
          title="Restart Game"
          onClick={handleRestartGame}
          isDisabled={currentBirdIndex === 0}
        />
        <Button title="End Game" onClick={handleEndGame} />
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