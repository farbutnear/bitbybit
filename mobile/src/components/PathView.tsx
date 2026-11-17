/**
 * The learning path for one track: a plain header per unit, then its lessons as discs on
 * a thin winding trail. Only the next lesson is pink (and has the llama beside it); done
 * lessons are quiet discs with a tick, later ones are dashed outlines.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { PathLesson, TrackPath } from '../lib/api';
import { colors, fonts, space } from '../lib/theme';
import { Icon, trackIcon, type IconName } from './Icon';
import { Mascot } from './Mascot';

const NODE = 76;
const ROW = 150; // vertical distance between discs
const TOP = 18;
const LABEL_W = 180;
const MASCOT = 100;
// Horizontal sway of the trail, repeating every 8 lessons.
const SWAY = [0, 48, 68, 48, 0, -48, -68, -48];

export function PathView({ path, onOpen }: { path: TrackPath; onOpen: (lesson: PathLesson) => void }) {
  const [width, setWidth] = useState(0);
  const icon = trackIcon(path.track.icon);
  // Running lesson index at the start of each unit, so the sway continues from one unit to the next.
  const starts = path.units.map((_, i) => path.units.slice(0, i).reduce((n, u) => n + u.lessons.length, 0));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: space(4) }}>
      {path.units.map((unit, unitIndex) => {
        const done = unit.lessons.filter((l) => l.status === 'done').length;
        return (
          <View key={unit.id}>
            <View style={styles.header}>
              <Text style={styles.kicker}>
                Unit {unit.number}, {done} of {unit.lessons.length} lessons
              </Text>
              <Text style={styles.title}>{unit.title}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(done / Math.max(1, unit.lessons.length)) * 100}%` }]} />
              </View>
            </View>
            {width > 0 ? (
              <Trail lessons={unit.lessons} start={starts[unitIndex]} width={width} icon={icon} onOpen={onOpen} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Trail({
  lessons,
  start,
  width,
  icon,
  onOpen,
}: {
  lessons: PathLesson[];
  start: number;
  width: number;
  icon: IconName;
  onOpen: (lesson: PathLesson) => void;
}) {
  const pts = lessons.map((_, i) => ({
    x: width / 2 + SWAY[(start + i) % SWAY.length],
    y: TOP + i * ROW + NODE / 2,
  }));
  const height = TOP + (lessons.length - 1) * ROW + NODE + 62;

  return (
    <View style={{ height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {pts.slice(0, -1).map((a, i) => {
          const b = pts[i + 1];
          const walked = lessons[i].status === 'done';
          return (
            <Path
              key={i}
              d={`M${a.x} ${a.y} C${a.x} ${a.y + ROW / 2} ${b.x} ${b.y - ROW / 2} ${b.x} ${b.y}`}
              stroke={walked ? colors.faint : colors.border}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={walked ? undefined : '1 14'}
              fill="none"
            />
          );
        })}
      </Svg>

      {lessons.map((lesson, i) => {
        const { x, y } = pts[i];
        const top = y - NODE / 2;
        const isNext = lesson.status === 'next';
        const locked = lesson.status === 'locked';
        // The llama stands on whichever side has more room.
        const mascotLeft = x >= width / 2 ? x - NODE / 2 - MASCOT - 2 : x + NODE / 2 + 2;
        return (
          <View key={lesson.id}>
            {isNext ? (
              <View style={{ position: 'absolute', left: mascotLeft, top: top - 22 }} pointerEvents="none">
                <Mascot mood="idle" size={MASCOT} />
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${lesson.title}, ${locked ? 'locked' : isNext ? 'start lesson' : 'done, practise again'}`}
              accessibilityState={{ disabled: locked }}
              disabled={locked}
              onPress={() => onOpen(lesson)}
              style={({ pressed }) => [
                styles.node,
                { left: x - NODE / 2, top },
                lesson.status === 'done' && styles.nodeDone,
                isNext && styles.nodeNext,
                locked && styles.nodeLocked,
                pressed && { borderBottomWidth: 2, marginTop: 4 },
              ]}
            >
              {lesson.status === 'done' ? (
                <Icon name="check" size={32} color={colors.pink} strokeWidth={3.2} />
              ) : locked ? (
                <Icon name="lock" size={26} color={colors.faint} />
              ) : (
                <Icon name={icon} size={34} color={colors.pinkInk} strokeWidth={2.8} />
              )}
            </Pressable>
            <View style={[styles.label, { left: x - LABEL_W / 2, top: top + NODE + 8 }]} pointerEvents="none">
              <View style={styles.labelBack}>
                <Text
                  style={[styles.labelText, isNext && styles.labelNext, locked && { color: colors.faint }]}
                  numberOfLines={2}
                >
                  {lesson.title}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 2, paddingHorizontal: space(1), paddingBottom: space(2) },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.faint },
  title: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 29, color: colors.text },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: space(2), overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.pink },
  node: {
    position: 'absolute',
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderBottomWidth: 6,
    borderColor: colors.border,
    borderBottomColor: colors.edge,
  },
  nodeDone: { backgroundColor: colors.card },
  nodeNext: { backgroundColor: colors.pink, borderColor: colors.pink, borderBottomColor: colors.pinkDark },
  nodeLocked: { backgroundColor: colors.bg, borderStyle: 'dashed', borderBottomWidth: 2 },
  label: { position: 'absolute', width: LABEL_W, alignItems: 'center' },
  // Solid backing so the trail passes behind the title instead of through it.
  labelBack: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: space(2), paddingVertical: 3 },
  labelText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 18, color: colors.muted, textAlign: 'center' },
  labelNext: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
});
