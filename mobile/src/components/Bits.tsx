import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, space } from '../lib/theme';

const TOKEN = require('../../assets/gear/bit.png');

/** 1 byte = 8 bits, and so on up: a lifetime total reads better as "1.2 KB" than "9830 bits". */
export function formatBits(bits: number): string {
  if (bits < 8 * 1024) return `${bits.toLocaleString()} bits`;
  const bytes = bits / 8;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function BitToken({ size = 22 }: { size?: number }) {
  return <Image source={TOKEN} style={{ width: size, height: size }} resizeMode="contain" />;
}

/** The balance. When it changes, the number counts to the new value and the token flips. */
export function BitsPill({ bits, onPress }: { bits: number; onPress?: () => void }) {
  const [shown, setShown] = useState(bits);
  const [spin] = useState(() => new Animated.Value(0));
  const from = useRef(bits);

  useEffect(() => {
    const start = from.current;
    from.current = bits;
    if (start === bits) return;
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const began = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - began) / 600);
      setShown(Math.round(start + (bits - start) * t));
      if (t === 1) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [bits, spin]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bits} bits. Open gear`}
      onPress={onPress ?? (() => router.navigate('/gear'))}
      hitSlop={6}
      style={styles.pill}
    >
      <Animated.View style={{ transform: [{ rotateY: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
        <BitToken />
      </Animated.View>
      <Text style={styles.text}>{shown.toLocaleString()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingLeft: 7,
    paddingRight: space(3),
    paddingVertical: 5,
  },
  text: { fontFamily: fonts.displayBold, fontSize: 17, color: colors.text },
});
