import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BitToken } from '../components/Bits';
import { Diagram, type NodeState } from '../components/Diagram';
import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { Chamfer } from '../components/shapes';
import { Button, Chip } from '../components/ui';
import { api, type SimCheck, type SimConfig, type SimKnob, type SimLevel, type SimLoad, type SimResult, type SimRun } from '../lib/api';
import { play } from '../lib/sound';
import { colors, fonts, radius, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

const LOAD: Record<SimLoad, NodeState> = { ok: 'right', hot: 'hot', down: 'wrong' };

function show(c: SimCheck): string {
  if (c.value === null) return 'never';
  if (c.id === 'cost') return `$${c.value.toLocaleString()}`;
  return `${c.value.toLocaleString()}${c.unit === '%' ? '%' : ` ${c.unit}`}`;
}

function target(c: SimCheck): string {
  if (c.id === 'cost') return `budget $${c.target.toLocaleString()}`;
  return `target ${c.target}${c.unit === '%' ? '%' : ` ${c.unit}`} or less`;
}

/** The simulator: change the system, run it, and read what the load does to each part. */
export default function Sim() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, refresh } = useUser();
  const insets = useSafeAreaInsets();
  const [level, setLevel] = useState<SimLevel | null>(null);
  const [config, setConfig] = useState<SimConfig>({});
  const [result, setResult] = useState<SimResult | SimRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !id) return;
    api
      .simLevel(userId, id)
      .then((lv) => {
        setLevel(lv);
        setConfig(lv.start.config);
        setResult(lv.start);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [userId, id]);

  if (error && !level) {
    return (
      <SafeAreaView style={styles.centered}>
        <Mascot mood="sad" size={110} />
        <Text style={[type.small, { textAlign: 'center' }]}>{error}</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
      </SafeAreaView>
    );
  }
  if (!level || !result) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.pink} />
      </SafeAreaView>
    );
  }

  const dirty = JSON.stringify(config) !== JSON.stringify(result.config);
  const ran = 'attempts' in result ? result : null;
  const states: Record<string, NodeState> = {};
  for (const [node, load] of Object.entries(result.states)) states[node] = LOAD[load];

  async function run() {
    if (!userId || !level) return;
    setRunning(true);
    setError(null);
    try {
      const res = await api.simRun(userId, level.id, config);
      setResult(res);
      play(res.passed ? (res.first_solve ? 'goal' : 'right') : 'wrong');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          res.passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
        ).catch(() => {});
      }
      if (res.bits_earned) refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const set = (knob: string, value: number | boolean) => setConfig((c) => ({ ...c, [knob]: value }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
          <Icon name="close" size={26} color={colors.muted} strokeWidth={2.6} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {level.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 120 + insets.bottom }]}>
        <Text style={type.body}>{level.story}</Text>

        <Diagram key={result.diagram.nodes.map((n) => n.id).join()} diagram={result.diagram} states={states} />

        <View style={styles.checks}>
          {result.checks.map((c) => (
            <Chamfer key={c.id} cut={10} fill={colors.card} stroke={c.ok ? colors.jadeDark : colors.rubyDark} style={styles.check}>
              <View style={styles.checkHead}>
                <View style={[styles.led, { backgroundColor: c.ok ? colors.jade : colors.ruby }]} />
                <Text style={type.tiny}>{c.label}</Text>
              </View>
              <Text style={[styles.checkValue, { color: c.ok ? colors.jadeText : colors.rubyText }]} accessibilityLabel={`${c.label}: ${show(c)}, ${target(c)}`}>
                {show(c)}
              </Text>
              <Text style={type.tiny}>{target(c)}</Text>
            </Chamfer>
          ))}
        </View>

        <View style={styles.verdict} accessibilityLiveRegion="polite">
          <Mascot mood={result.passed ? 'happy' : 'sad'} size={56} bounce />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type.body}>{dirty ? 'Settings changed. Run it to see what happens.' : result.verdict}</Text>
            {!dirty && ran?.first_solve ? (
              <View style={styles.reward}>
                <BitToken size={20} />
                <Text style={styles.rewardText}>+{ran.bits_earned} bits</Text>
              </View>
            ) : null}
            {!dirty && result.passed ? <Text style={type.small}>{level.teaches}</Text> : null}
            {!dirty && ran?.passed && ran.best_cost !== null ? (
              <Text style={type.tiny}>Your cheapest fix so far: ${ran.best_cost.toLocaleString()} a month. Can you beat it?</Text>
            ) : null}
          </View>
        </View>

        <Text style={type.heading}>Your settings</Text>
        {level.knobs.map((k) => (
          <Knob key={k.id} knob={k} value={config[k.id]} locked={!!k.needs && config[k.needs] !== true} onChange={(v) => set(k.id, v)} />
        ))}
        {error ? <Text style={[type.small, { color: colors.rubyText }]}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space(3) }]}>
        <Button title={dirty ? 'Run it' : result.passed ? 'Run again' : 'Run it'} loading={running} onPress={run} />
      </View>
    </SafeAreaView>
  );
}

function Knob({ knob, value, locked, onChange }: { knob: SimKnob; value: number | boolean; locked: boolean; onChange: (v: number | boolean) => void }) {
  const price =
    knob.type === 'int' ? `$${knob.unit_cost} each` : knob.type === 'bool' ? `$${knob.cost} a month` : 'priced by size';
  return (
    <View style={[styles.knob, locked && { opacity: 0.45 }]}>
      <View style={styles.knobHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.knobLabel}>{knob.label}</Text>
          <Text style={type.tiny}>{locked ? 'Turn the queue on first' : price}</Text>
        </View>
        {knob.type === 'int' ? (
          <View style={styles.stepper}>
            <Step icon="minus" label={`Fewer ${knob.label.toLowerCase()}`} disabled={locked || (value as number) <= knob.min!} onPress={() => onChange((value as number) - 1)} />
            <Text style={styles.stepValue} accessibilityLabel={`${knob.label}: ${value}`}>
              {value as number}
            </Text>
            <Step icon="plus" label={`More ${knob.label.toLowerCase()}`} disabled={locked || (value as number) >= knob.max!} onPress={() => onChange((value as number) + 1)} />
          </View>
        ) : knob.type === 'bool' ? (
          <Switch
            accessibilityLabel={knob.label}
            value={value as boolean}
            disabled={locked}
            onValueChange={(v) => {
              play('tap');
              onChange(v);
            }}
            trackColor={{ false: colors.border, true: colors.pinkDark }}
            thumbColor={value ? colors.pink : colors.muted}
            ios_backgroundColor={colors.border}
            {...(Platform.OS === 'web' ? { activeThumbColor: colors.pink } : null)}
          />
        ) : null}
      </View>
      {knob.type === 'choice' ? (
        <View style={styles.options}>
          {knob.options!.map((o) => (
            <Chip key={o.value} label={o.cost ? `${o.label}, $${o.cost}` : o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Step({ icon, label, disabled, onPress }: { icon: 'minus' | 'plus'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        play('tap');
        onPress();
      }}
      style={({ pressed }) => [styles.step, disabled && { opacity: 0.35 }, pressed && { backgroundColor: colors.chosen }]}
    >
      <Icon name={icon} size={20} color={colors.text} strokeWidth={2.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space(6), gap: space(4) },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space(4), paddingHorizontal: space(5), paddingVertical: space(3) },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 22, color: colors.text },
  body: { padding: space(5), paddingTop: space(1), gap: space(4) },
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  check: { flexGrow: 1, flexBasis: '45%', padding: space(3), gap: 2 },
  checkHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  led: { width: 7, height: 7, borderRadius: 4 },
  checkValue: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 28 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rewardText: { fontFamily: fonts.displayBold, fontSize: 17, color: colors.gold },
  knob: { backgroundColor: colors.card, borderRadius: radius.md, padding: space(3), gap: space(3) },
  knobHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  knobLabel: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  step: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.cardRaised, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 34, textAlign: 'center', fontFamily: fonts.displayBold, fontSize: 22, color: colors.text },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space(5),
    paddingTop: space(3),
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
