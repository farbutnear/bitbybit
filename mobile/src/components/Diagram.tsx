/**
 * Architecture diagrams drawn from data: component tiles on a small grid, joined by
 * right-angled connectors with arrowheads. Used by teaching screens (with request dots
 * flowing along the wires), and by the build / spot exercises (tappable tiles and slots).
 */
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { Diagram as DiagramData, DiagramNode } from '../lib/api';
import { colors, fonts, radius, space } from '../lib/theme';
import { Icon, type IconName } from './Icon';

/** The parts a system can be made of. `kind` values in content map to these. */
export const COMPONENTS: Record<string, { icon: IconName; name: string }> = {
  client: { icon: 'users', name: 'Users' },
  lb: { icon: 'lb', name: 'Load balancer' },
  app: { icon: 'compute', name: 'App server' },
  cache: { icon: 'caching', name: 'Cache' },
  db: { icon: 'storage', name: 'Database' },
  replica: { icon: 'storage', name: 'Read replica' },
  queue: { icon: 'async', name: 'Queue' },
  worker: { icon: 'gear', name: 'Worker' },
  cdn: { icon: 'globe', name: 'CDN' },
  box: { icon: 'box', name: 'Storage' },
};

export function componentName(kind: string): string {
  return COMPONENTS[kind]?.name ?? kind;
}

export type NodeState = 'idle' | 'selected' | 'right' | 'wrong' | 'cleared' | 'hot';

const NODE = 56;
const CELL_H = 116;
const TOP = 6;
const PAD = 8;

const STATE_STYLE: Record<NodeState, { border: string; bg: string; ink: string }> = {
  idle: { border: colors.border, bg: colors.cardRaised, ink: colors.text },
  selected: { border: colors.pink, bg: colors.chosen, ink: colors.text },
  right: { border: colors.jade, bg: colors.jadeBg, ink: colors.jadeText },
  wrong: { border: colors.ruby, bg: colors.rubyBg, ink: colors.rubyText },
  cleared: { border: colors.border, bg: colors.bg, ink: colors.faint }, // ruled out by the Tracer lens
  hot: { border: colors.gold, bg: colors.cardRaised, ink: colors.gold }, // simulator: busy enough to be slow
};

type Pt = { x: number; y: number };

/** Right-angled route between two tiles: out of the source's right side, into the target's left. */
function route(a: Pt, b: Pt): Pt[] {
  if (b.x <= a.x) return [a, b]; // same column or backwards: straight line
  const mid = (a.x + b.x) / 2;
  if (Math.abs(a.y - b.y) < 1) return [a, b];
  return [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b];
}

function trim(points: Pt[], startBy: number, endBy: number): Pt[] {
  const out = points.map((p) => ({ ...p }));
  const move = (from: Pt, toward: Pt, by: number) => {
    const d = Math.hypot(toward.x - from.x, toward.y - from.y) || 1;
    from.x += ((toward.x - from.x) / d) * by;
    from.y += ((toward.y - from.y) / d) * by;
  };
  move(out[0], out[1], startBy);
  move(out[out.length - 1], out[out.length - 2], endBy);
  return out;
}

function arrowHead(points: Pt[]): string {
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const d = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
  const ux = (tip.x - prev.x) / d;
  const uy = (tip.y - prev.y) / d;
  const bx = tip.x - ux * 8;
  const by = tip.y - uy * 8;
  return `M${tip.x} ${tip.y} L${bx - uy * 5} ${by + ux * 5} L${bx + uy * 5} ${by - ux * 5} Z`;
}

type Props = {
  diagram: DiagramData;
  /** Visual state per node id (selection, right/wrong). */
  states?: Record<string, NodeState>;
  /** For build exercises: which component currently sits in each slot. */
  fills?: Record<string, string | undefined>;
  /** The slot that the next tapped component will go into. */
  activeSlot?: string | null;
  onPressNode?: (node: DiagramNode) => void;
  /** Only slots respond to taps (build); otherwise every tile does (spot). */
  slotsOnly?: boolean;
  disabled?: boolean;
};

export function Diagram({ diagram, states, fills, activeSlot, onPressNode, slotsOnly, disabled }: Props) {
  const [width, setWidth] = useState(0);
  const cols = Math.max(...diagram.nodes.map((n) => n.x)) + 1;
  const rows = Math.floor(Math.max(...diagram.nodes.map((n) => n.y))) + 1;
  // The last row only needs room for its tile, label and note, not a full cell.
  const height = (rows - 1) * CELL_H + TOP + NODE + 54;
  const cellW = width / cols;

  const centre = useMemo(() => {
    const m: Record<string, Pt> = {};
    for (const n of diagram.nodes) m[n.id] = { x: (n.x + 0.5) * cellW, y: n.y * CELL_H + TOP + NODE / 2 };
    return m;
  }, [diagram, cellW]);

  return (
    <View style={styles.panel}>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <>
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
              {diagram.edges.map(([from, to]) => {
                const pts = trim(route(centre[from], centre[to]), NODE / 2 + 2, NODE / 2 + 5);
                const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
                return (
                  <Path key={`${from}-${to}`} d={`${d}`} stroke={colors.faint} strokeWidth={2.5} strokeLinejoin="round" fill="none" />
                );
              })}
              {diagram.edges.map(([from, to]) => (
                <Path
                  key={`${from}-${to}-head`}
                  d={arrowHead(trim(route(centre[from], centre[to]), NODE / 2 + 2, NODE / 2 + 3))}
                  fill={colors.faint}
                />
              ))}
            </Svg>

            {(diagram.flows ?? []).map((flow, i) => (
              <FlowDot
                key={i}
                points={flow.path.slice(0, -1).flatMap((id, k) => {
                  const seg = route(centre[id], centre[flow.path[k + 1]]);
                  return k === 0 ? seg : seg.slice(1);
                })}
                slow={flow.speed === 'slow'}
                delay={i * 450}
              />
            ))}

            {diagram.nodes.map((n) => {
              const c = centre[n.id];
              const isSlot = n.kind === 'slot';
              const filled = isSlot ? fills?.[n.id] : undefined;
              const kind = filled ?? n.kind;
              const state: NodeState = states?.[n.id] ?? (isSlot && activeSlot === n.id ? 'selected' : 'idle');
              const st = STATE_STYLE[state];
              const pressable = !!onPressNode && !disabled && state !== 'cleared' && (!slotsOnly || isSlot);
              const label = isSlot ? (filled ? componentName(filled) : '') : n.label;
              const empty = isSlot && !filled;
              return (
                <View key={n.id} style={[styles.cell, { left: c.x - cellW / 2, top: c.y - NODE / 2, width: cellW }]}>
                  <Pressable
                    accessibilityRole={pressable ? 'button' : 'image'}
                    accessibilityLabel={empty ? 'Empty slot' : `${label}${n.note ? `, ${n.note}` : ''}`}
                    accessibilityState={{ selected: state === 'selected', disabled: !pressable }}
                    disabled={!pressable}
                    onPress={() => onPressNode?.(n)}
                    style={[
                      styles.node,
                      { backgroundColor: empty ? 'transparent' : st.bg, borderColor: st.border },
                      empty && { borderStyle: 'dashed', borderColor: state === 'selected' ? colors.pink : colors.faint },
                      pressable && !empty && styles.raised,
                    ]}
                  >
                    {empty ? (
                      <Text style={[styles.question, state === 'selected' && { color: colors.pink }]}>?</Text>
                    ) : (
                      <Icon name={COMPONENTS[kind]?.icon ?? 'compute'} size={26} color={st.ink} />
                    )}
                  </Pressable>
                  {label ? (
                    <Text style={[styles.label, state !== 'idle' && state !== 'selected' && { color: st.ink }]} numberOfLines={2}>
                      {label}
                    </Text>
                  ) : null}
                  {n.note ? (
                    <View style={styles.note}>
                      <Text style={styles.noteText} numberOfLines={1}>
                        {n.note}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}
      </View>
    </View>
  );
}

/** A request travelling along the wires, on a loop. Skipped when the phone asks for reduced motion. */
function FlowDot({ points, slow, delay }: { points: Pt[]; slow: boolean; delay: number }) {
  const [t] = useState(() => new Animated.Value(0));
  const [still, setStill] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setStill)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: slow ? 3400 : 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(slow ? 300 : 900),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, still, slow, delay]);

  // Position along the route as a function of t, by distance travelled.
  const stops = useMemo(() => {
    const lens = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    const input = [0];
    const xs = [points[0].x];
    const ys = [points[0].y];
    let run = 0;
    lens.forEach((len, i) => {
      if (len < 0.5) return;
      run += len;
      input.push(Math.min(1, run / total));
      xs.push(points[i + 1].x);
      ys.push(points[i + 1].y);
    });
    return { input, xs, ys };
  }, [points]);

  if (still || stops.input.length < 2) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.dot,
        slow && { backgroundColor: colors.gold },
        {
          opacity: t.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: t.interpolate({ inputRange: stops.input, outputRange: stops.xs.map((x) => x - 5) }) },
            { translateY: t.interpolate({ inputRange: stops.input, outputRange: stops.ys.map((y) => y - 5) }) },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: PAD,
    paddingTop: space(3),
  },
  cell: { position: 'absolute', alignItems: 'center' },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raised: { borderBottomWidth: 5 },
  question: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.faint },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    lineHeight: 15,
    color: colors.text,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  note: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3, maxWidth: '100%' },
  noteText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.muted },
  dot: { position: 'absolute', left: 0, top: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.pink },
});
