import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';

import { GearCard, PACK_ART } from '../components/GearCard';
import { Chamfer } from '../components/shapes';
import { LlamaStage } from '../components/StatusBoard';
import { api, type OpenedPack, type PackCard } from '../lib/api';
import { useLoop, useReduceMotion } from '../lib/motion';
import { play } from '../lib/sound';
import { colors, fonts, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

const RANK = { common: 0, rare: 1, legendary: 2 } as const;

function Spark({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const t = useLoop(1800, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, 1, 0.15] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }) }],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 20 20">
        <Polygon points="10,0 12.4,7.6 20,10 12.4,12.4 10,20 7.6,12.4 0,10 7.6,7.6" fill={colors.gold} />
      </Svg>
    </Animated.View>
  );
}

/** A card rising out of the pack and turning face-up. */
function Reveal({ card, width, delay, tilt }: { card: PackCard; width: number; delay: number; tilt: string }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 520, delay, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
  }, [t, delay]);
  return (
    <Animated.View
      style={{
        opacity: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
          { rotateY: t.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) },
          { rotate: tilt },
        ],
      }}
    >
      <GearCard id={card.id} name={card.name} rarity={card.rarity} width={width} note={card.new ? undefined : `Duplicate: +${card.refund} bits`} />
    </Animated.View>
  );
}

/** Opening a pack: the pack shakes, then three cards turn over, best one in the middle. */
export default function Pack() {
  const { userId, refresh } = useUser();
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const [opened, setOpened] = useState<OpenedPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!userId) return;
    let live = true;
    Animated.loop(
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 140, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true }),
      ]),
    ).start();
    const began = Date.now();
    api
      .openPack(userId)
      .then((res) => {
        // Let the pack shake for a beat even on a fast connection.
        setTimeout(
          () => {
            if (!live) return;
            setOpened(res);
            setShown(true);
            play('pack');
            refresh();
          },
          Math.max(0, 900 - (Date.now() - began)),
        );
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [userId, shake, refresh]);

  if (error) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={[type.heading, { textAlign: 'center' }]}>That pack stayed shut</Text>
        <Text style={[type.small, { textAlign: 'center' }]}>{error}</Text>
        <Done label="Back" />
      </SafeAreaView>
    );
  }

  if (!opened || !shown) {
    return (
      <SafeAreaView style={styles.screen}>
        <Animated.View
          style={{ transform: [{ rotate: shake.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] }) }, { scale: shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.04, 1, 1.04] }) }] }}
        >
          <Image source={PACK_ART} style={{ width: 200, height: 200 }} resizeMode="contain" />
        </Animated.View>
        <Text style={type.small}>Opening…</Text>
      </SafeAreaView>
    );
  }

  const cards = [...opened.cards].sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
  const [best, ...rest] = cards;
  const big = Math.min(190, Math.round(width * 0.46));
  const small = Math.min(124, Math.round(width * 0.3));
  const fresh = cards.filter((c) => c.new).length;
  const canEquip = best.new;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ alignItems: 'center' }}>
        <Text style={type.tiny}>Pack opened</Text>
        <Text style={type.title}>{fresh === 0 ? 'All duplicates' : fresh === 1 ? 'One new piece' : `${fresh} new pieces`}</Text>
      </View>

      <View style={[styles.fan, { height: Math.round(big * 1.46) + 10 }]}>
        {!reduce && best.rarity !== 'common'
          ? [
              [0.06, 0.02, 14, 0],
              [0.84, 0.08, 18, 600],
              [0.02, 0.6, 12, 1100],
              [0.9, 0.7, 14, 300],
              [0.46, -0.08, 12, 900],
            ].map(([fx, fy, size, delay], i) => <Spark key={i} x={fx * width - space(5)} y={fy * big * 1.46} size={size} delay={delay} />)
          : null}
        <View style={[styles.side, { left: -12 }]}>
          {rest[0] ? <Reveal card={rest[0]} width={small} delay={80} tilt="-7deg" /> : null}
        </View>
        <View style={[styles.side, { right: -12 }]}>
          {rest[1] ? <Reveal card={rest[1]} width={small} delay={220} tilt="7deg" /> : null}
        </View>
        <Reveal card={best} width={big} delay={420} tilt="0deg" />
      </View>

      <Text style={[type.body, { textAlign: 'center' }]}>{best.blurb}</Text>
      <LlamaStage size={104} mood="happy" />

      <View style={{ alignSelf: 'stretch', gap: space(2) }}>
        {canEquip ? (
          <Pressable
            accessibilityRole="button"
            disabled={equipping}
            onPress={async () => {
              if (!userId) return;
              play('tap');
              setEquipping(true);
              try {
                await api.equip(userId, best.id, true);
                await refresh();
              } catch {
                // The gear tab shows the real state either way.
              }
              router.back();
            }}
          >
            <Chamfer cut={12} fill={colors.pink} edge={colors.pinkDark} edgeHeight={5} style={styles.cta}>
              <Text style={styles.ctaText}>Equip {best.name}</Text>
            </Chamfer>
          </Pressable>
        ) : null}
        <Done label={canEquip ? 'Not now' : 'Done'} />
      </View>
    </SafeAreaView>
  );
}

function Done({ label }: { label: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.done}>
      <Text style={styles.doneText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'space-evenly', padding: space(5) },
  fan: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  side: { position: 'absolute', top: 44 },
  cta: { height: 56, paddingBottom: 5, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fonts.display, fontSize: 17, color: colors.pinkInk },
  done: { height: 44, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: fonts.display, fontSize: 16, color: colors.muted },
});
