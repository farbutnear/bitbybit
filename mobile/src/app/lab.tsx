import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BitToken } from '../components/Bits';
import { Icon } from '../components/Icon';
import { Chamfer } from '../components/shapes';
import { api, type SimEntry, type SimOverview } from '../lib/api';
import { play } from '../lib/sound';
import { colors, fonts, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

/** Sim lab: every simulator level and today's incident. */
export default function Lab() {
  const { userId } = useUser();
  const [data, setData] = useState<SimOverview | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      api
        .simOverview(userId)
        .then(setData)
        .catch(() => {});
    }, [userId]),
  );

  if (!data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.pink} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={type.small}>
        Each sim hands you a system that is failing under load. Change it, run it, and read what the numbers do. There is
        more than one fix; the cheapest one is the lesson.
      </Text>
      <Row entry={data.incident} to="incident" reward={data.incident.bits} note="Today only" />
      <Text style={type.heading}>Levels</Text>
      {data.levels.map((lv) => (
        <Row key={lv.id} entry={lv} to={lv.id} reward={data.bits_per_level} />
      ))}
    </ScrollView>
  );
}

function Row({ entry, to, reward, note }: { entry: SimEntry; to: string; reward: number; note?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.title}. ${entry.solved ? 'Solved' : `Not solved, ${reward} bits`}`}
      onPress={() => {
        play('tap');
        router.push({ pathname: '/sim', params: { id: to } });
      }}
    >
      <Chamfer cut={14} fill={colors.card} stroke={entry.solved ? colors.jadeDark : colors.border} style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          {note ? <Text style={[type.tiny, { color: colors.gold }]}>{note}</Text> : null}
          <Text style={styles.title}>{entry.title}</Text>
          <Text style={type.small}>{entry.teaches}</Text>
        </View>
        {entry.solved ? (
          <View style={styles.side}>
            <Icon name="check" size={24} color={colors.jadeText} strokeWidth={3} />
            {entry.best_cost !== null ? <Text style={type.tiny}>${entry.best_cost.toLocaleString()}</Text> : null}
          </View>
        ) : (
          <View style={styles.side}>
            <BitToken size={22} />
            <Text style={[type.tiny, { color: colors.gold }]}>+{reward}</Text>
          </View>
        )}
      </Chamfer>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { padding: space(5), gap: space(3), paddingBottom: space(10) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4) },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  side: { alignItems: 'center', gap: 2, minWidth: 44 },
});
