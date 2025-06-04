import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";

interface DropdownComponentProps {
  dropdownLabel: string;
  dropdownData: any[];
  labelField: string;
  valueField: string;
  placeholder: string;
  selectedValue: any;
  onSelect: (item: any) => void;
}

const DropdownComponent: React.FC<DropdownComponentProps> = ({
  dropdownLabel,
  dropdownData,
  labelField,
  valueField,
  placeholder,
  selectedValue,
  onSelect,
}) => {
  const [isFocus, setIsFocus] = useState<boolean>(false);

  const renderLabel = () => {
    if (isFocus) {
      return (
        <Text style={[styles.label, isFocus && { color: "purple" }]}>
          {dropdownLabel}
        </Text>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {renderLabel()}
      <Dropdown
        style={[styles.dropdown, isFocus && { borderColor: "purple" }]}
        data={dropdownData}
        search
        maxHeight={300}
        labelField={labelField}
        valueField={valueField}
        placeholder={!isFocus ? placeholder : "..."}
        searchPlaceholder="Search..."
        value={selectedValue}
        onFocus={() => setIsFocus(true)}
        onBlur={() => setIsFocus(false)}
        onChange={(item: any) => {
          onSelect(item);
          setIsFocus(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
    padding: 16,
    width: "100%",
  },
  dropdown: {
    height: 50,
    borderColor: "purple",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  label: {
    position: "absolute",
    backgroundColor: "white",
    left: 22,
    top: 8,
    zIndex: 999,
    paddingHorizontal: 8,
    fontSize: 14,
    color: "purple",
  },
  placeholderStyle: {
    fontSize: 16,
    color: "purple",
  },
  selectedTextStyle: {
    fontSize: 16,
    color: "purple",
  },
  inputSearchStyle: {
    height: 40,
    fontSize: 16,
    color: "purple",
  },
});

export default DropdownComponent;