import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PathLesson, PathUnit, TrackPath } from '../lib/api';
import { useEnter, useLoop, useReduceMotion } from '../lib/motion';
import { play } from '../lib/sound';
import { colors, fonts, space, type } from '../lib/theme';
import { Icon } from './Icon';
import { Hex, hexHeight } from './shapes';

const NODE = 72;
const NODE_H = hexHeight(NODE);
const ROW = 98; // vertical distance between one node and the next
const MARGIN = 26;
const LABEL_W = 136;
const WIRE = 3;
const LIVE = '#4A3545';

type Point = { x: number; y: number };

/** One request travelling along a wire: across, then down, fading in and out at the ends. */
function Packet({ from, corner, to, delay }: { from: Point; corner: Point; to: Point; delay: number }) {
  const t = useLoop(2400, delay);
  const across = Math.abs(corner.x - from.x);
  const turn = across / (across + Math.abs(to.y - corner.y));
  return (
    <Animated.View
      style={[
        styles.packet,
        {
          opacity: t.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, turn, 1], outputRange: [from.x - 4, corner.x - 4, to.x - 4] }) },
            { translateY: t.interpolate({ inputRange: [0, turn, 1], outputRange: [from.y - 4, corner.y - 4, to.y - 4] }) },
          ],
        },
      ]}
    />
  );
}

function Node({ lesson, at, index, onOpen }: { lesson: PathLesson; at: Point; index: number; onOpen: (l: PathLesson) => void }) {
  const reduce = useReduceMotion();
  const enter = useEnter(index * 70);
  const isNext = lesson.status === 'next';
  const locked = lesson.status === 'locked';
  const pulse = useLoop(1800, 0, isNext && !reduce);
  return (
    <Animated.View style={[styles.node, { left: at.x, top: at.y, opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
      {isNext ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
            },
          ]}
        >
          <Hex width={NODE} fill={colors.pink} />
        </Animated.View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${lesson.title}, ${locked ? 'locked' : isNext ? 'start lesson' : 'done, practise again'}`}
        accessibilityState={{ disabled: locked }}
        disabled={locked}
        onPress={() => {
          play('tap');
          onOpen(lesson);
        }}
        style={({ pressed }) => (pressed ? { transform: [{ scale: 0.94 }] } : null)}
      >
        {isNext ? (
          <Hex width={NODE} fill={colors.pink}>
            <Icon name="play" size={30} color={colors.pinkInk} strokeWidth={1.5} />
          </Hex>
        ) : locked ? (
          <Hex width={NODE} fill={colors.bg} stroke={colors.border} strokeWidth={3}>
            <Icon name="lock" size={24} color={colors.faint} />
          </Hex>
        ) : (
          <Hex width={NODE} fill={colors.card} stroke={colors.pinkDark} strokeWidth={3}>
            <Icon name="check" size={30} color={colors.pink} strokeWidth={3} />
          </Hex>
        )}
      </Pressable>
    </Animated.View>
  );
}

function Unit({ unit, width, offset, onOpen }: { unit: PathUnit; width: number; offset: number; onOpen: (l: PathLesson) => void }) {
  const reduce = useReduceMotion();
  const done = unit.lessons.filter((l) => l.status === 'done').length;
  const pos = unit.lessons.map((_, i): Point => ({ x: i % 2 === 0 ? MARGIN : width - MARGIN - NODE, y: i * ROW }));
  const height = (unit.lessons.length - 1) * ROW + NODE_H + 44;
  const [fill] = useState(() => new Animated.Value(0));
  // The progress line fills when the unit first appears.
  useEffect(() => {
    Animated.timing(fill, { toValue: 1, duration: 600, delay: 150, useNativeDriver: true }).start();
  }, [fill]);

  return (
    <View style={{ gap: space(4) }}>
      <View style={{ gap: 4 }}>
        <View style={styles.rowBetween}>
          <Text style={type.tiny}>Unit {unit.number}</Text>
          <Text style={type.tiny}>
            {done} of {unit.lessons.length} online
          </Text>
        </View>
        <Text style={styles.unitTitle}>{unit.title}</Text>
        <View style={styles.track}>
          <Animated.View
            style={[styles.trackFill, { width: `${(done / Math.max(1, unit.lessons.length)) * 100}%`, transform: [{ scaleX: fill }] }]}
          />
        </View>
      </View>

      <View style={{ height }}>
        {unit.lessons.slice(0, -1).map((lesson, i) => {
          const a = pos[i];
          const b = pos[i + 1];
          const leftToRight = a.x < b.x;
          const from = { x: leftToRight ? a.x + NODE : a.x, y: a.y + NODE_H / 2 };
          const corner = { x: b.x + NODE / 2, y: from.y };
          const to = { x: corner.x, y: b.y };
          const live = lesson.status === 'done';
          const left = Math.min(from.x, corner.x);
          return (
            <View key={lesson.id} style={StyleSheet.absoluteFill} pointerEvents="none">
              <View
                style={[
                  styles.wire,
                  { left, top: from.y - WIRE / 2, width: Math.abs(corner.x - from.x) + WIRE / 2 },
                  live ? { backgroundColor: LIVE, height: WIRE } : styles.dashH,
                ]}
              />
              <View
                style={[
                  styles.wire,
                  { left: corner.x - WIRE / 2, top: from.y - WIRE / 2, height: to.y - from.y + WIRE / 2 },
                  live ? { backgroundColor: LIVE, width: WIRE } : styles.dashV,
                ]}
              />
              {live && !reduce ? (
                <>
                  <Packet from={from} corner={corner} to={to} delay={(i % 3) * 350} />
                  <Packet from={from} corner={corner} to={to} delay={1200 + (i % 3) * 350} />
                </>
              ) : null}
            </View>
          );
        })}
        {unit.lessons.map((lesson, i) => (
          <View key={lesson.id} style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Node lesson={lesson} at={pos[i]} index={offset + i} onOpen={onOpen} />
            <Text
              style={[
                styles.label,
                { left: Math.max(0, Math.min(width - LABEL_W, pos[i].x + NODE / 2 - LABEL_W / 2)), top: pos[i].y + NODE_H + 6 },
                lesson.status === 'next' && { color: colors.text, fontFamily: fonts.bodyBold },
                lesson.status === 'locked' && { color: colors.faint },
              ]}
              numberOfLines={2}
            >
              {lesson.title}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A track drawn as a system coming online. Lessons are nodes joined by wires, like the
 * diagrams inside the lessons: finished ones carry traffic toward the next, which pulses
 * until you bring it up. Locked ones wait on dashed wires.
 */
export function SystemMap({ path, onOpen }: { path: TrackPath; onOpen: (lesson: PathLesson) => void }) {
  const [width, setWidth] = useState(0);
  const starts = path.units.map((_, i) => path.units.slice(0, i).reduce((n, u) => n + u.lessons.length, 0));
  return (
    <View style={{ gap: space(6) }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0
        ? path.units.map((unit, i) => <Unit key={unit.id} unit={unit} width={width} offset={starts[i]} onOpen={onOpen} />)
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  unitTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.text },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden', marginTop: 4 },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: colors.pink, transformOrigin: 'left' },
  node: { position: 'absolute', width: NODE, height: NODE_H },
  wire: { position: 'absolute' },
  dashH: { height: 0, borderTopWidth: WIRE, borderColor: colors.border, borderStyle: 'dashed' },
  dashV: { width: 0, borderLeftWidth: WIRE, borderColor: colors.border, borderStyle: 'dashed' },
  packet: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.pink,
    shadowColor: colors.pink,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  label: { position: 'absolute', width: LABEL_W, textAlign: 'center', fontFamily: fonts.body, fontSize: 13.5, lineHeight: 17, color: colors.muted },
});
