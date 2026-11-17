/**
 * The learning path for one track: a bold banner per unit, then its lessons as big
 * tappable discs along a winding trail. Done lessons are filled in, the next one wears a
 * gold ring with a "Start" flag and the llama beside it, later ones are locked.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, Pattern, Rect } from 'react-native-svg';

import type { PathLesson, TrackPath } from '../lib/api';
import { colors, fonts, radius, space } from '../lib/theme';
import { Icon, trackIcon, type IconName } from './Icon';
import { Mascot } from './Mascot';

const NODE = 80;
const ROW = 164; // vertical distance between discs
const TOP = 44; // room above the first disc for the "Start" flag
const LABEL_W = 180;
const MASCOT = 104;
// Horizontal sway of the trail, repeating every 8 lessons.
const SWAY = [0, 48, 68, 48, 0, -48, -68, -48];

export function PathView({ path, onOpen }: { path: TrackPath; onOpen: (lesson: PathLesson) => void }) {
  const [width, setWidth] = useState(0);
  const icon = trackIcon(path.track.icon);
  // Running lesson index at the start of each unit, so the sway continues from one unit to the next.
  const starts = path.units.map((_, i) => path.units.slice(0, i).reduce((n, u) => n + u.lessons.length, 0));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: space(2) }}>
      {path.units.map((unit, unitIndex) => {
        const done = unit.lessons.filter((l) => l.status === 'done').length;
        return (
          <View key={unit.id}>
            <View style={styles.banner}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.bannerKicker}>
                  Unit {unit.number}, {done} of {unit.lessons.length} lessons
                </Text>
                <Text style={styles.bannerTitle}>{unit.title}</Text>
                <View style={styles.bannerTrack}>
                  <View style={[styles.bannerFill, { width: `${(done / Math.max(1, unit.lessons.length)) * 100}%` }]} />
                </View>
              </View>
              <View style={styles.bannerIcon}>
                <Icon name={icon} size={30} color={colors.pink} strokeWidth={2.6} />
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
  const height = TOP + (lessons.length - 1) * ROW + NODE + 70;

  return (
    <View style={{ height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="dots" width={22} height={22} patternUnits="userSpaceOnUse">
            <Circle cx={2} cy={2} r={1.4} fill={colors.card} />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill="url(#dots)" />
        {pts.slice(0, -1).map((a, i) => {
          const b = pts[i + 1];
          const walked = lessons[i].status === 'done';
          return (
            <Path
              key={i}
              d={`M${a.x} ${a.y} C${a.x} ${a.y + ROW / 2} ${b.x} ${b.y - ROW / 2} ${b.x} ${b.y}`}
              stroke={walked ? colors.pinkDark : colors.cardRaised}
              strokeWidth={16}
              strokeLinecap="round"
              fill="none"
            />
          );
        })}
        {pts.map((p, i) => (
          <Ellipse key={i} cx={p.x} cy={p.y + NODE / 2 + 3} rx={NODE / 2 - 2} ry={9} fill="#18050F" />
        ))}
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
              <>
                <View style={{ position: 'absolute', left: mascotLeft, top: top - 22 }} pointerEvents="none">
                  <Mascot mood="idle" size={MASCOT} />
                </View>
                <View style={[styles.flag, { left: x - 36, top: top - 40 }]} pointerEvents="none">
                  <Text style={styles.flagText}>Start</Text>
                  <View style={styles.flagTail} />
                </View>
              </>
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
                pressed && { borderBottomWidth: 3, marginTop: 5 },
              ]}
            >
              {lesson.status === 'done' ? (
                <Icon name="check" size={36} color={colors.pinkInk} strokeWidth={3.4} />
              ) : locked ? (
                <Icon name="lock" size={28} color={colors.faint} />
              ) : (
                <Icon name={icon} size={36} color={colors.pinkInk} strokeWidth={2.8} />
              )}
            </Pressable>
            <View style={[styles.label, { left: x - LABEL_W / 2, top: top + NODE + 12 }]} pointerEvents="none">
              <View style={styles.labelBack}>
                <Text style={[styles.labelText, locked && { color: colors.faint }]} numberOfLines={2}>
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.pink,
    borderRadius: radius.lg,
    borderBottomWidth: 6,
    borderBottomColor: colors.pinkDark,
    paddingVertical: space(4),
    paddingHorizontal: space(4),
  },
  bannerKicker: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#6B1747' },
  bannerTitle: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 28, color: colors.pinkInk },
  bannerTrack: { height: 8, borderRadius: 4, backgroundColor: colors.pinkDark, marginTop: space(2), overflow: 'hidden' },
  bannerFill: { height: 8, borderRadius: 4, backgroundColor: colors.pinkInk },
  bannerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.pinkInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  node: {
    position: 'absolute',
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardRaised,
    borderWidth: 3,
    borderBottomWidth: 8,
    borderColor: colors.border,
    borderBottomColor: '#3A0E2B',
  },
  nodeDone: { backgroundColor: colors.pink, borderColor: colors.pink, borderBottomColor: colors.pinkDark },
  nodeNext: { backgroundColor: colors.pink, borderWidth: 4, borderColor: colors.gold, borderBottomColor: colors.goldDark },
  flag: {
    position: 'absolute',
    width: 72,
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 3,
  },
  flagText: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.pinkInk },
  flagTail: {
    position: 'absolute',
    bottom: -5,
    width: 12,
    height: 12,
    backgroundColor: colors.gold,
    transform: [{ rotate: '45deg' }],
    zIndex: -1,
  },
  label: { position: 'absolute', width: LABEL_W, alignItems: 'center' },
  // Solid backing so the trail passes behind the title instead of through it.
  labelBack: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: space(2), paddingVertical: 3 },
  labelText: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 19, color: colors.text, textAlign: 'center' },
});
