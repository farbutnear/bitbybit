import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import type { Rarity } from '../lib/api';
import { useLoop, useReduceMotion } from '../lib/motion';
import { colors, fonts } from '../lib/theme';
import { Chamfer } from './shapes';

export const GEAR_ART: Record<string, number> = {
  'rollback-cap': require('../../assets/gear/rollback-cap.png'),
  'oncall-headset': require('../../assets/gear/oncall-headset.png'),
  'root-crown': require('../../assets/gear/root-crown.png'),
  'debug-visor': require('../../assets/gear/debug-visor.png'),
  'tracer-lens': require('../../assets/gear/tracer-lens.png'),
  'replica-tags': require('../../assets/gear/replica-tags.png'),
  'block-chain': require('../../assets/gear/block-chain.png'),
};
export const PACK_ART = require('../../assets/gear/pack.png');

export const RARITY_COLOR: Record<Rarity, string> = { common: '#8A7F90', rare: colors.pink, legendary: colors.gold };
export const RARITY_NAME: Record<Rarity, string> = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };

export function GearImage({ id, size, locked = false }: { id: string; size: number; locked?: boolean }) {
  return (
    <Image
      source={GEAR_ART[id]}
      resizeMode="contain"
      style={[{ width: size, height: size }, locked && { tintColor: '#000', opacity: 0.45 }]}
      accessibilityIgnoresInvertColors
    />
  );
}

/** A gear card as it comes out of a pack: rarity on the frame, and foil that moves on a legendary. */
export function GearCard({
  id,
  name,
  rarity,
  width,
  note,
}: {
  id: string;
  name: string;
  rarity: Rarity;
  width: number;
  note?: string;
}) {
  const reduce = useReduceMotion();
  const big = width >= 170;
  const height = Math.round(width * 1.46);
  const sheen = useLoop(2600, 0, rarity === 'legendary' && !reduce);
  return (
    <Chamfer cut={14} fill={colors.panel} stroke={RARITY_COLOR[rarity]} strokeWidth={3} style={{ width, height }}>
      {rarity === 'legendary' ? (
        <View style={styles.foilClip} pointerEvents="none">
          <Animated.View
            style={[
              styles.foil,
              { height: height * 1.4, transform: [{ translateX: sheen.interpolate({ inputRange: [0, 1], outputRange: [-width, width * 1.2] }) }, { rotate: '18deg' }] },
            ]}
          />
        </View>
      ) : null}
      <View style={styles.body}>
        <GearImage id={id} size={Math.round(width * 0.68)} />
        <Text style={[styles.name, { fontSize: big ? 20 : 13.5, lineHeight: big ? 24 : 16 }]}>{name}</Text>
        <Text style={[styles.rarity, { color: RARITY_COLOR[rarity], fontSize: big ? 13 : 11.5 }]}>{RARITY_NAME[rarity]}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    </Chamfer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 8 },
  name: { fontFamily: fonts.display, color: colors.text, textAlign: 'center' },
  rarity: { fontFamily: fonts.bodyBold },
  note: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.muted, textAlign: 'center' },
  // Kept clear of the cut corners so the foil never paints outside the frame.
  foilClip: { position: 'absolute', left: 16, right: 16, top: 16, bottom: 16, overflow: 'hidden' },
  foil: { position: 'absolute', top: -40, width: 34, backgroundColor: colors.gold, opacity: 0.16 },
});
