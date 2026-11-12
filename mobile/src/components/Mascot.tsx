/**
 * The llama. Art lives in mobile/assets/mascot/ as idle.png, happy.png and sad.png
 * (square, transparent background, ~512px). Replace those three files to change the
 * mascot everywhere; no code changes needed.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Image } from 'react-native';

export type Mood = 'idle' | 'happy' | 'sad';

const ART = {
  idle: require('../../assets/mascot/idle.png'),
  happy: require('../../assets/mascot/happy.png'),
  sad: require('../../assets/mascot/sad.png'),
};

export function Mascot({ mood = 'idle', size = 96, bounce = false }: { mood?: Mood; size?: number; bounce?: boolean }) {
  // A single small hop when the mood changes (e.g. after answering), never a looping animation.
  const [y] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!bounce) return;
    y.setValue(0);
    Animated.sequence([
      Animated.timing(y, { toValue: mood === 'sad' ? 4 : -10, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [mood, bounce, y]);

  return (
    <Animated.View style={{ transform: [{ translateY: y }] }}>
      <Image source={ART[mood]} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
    </Animated.View>
  );
}
