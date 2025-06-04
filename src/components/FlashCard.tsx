import React, { useRef, useState } from 'react';
import { Animated, StyleSheet, View, Text, Image, TouchableWithoutFeedback, StyleProp, ViewStyle } from 'react-native';

interface FlashCardProps {
  imageSource: { uri: string } | number;
  commonName: string;
  latinName: string;
  style?: StyleProp<ViewStyle>;
}

const FlashCard: React.FC<FlashCardProps> = ({ imageSource, commonName, latinName, style }) => {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const flipCard = () => {
    Animated.timing(flipAnim, {
      toValue: flipped ? 0 : 180,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setFlipped(!flipped);
  };

  return (
    <TouchableWithoutFeedback onPress={flipCard}>
      <View style={[styles.container, style]}>         
        <Animated.View style={[styles.card, styles.cardFront, { transform: [{ rotateY: frontInterpolate }] }]}>          
          <Image source={imageSource} style={styles.image} resizeMode="cover" />
        </Animated.View>

        <Animated.View style={[styles.card, styles.cardBack, { transform: [{ rotateY: backInterpolate }] }]}>          
          <Image source={imageSource} style={styles.image} resizeMode="cover" />
          <View style={styles.textContainer}>
            <Text style={styles.commonName}>{commonName}</Text>
            <Text style={styles.latinName}>{latinName}</Text>
          </View>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
};

export default FlashCard;

const styles = StyleSheet.create({
  container: {
    width: 200,
    height: 300,
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
    borderRadius: 10,
    overflow: 'hidden',
  },
  cardFront: {
    backgroundColor: '#fff',
  },
  cardBack: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  image: {
    width: '100%',
    height: '70%',
  },
  textContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  commonName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  latinName: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#555',
  },
});