import React from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";

interface RadioButtonProps {
  idx: number;
  radioText: string;
  selected: boolean;
  onClick: () => void;
}

const RadioButton: React.FC<RadioButtonProps> = ({
  idx,
  radioText,
  selected,
  onClick,
}) => {
  return (
    <View style={styles.container} key={idx}>
      <TouchableOpacity onPress={onClick}>
        <View style={styles.radioWrapper}>
          <View style={styles.radio}>
            {selected ? <View style={styles.radioBg} /> : null}
          </View>
          <Text style={styles.radioText}>{radioText}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

export default RadioButton;

const windowWidth = Dimensions.get("window").width;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  radioText: {
    fontSize: windowWidth * 0.04,
    color: "black",
  },
  radio: {
    width: windowWidth * 0.04,
    height: windowWidth * 0.04,
    borderColor: "purple",
    borderRadius: 20,
    borderWidth: 1.5,
    margin: 8,
  },
  radioWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioBg: {
    width: windowWidth * 0.025,
    height: windowWidth * 0.025,
    backgroundColor: "purple",
    borderRadius: 20,
    margin: windowWidth * 0.00339,
  },
});