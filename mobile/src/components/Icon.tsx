/** Hand-drawn icon set (24×24, rounded 2.2px strokes) so the UI never falls back to emoji. */
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { colors } from '../lib/theme';

export type IconName =
  | 'flame'
  | 'freeze'
  | 'trophy'
  | 'settings'
  | 'close'
  | 'check'
  | 'hint'
  | 'bell'
  | 'lock'
  | 'review'
  | 'plus'
  | 'api'
  | 'users'
  | 'lb'
  | 'gear'
  | 'globe'
  | 'box'
  | 'learn'
  | 'user'
  | 'minus'
  | 'estimation'
  | 'compute'
  | 'storage'
  | 'caching'
  | 'async'
  | 'consistency'
  | 'play'
  | 'loot';

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

export function Icon({ name, size = 24, color = colors.text, strokeWidth = 2.2 }: Props) {
  const s = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode;
  switch (name) {
    case 'flame':
      body = (
        <>
          <Path
            d="M12 2.5c.6 3.2 3.2 4.9 4.6 7.4 1.6 2.8 1.2 6.5-1.3 8.6-2.6 2.2-6.7 2-9-.6-2.1-2.4-2-6 .2-8.4.4 1.6 1.4 2.6 2.6 2.9C8.6 9.2 10.4 6 12 2.5z"
            fill={color === colors.text ? colors.gold : color}
          />
          <Path
            d="M12 12.2c1.5 1.3 2.6 2.7 2.1 4.4-.4 1.6-2.5 2.4-4 1.5-1.3-.8-1.4-2.6-.4-3.8.4.5.9.7 1.4.6-.3-1-.1-1.8.9-2.7z"
            fill="#FF8A3D"
          />
        </>
      );
      break;
    case 'freeze':
      body = <Path {...s} d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6.5l2.5-2M9.5 19.5l2.5-2 2.5 2" />;
      break;
    case 'trophy':
      body = <Path {...s} d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" />;
      break;
    case 'settings':
      body = (
        <>
          <Path {...s} d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <Circle {...s} cx={16} cy={7} r={2} />
          <Circle {...s} cx={10} cy={17} r={2} />
        </>
      );
      break;
    case 'close':
      body = <Path {...s} d="M6 6l12 12M18 6 6 18" />;
      break;
    case 'play':
      body = <Path d="M8 5.5v13l11-6.5z" fill={color} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
      break;
    case 'loot':
      body = <Path {...s} d="M5 8.5l7-4 7 4-7 4zM5 8.5v7l7 4 7-4v-7M12 12.5v7" />;
      break;
    case 'check':
      body = <Path {...s} d="M5 12.5 9.5 17 19 7.5" />;
      break;
    case 'hint':
      body = <Path {...s} d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />;
      break;
    case 'bell':
      body = <Path {...s} d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0" />;
      break;
    case 'lock':
      body = (
        <>
          <Rect {...s} x={5} y={10.5} width={14} height={10} rx={2.5} />
          <Path {...s} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </>
      );
      break;
    case 'review':
      body = <Path {...s} d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5" />;
      break;
    case 'plus':
      body = <Path {...s} d="M12 5v14M5 12h14" />;
      break;
    case 'api':
      body = <Path {...s} d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 5l-3 14" />;
      break;
    case 'users':
      body = (
        <>
          <Circle {...s} cx={12} cy={8} r={3.6} />
          <Path {...s} d="M5 20c.6-4 3.4-6 7-6s6.4 2 7 6" />
        </>
      );
      break;
    case 'user':
      body = (
        <>
          <Circle {...s} cx={12} cy={8.5} r={3.8} />
          <Path {...s} d="M4.5 20.5c.8-4.2 3.8-6.3 7.5-6.3s6.7 2.1 7.5 6.3" />
        </>
      );
      break;
    case 'lb':
      body = (
        <>
          <Path {...s} d="M3 12h6M9 12c3 0 3-6 6-6h5M9 12c3 0 3 6 6 6h5M9 12h11" />
          <Path {...s} d="M17.5 3.5 20 6l-2.5 2.5M17.5 9.5 20 12l-2.5 2.5M17.5 15.5 20 18l-2.5 2.5" />
        </>
      );
      break;
    case 'gear':
      body = (
        <>
          <Circle {...s} cx={12} cy={12} r={3.2} />
          <Path {...s} d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9" />
        </>
      );
      break;
    case 'globe':
      body = (
        <>
          <Circle {...s} cx={12} cy={12} r={8.5} />
          <Path {...s} d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z" />
        </>
      );
      break;
    case 'box':
      body = <Path {...s} d="M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4 8-4M12 12v8" />;
      break;
    case 'learn':
      body = (
        <>
          <Circle {...s} cx={6} cy={18} r={2.4} />
          <Circle {...s} cx={18} cy={6} r={2.4} />
          <Path {...s} d="M8.4 18H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h5.6" />
        </>
      );
      break;
    case 'minus':
      body = <Path {...s} d="M5 12h14" />;
      break;
    case 'estimation':
      body = (
        <>
          <Path {...s} d="M4.5 16a7.5 7.5 0 1 1 15 0M12 16l3.5-4.5" />
          <Circle cx={12} cy={16} r={1.4} fill={color} />
        </>
      );
      break;
    case 'compute':
      body = (
        <>
          <Rect {...s} x={4} y={4} width={16} height={6.5} rx={2} />
          <Rect {...s} x={4} y={13.5} width={16} height={6.5} rx={2} />
          <Circle cx={8} cy={7.25} r={1.1} fill={color} />
          <Circle cx={8} cy={16.75} r={1.1} fill={color} />
        </>
      );
      break;
    case 'storage':
      body = (
        <>
          <Ellipse {...s} cx={12} cy={6} rx={7} ry={2.6} />
          <Path {...s} d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" />
        </>
      );
      break;
    case 'caching':
      body = <Path {...s} d="M13 3 5.5 13.5H11L10 21l8-10.5h-5.5L13 3z" />;
      break;
    case 'async':
      body = <Path {...s} d="M4 7h12M4 12h9M4 17h5M14 17h7M18.5 14.5 21 17l-2.5 2.5" />;
      break;
    case 'consistency':
      body = (
        <>
          <Circle {...s} cx={12} cy={5} r={2.4} />
          <Circle {...s} cx={5} cy={18} r={2.4} />
          <Circle {...s} cx={19} cy={18} r={2.4} />
          <Path {...s} d="M10.8 7.1 6.2 15.9M13.2 7.1l4.6 8.8M7.4 18h9.2" />
        </>
      );
      break;
  }
  // The wrapping View keeps the icon above absolutely positioned backgrounds (hexagons, cut-corner panels) on web.
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {body}
      </Svg>
    </View>
  );
}

const TRACK_ICONS: Record<string, IconName> = {
  estimation: 'estimation',
  compute: 'compute',
  storage: 'storage',
  caching: 'caching',
  async: 'async',
  consistency: 'consistency',
  api: 'api',
};

/** Maps the icon name a track carries in the course content to an icon we have. */
export function trackIcon(name: string): IconName {
  return TRACK_ICONS[name] ?? 'compute';
}
