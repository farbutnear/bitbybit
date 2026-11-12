import { Platform, type TextStyle } from 'react-native';

/** Raspberry night: dark berry surfaces, hot pink for action, jade/ruby for right/wrong. */
export const colors = {
  bg: '#2A0B1D',
  card: '#3E1230',
  cardRaised: '#521740',
  border: '#5C1E47',
  text: '#FFE9F3',
  muted: '#D49AB8',
  faint: '#9C6A86',

  pink: '#FF6FB8',
  pinkDark: '#C43585',
  pinkInk: '#2A0B1D', // text on pink

  gold: '#FFC857', // streak
  goldDark: '#C9932A',
  ice: '#9AD8FF', // streak freeze

  jade: '#1FAE6E',
  jadeDark: '#137548',
  jadeBg: '#0F3324',
  jadeText: '#4FD394',
  jadeSub: '#BDEBD3',

  ruby: '#D61F3C',
  rubyDark: '#94122A',
  rubyBg: '#3F0B17',
  rubyText: '#FF5A72',
  rubySub: '#FFC2CC',
};

export const radius = { sm: 10, md: 16, lg: 22 };
export const space = (n: number) => n * 4;

export const fonts = {
  display: 'Fredoka_600SemiBold',
  displayBold: 'Fredoka_700Bold',
  body: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_800ExtraBold',
  bodyRegular: 'Nunito_400Regular',
};

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Type scale (1.25 ratio from a 16px body). */
export const type: Record<'hero' | 'title' | 'heading' | 'body' | 'small' | 'tiny', TextStyle> = {
  hero: { fontFamily: fonts.displayBold, fontSize: 48, lineHeight: 52, color: colors.text },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text },
  heading: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted },
  tiny: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16, color: colors.muted },
};
