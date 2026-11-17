import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

/** Height of a pointy-top hexagon that is `width` wide, in the proportion used across the app. */
export const hexHeight = (width: number) => Math.round(width * 1.11);

/** The hexagon from the bit token: lesson nodes, gear slots, answer keys. */
export function Hex({
  width,
  fill,
  stroke,
  strokeWidth = 0,
  style,
  children,
}: {
  width: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const h = hexHeight(width);
  const i = strokeWidth / 2; // keep the stroke inside the box
  const pts = `${width / 2},${i} ${width - i},${h * 0.25} ${width - i},${h * 0.75} ${width / 2},${h - i} ${i},${h * 0.75} ${i},${h * 0.25}`;
  return (
    <View style={[{ width, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
        <Polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      </Svg>
      {children}
    </View>
  );
}

/** A panel with two corners cut off, like the gear art. Sizes itself to its content. */
export function Chamfer({
  cut = 14,
  fill,
  stroke,
  strokeWidth = 1.5,
  edge,
  edgeHeight = 0,
  style,
  children,
}: {
  cut?: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  /** A darker slab under the face, for buttons. */
  edge?: string;
  edgeHeight?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const shape = (w: number, h: number, top: number) => {
    const i = strokeWidth / 2;
    return `${i},${top + i} ${w - cut},${top + i} ${w - i},${top + cut} ${w - i},${h - i} ${cut},${h - i} ${i},${h - cut}`;
  };
  return (
    <View
      style={style}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
      }}
    >
      {size ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          {edge ? <Polygon points={shape(size.w, size.h, 0)} fill={edge} /> : null}
          <Polygon points={shape(size.w, size.h - edgeHeight, 0)} fill={fill} stroke={stroke} strokeWidth={stroke ? strokeWidth : 0} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
