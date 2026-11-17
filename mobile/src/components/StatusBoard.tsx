import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import type { UptimeDay, UserSummary } from '../lib/api';
import { useLoop, useReduceMotion } from '../lib/motion';
import { colors, fonts, space, type } from '../lib/theme';
import { Mascot } from './Mascot';
import { Chamfer } from './shapes';

/** The pool of light the llama stands in. It breathes slowly. */
export function FloorLight({ width }: { width: number }) {
  const reduce = useReduceMotion();
  const t = useLoop(3200, 0, !reduce);
  const h = Math.round(width * 0.2);
  return (
    <Animated.View
      style={{ opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.75, 1, 0.75] }) }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={h}>
        <Defs>
          <RadialGradient id="floor" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={colors.pink} stopOpacity={0.55} />
            <Stop offset="1" stopColor={colors.pink} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width / 2} cy={h / 2} rx={width / 2} ry={h / 2} fill="url(#floor)" />
      </Svg>
    </Animated.View>
  );
}

/** The llama on its light, bobbing gently. */
export function LlamaStage({ size, mood = 'idle' }: { size: number; mood?: 'idle' | 'happy' | 'sad' }) {
  const reduce = useReduceMotion();
  const t = useLoop(3200, 0, !reduce);
  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <Animated.View style={{ transform: [{ translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] }) }] }}>
        <Mascot mood={mood} size={size} />
      </Animated.View>
      <View style={{ marginTop: -Math.round(size * 0.12) }}>
        <FloorLight width={Math.round(size * 0.85)} />
      </View>
    </View>
  );
}

const BAR = { met: colors.pink, frozen: colors.ice, missed: colors.border } as const;

function Bar({ day, index }: { day: UptimeDay; index: number }) {
  const reduce = useReduceMotion();
  const [grow] = useState(() => new Animated.Value(0));
  const blink = useLoop(1600, 0, day.state === 'today' && !reduce);
  useEffect(() => {
    Animated.timing(grow, { toValue: 1, duration: 320, delay: index * 35, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [grow, index]);
  const today = day.state === 'today';
  return (
    <Animated.View
      style={[
        styles.bar,
        today ? styles.barToday : { backgroundColor: BAR[day.state as keyof typeof BAR] },
        { transform: [{ scaleY: grow }], opacity: today ? blink.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.4, 1] }) : 1 },
      ]}
    />
  );
}

/**
 * The home screen's status board: your streak shown the way a status page shows uptime.
 * Each bar is a day. Pink: goal met. Ice: a freeze covered it. Dark: missed. Outlined: today.
 */
export function StatusBoard({ user }: { user: UserSummary }) {
  const { streak } = user;
  const done = Math.min(user.today_count, user.daily_goal);
  const status = user.goal_met_today
    ? { text: 'all green today', color: colors.jadeText }
    : streak.at_risk
      ? { text: 'at risk today', color: colors.gold }
      : streak.current > 0
        ? { text: 'streak live', color: colors.jadeText }
        : { text: 'offline', color: colors.muted };
  const met = user.history.filter((d) => d.state === 'met').length;
  return (
    <Chamfer cut={16} fill={colors.card} stroke={colors.border} style={styles.board}>
      <LlamaStage size={104} />
      <View style={styles.right}>
        <View style={styles.rowBetween}>
          <Text style={type.tiny}>Uptime</Text>
          <View style={styles.status}>
            <View style={[styles.led, { backgroundColor: status.color }]} />
            <Text style={[type.tiny, { color: status.color }]}>{status.text}</Text>
          </View>
        </View>
        <Text style={styles.value} accessibilityLabel={`${streak.current} day streak`}>
          {streak.current} {streak.current === 1 ? 'day' : 'days'}
        </Text>
        <View
          style={styles.bars}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Last 14 days: goal met on ${met}. ${streak.freezes} streak ${streak.freezes === 1 ? 'freeze' : 'freezes'} held.`}
        >
          {user.history.map((day, i) => (
            <Bar key={day.date} day={day} index={i} />
          ))}
        </View>
        <View style={styles.today}>
          <Text style={type.tiny}>Today</Text>
          <View style={styles.pips}>
            {Array.from({ length: user.daily_goal }, (_, i) => (
              <View key={i} style={[styles.pip, { backgroundColor: i < done ? (user.goal_met_today ? colors.jade : colors.pink) : colors.border }]} />
            ))}
          </View>
          <Text style={[type.tiny, { color: colors.text }]}>
            {done} of {user.daily_goal}
          </Text>
        </View>
      </View>
    </Chamfer>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(3), paddingVertical: space(3) },
  right: { flex: 1, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  led: { width: 7, height: 7, borderRadius: 4 },
  value: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 34, color: colors.text },
  bars: { flexDirection: 'row', gap: 4, height: 26, alignItems: 'flex-end' },
  bar: { flex: 1, maxWidth: 10, height: 26, borderRadius: 2, transformOrigin: 'bottom' },
  barToday: { borderWidth: 1.5, borderColor: colors.pink },
  today: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: 2 },
  pips: { flex: 1, flexDirection: 'row', gap: 4 },
  pip: { flex: 1, maxWidth: 22, height: 6, borderRadius: 3 },
});
