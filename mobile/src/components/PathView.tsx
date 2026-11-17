/**
 * The learning path for one track: lessons as nodes on a winding trail, grouped by unit.
 * Done lessons are filled in, the next one is ringed and has the llama standing beside it,
 * later ones are locked.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { PathLesson, TrackPath } from '../lib/api';
import { colors, fonts, radius, space } from '../lib/theme';
import { Icon, trackIcon, type IconName } from './Icon';
import { Mascot } from './Mascot';

const NODE = 72;
const ROW = 148; // vertical distance between nodes
const LABEL_W = 176;
const MASCOT = 88;
// Horizontal sway of the trail, repeating every 8 lessons.
const SWAY = [0, 44, 64, 44, 0, -44, -64, -44];

export function PathView({ path, onOpen }: { path: TrackPath; onOpen: (lesson: PathLesson) => void }) {
  const [width, setWidth] = useState(0);
  const icon = trackIcon(path.track.icon);
  // Running lesson index at the start of each unit, so the sway continues from one unit to the next.
  const starts = path.units.map((_, i) => path.units.slice(0, i).reduce((n, u) => n + u.lessons.length, 0));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: space(5) }}>
      {path.units.map((unit, unitIndex) => {
        const start = starts[unitIndex];
        return (
          <View key={unit.id} style={{ gap: space(5) }}>
            <View style={styles.unit}>
              <View style={styles.unitBadge}>
                <Text style={styles.unitBadgeText}>Unit {unit.number}</Text>
              </View>
              <Text style={styles.unitTitle}>{unit.title}</Text>
            </View>
            {width > 0 ? <Trail lessons={unit.lessons} start={start} width={width} icon={icon} onOpen={onOpen} /> : null}
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
    y: i * ROW + NODE / 2,
  }));
  const height = (lessons.length - 1) * ROW + NODE + 56;

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
              stroke={walked ? colors.pinkDark : colors.border}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={walked ? undefined : '2 16'}
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
        const mascotLeft = x >= width / 2 ? x - NODE / 2 - MASCOT - 6 : x + NODE / 2 + 6;
        return (
          <View key={lesson.id}>
            {isNext ? (
              <View style={{ position: 'absolute', left: mascotLeft, top: top - 10 }} pointerEvents="none">
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
                pressed && { borderBottomWidth: 2, marginTop: 4 },
              ]}
            >
              {lesson.status === 'done' ? (
                <Icon name="check" size={32} color={colors.pinkInk} strokeWidth={3.2} />
              ) : locked ? (
                <Icon name="lock" size={26} color={colors.faint} />
              ) : (
                <Icon name={icon} size={32} color={colors.pinkInk} strokeWidth={2.6} />
              )}
            </Pressable>
            <View style={[styles.label, { left: x - LABEL_W / 2, top: top + NODE + 6 }]} pointerEvents="none">
              <View style={styles.labelBack}>
                <Text style={[styles.labelText, locked && { color: colors.faint }]} numberOfLines={2}>
                  {lesson.title}
                </Text>
                {isNext ? <Text style={styles.start}>Start</Text> : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  unit: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: space(4),
    gap: space(1),
  },
  unitBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cardRaised,
    borderRadius: 999,
    paddingHorizontal: space(3),
    paddingVertical: 3,
  },
  unitBadgeText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  unitTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.text },
  node: {
    position: 'absolute',
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 3,
    borderBottomWidth: 7,
    borderColor: colors.border,
    borderBottomColor: '#2F0D24',
  },
  nodeDone: { backgroundColor: colors.pink, borderColor: colors.pink, borderBottomColor: colors.pinkDark },
  nodeNext: { backgroundColor: colors.pink, borderColor: colors.gold, borderBottomColor: colors.goldDark },
  label: { position: 'absolute', width: LABEL_W, alignItems: 'center' },
  // Solid backing so the trail passes behind the title instead of through it.
  labelBack: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: space(2), paddingVertical: 3, alignItems: 'center' },
  labelText: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 18, color: colors.text, textAlign: 'center' },
  start: { fontFamily: fonts.displayBold, fontSize: 14, color: colors.gold, marginTop: 1 },
});
