import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BitsPill, BitToken, formatBits } from '../../components/Bits';
import { GearImage, PACK_ART, RARITY_COLOR, RARITY_NAME } from '../../components/GearCard';
import { Icon } from '../../components/Icon';
import { Chamfer, Hex } from '../../components/shapes';
import { LlamaStage } from '../../components/StatusBoard';
import { api, type Gear, type Loot, type Slot } from '../../lib/api';
import { play } from '../../lib/sound';
import { colors, fonts, radius, space, type } from '../../lib/theme';
import { useUser } from '../../lib/UserContext';

const SLOT_NAME: Record<Slot, string> = { head: 'Head', face: 'Face', neck: 'Neck' };
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Gear: what the llama is wearing, the card packs bits buy, and everything there is to find. */
export default function GearTab() {
  const { userId, refresh } = useUser();
  const [loot, setLoot] = useState<Loot | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      api
        .loot(userId)
        .then(setLoot)
        .catch(() => {});
    }, [userId]),
  );

  if (!loot || !userId) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.pink} />
      </View>
    );
  }

  const bySlot = (slot: Slot) => loot.gear.find((g) => g.slot === slot && g.equipped) ?? null;
  const found = loot.gear.filter((g) => g.owned).length;
  const detail = loot.gear.find((g) => g.id === picked) ?? null;
  const canOpen = loot.bits >= loot.pack.cost;
  const freezeFull = loot.freeze.held >= loot.freeze.max;

  async function act(run: () => Promise<Loot>) {
    setBusy(true);
    setMessage(null);
    try {
      setLoot(await run());
      await refresh(); // the home screen shows the balance and the streak freezes too
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggle(g: Gear) {
    play('tap');
    act(() => api.equip(userId!, g.id, !g.equipped));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={type.title}>Gear</Text>
          <BitsPill bits={loot.bits} onPress={() => {}} />
        </View>

        <Chamfer cut={16} fill={colors.card} stroke={colors.border} style={styles.stage}>
          <LlamaStage size={148} />
          <View style={{ flex: 1, gap: space(3) }}>
            {loot.slots.map((slot) => {
              const g = bySlot(slot);
              return (
                <Pressable
                  key={slot}
                  accessibilityRole="button"
                  accessibilityLabel={g ? `${SLOT_NAME[slot]}: ${g.name}. ${g.blurb}` : `${SLOT_NAME[slot]}: empty`}
                  onPress={() => setPicked(g ? g.id : (loot.gear.find((x) => x.slot === slot && x.owned)?.id ?? null))}
                  style={styles.slot}
                >
                  {g ? (
                    <Hex width={52} fill={colors.panel} stroke={colors.pinkDark} strokeWidth={2}>
                      <GearImage id={g.id} size={38} />
                    </Hex>
                  ) : (
                    <Hex width={52} fill={colors.bg} stroke={colors.border} strokeWidth={2}>
                      <Icon name="plus" size={18} color={colors.faint} />
                    </Hex>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={type.tiny}>{SLOT_NAME[slot]}</Text>
                    <Text style={[styles.slotName, !g && { color: colors.muted }]} numberOfLines={1}>
                      {g ? g.name : 'Empty'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Chamfer>

        <View style={styles.row}>
          <Image source={PACK_ART} style={styles.packArt} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Card pack</Text>
            <Text style={type.small}>
              {loot.pack.size} gear cards. Legendary guaranteed within {loot.pack.packs_until_guaranteed_legendary}{' '}
              {loot.pack.packs_until_guaranteed_legendary === 1 ? 'pack' : 'packs'}.
            </Text>
          </View>
          <Price
            label="Open"
            cost={loot.pack.cost}
            disabled={!canOpen || busy}
            accessibilityLabel={canOpen ? `Open a pack for ${loot.pack.cost} bits` : `A pack costs ${loot.pack.cost} bits`}
            onPress={() => router.push('/pack')}
          />
        </View>
        {!canOpen ? (
          <Text style={[type.small, styles.hint]}>
            {loot.pack.cost - loot.bits} more bits for a pack. Lessons, reviews and your daily goal all pay.
          </Text>
        ) : null}

        <View style={styles.row}>
          <View style={styles.freezeArt}>
            <Icon name="freeze" size={30} color={colors.ice} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Streak freeze</Text>
            <Text style={type.small}>
              Covers one missed day. Holding {loot.freeze.held} of {loot.freeze.max}.
            </Text>
          </View>
          <Price
            label="Buy"
            cost={loot.freeze.cost}
            disabled={freezeFull || loot.bits < loot.freeze.cost || busy}
            accessibilityLabel={freezeFull ? 'Streak freezes are full' : `Buy a streak freeze for ${loot.freeze.cost} bits`}
            onPress={() => act(() => api.buyFreeze(userId))}
          />
        </View>

        <View style={styles.header}>
          <Text style={type.heading}>Collection</Text>
          <Text style={type.tiny}>
            {found} of {loot.gear.length} found
          </Text>
        </View>
        <View style={styles.grid}>
          {loot.gear.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              accessibilityState={{ selected: picked === g.id }}
              accessibilityLabel={`${g.name}, ${RARITY_NAME[g.rarity]}, ${g.owned ? (g.equipped ? 'equipped' : 'owned') : 'not found yet'}`}
              onPress={() => {
                play('tap');
                setPicked(picked === g.id ? null : g.id);
              }}
              style={[
                styles.card,
                { borderTopColor: g.owned ? RARITY_COLOR[g.rarity] : colors.border },
                picked === g.id && { backgroundColor: colors.chosen },
              ]}
            >
              {g.equipped ? <View style={styles.onDot} /> : null}
              <GearImage id={g.id} size={54} locked={!g.owned} />
              <Text style={[styles.cardName, !g.owned && { color: colors.muted }]} numberOfLines={2}>
                {g.name}
              </Text>
            </Pressable>
          ))}
        </View>

        {detail ? (
          <Chamfer cut={14} fill={colors.card} stroke={detail.owned ? RARITY_COLOR[detail.rarity] : colors.border} style={styles.detail}>
            <View style={styles.detailHead}>
              <GearImage id={detail.id} size={64} locked={!detail.owned} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{detail.name}</Text>
                <Text style={[type.tiny, { color: RARITY_COLOR[detail.rarity] }]}>
                  {RARITY_NAME[detail.rarity]}, {SLOT_NAME[detail.slot].toLowerCase()} slot
                </Text>
              </View>
            </View>
            <Text style={type.body}>{detail.blurb}</Text>
            {detail.owned ? (
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => toggle(detail)} style={styles.equip}>
                <Text style={styles.equipText}>{detail.equipped ? 'Take off' : 'Equip'}</Text>
              </Pressable>
            ) : (
              <Text style={type.small}>Not found yet. It turns up in card packs.</Text>
            )}
          </Chamfer>
        ) : null}

        {message ? <Text style={[type.small, { color: colors.rubyText }]}>{message}</Text> : null}
        <Text style={type.small}>
          Odds per card: common {pct(loot.pack.odds.common)}, rare {pct(loot.pack.odds.rare)}, legendary {pct(loot.pack.odds.legendary)}.
          Duplicates pay bits back. Earned so far: {formatBits(loot.bits_earned)}.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Price({
  label,
  cost,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  cost: number;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        play('tap');
        onPress();
      }}
      style={({ pressed }) => (pressed ? { transform: [{ translateY: 2 }] } : null)}
    >
      <Chamfer
        cut={10}
        fill={disabled ? colors.cardRaised : colors.pink}
        edge={disabled ? colors.edge : colors.pinkDark}
        edgeHeight={4}
        style={styles.price}
      >
        <Text style={[styles.priceText, disabled && { color: colors.muted }]}>{label}</Text>
        <BitToken size={18} />
        <Text style={[styles.priceText, disabled && { color: colors.muted }]}>{cost}</Text>
      </Chamfer>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { padding: space(5), gap: space(4), paddingBottom: space(12) },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stage: { flexDirection: 'row', alignItems: 'center', gap: space(2), padding: space(3) },
  slot: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 58 },
  slotName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.card, borderRadius: radius.md, padding: space(3) },
  rowTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  packArt: { width: 72, height: 72, transform: [{ rotate: '-6deg' }] },
  freezeArt: { width: 72, height: 56, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: -space(2) },
  price: { height: 46, paddingBottom: 4, paddingHorizontal: space(3), flexDirection: 'row', alignItems: 'center', gap: 5 },
  priceText: { fontFamily: fonts.display, fontSize: 16, color: colors.pinkInk },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  card: {
    width: '23%',
    flexGrow: 1,
    maxWidth: '24%',
    minHeight: 104,
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 3,
    backgroundColor: colors.card,
    borderTopWidth: 3,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  cardName: { fontFamily: fonts.bodyBold, fontSize: 11.5, lineHeight: 14, color: colors.text, textAlign: 'center' },
  onDot: { position: 'absolute', right: 6, top: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.jade },
  detail: { padding: space(4), gap: space(3) },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  equip: { alignSelf: 'flex-start', backgroundColor: colors.cardRaised, borderRadius: radius.md, paddingHorizontal: space(5), paddingVertical: space(3) },
  equipText: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
});
