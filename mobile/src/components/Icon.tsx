/** Hand-drawn icon set (24×24, rounded 2.2px strokes) so the UI never falls back to emoji. */
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
  | 'estimation'
  | 'compute'
  | 'storage'
  | 'caching'
  | 'async'
  | 'consistency';

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
    case 'check':
      body = <Path {...s} d="M5 12.5 9.5 17 19 7.5" />;
      break;
    case 'hint':
      body = <Path {...s} d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />;
      break;
    case 'bell':
      body = <Path {...s} d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0" />;
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
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

export const SKILL_ICON: Record<string, IconName> = {
  estimation: 'estimation',
  compute: 'compute',
  storage: 'storage',
  caching: 'caching',
  async: 'async',
  consistency: 'consistency',
};
