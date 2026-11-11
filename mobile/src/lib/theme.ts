import { Platform } from 'react-native';

export const colors = {
  bg: '#0E1320',
  card: '#171E2E',
  cardRaised: '#1E2739',
  border: '#263049',
  text: '#E8ECF5',
  muted: '#8A94AD',
  accent: '#4FD1C5',
  accentDim: '#1F4D4A',
  flame: '#FF8A3D',
  good: '#3DDC97',
  goodBg: '#123829',
  bad: '#FF5D73',
  badBg: '#3D1720',
  warn: '#FFC857',
  ice: '#7CC4FF',
};

export const radius = { sm: 8, md: 14, lg: 20 };

export const space = (n: number) => n * 4;

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
