/// <reference types="expo/types" />
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Sound effects, meme clips and background music.
 *
 * Effects are fixed files. Meme clips and music are whatever audio files sit in
 * assets/sounds/memes and assets/sounds/music: drop a file in and it is picked up
 * on the next bundle, with no code to change (see assets/sounds/README.md).
 */

const EFFECTS = {
  tap: require('../../assets/sounds/tap.wav'),
  right: require('../../assets/sounds/right.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  done: require('../../assets/sounds/done.wav'),
  goal: require('../../assets/sounds/goal.wav'),
  pack: require('../../assets/sounds/pack.wav'),
} as const;

export type Effect = keyof typeof EFFECTS;

const VOLUME: Record<Effect, number> = { tap: 0.35, right: 0.7, wrong: 0.6, done: 0.75, goal: 0.8, pack: 0.75 };
const MEME_VOLUME = 0.8;
const MUSIC_VOLUME = 0.22;
const PLACEHOLDER = 'placeholder-loop';

type Clip = { name: string; source: number };

function clips(ctx: __MetroModuleApi.RequireContext): Clip[] {
  return ctx
    .keys()
    .sort()
    .map((key) => ({ name: key.replace(/^\.\//, '').replace(/\.[^.]+$/, ''), source: ctx<number>(key) }));
}

const MEMES = clips(require.context('../../assets/sounds/memes', false, /\.(mp3|wav|m4a|aac)$/i));
const ALL_MUSIC = clips(require.context('../../assets/sounds/music', false, /\.(mp3|wav|m4a|aac)$/i));
// The built-in loop is only a stand-in: once you add your own tracks, they replace it.
const OWN_MUSIC = ALL_MUSIC.filter((c) => c.name !== PLACEHOLDER);
const MUSIC = OWN_MUSIC.length ? OWN_MUSIC : ALL_MUSIC;

export const soundLibrary = {
  memes: MEMES.map((c) => c.name),
  music: MUSIC.map((c) => c.name),
  usingPlaceholderMusic: OWN_MUSIC.length === 0 && ALL_MUSIC.length > 0,
};

// ---------- preferences ----------

export type SoundPrefs = { effects: boolean; memes: boolean; music: boolean };

const KEY = 'bitbybit.sound';
const DEFAULTS: SoundPrefs = { effects: true, memes: true, music: true };

let prefs: SoundPrefs = DEFAULTS;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSoundPrefs(): SoundPrefs {
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => prefs,
  );
}

export function setSoundPref(key: keyof SoundPrefs, value: boolean) {
  prefs = { ...prefs, [key]: value };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
  if (key === 'music') syncMusic();
}

// ---------- playback ----------

const players = new Map<number, AudioPlayer>();
let music: AudioPlayer | null = null;
let started = false;
let active = true;
// Browsers refuse to start audio until the page has been touched.
let unlocked = Platform.OS !== 'web';

function fire(source: number, volume: number) {
  try {
    let player = players.get(source);
    if (!player) {
      player = createAudioPlayer(source);
      players.set(source, player);
    }
    player.volume = volume;
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Sound is decoration: a failed clip must never get in the way of a lesson.
  }
}

/** Plays a sound effect. A wrong answer plays a random meme clip instead when meme mode is on. */
export function play(effect: Effect) {
  if (!started || !prefs.effects) return;
  if (effect === 'wrong' && prefs.memes && MEMES.length) {
    fire(MEMES[Math.floor(Math.random() * MEMES.length)].source, MEME_VOLUME);
    return;
  }
  fire(EFFECTS[effect], VOLUME[effect]);
}

function syncMusic() {
  if (!started) return;
  try {
    if (prefs.music && active && unlocked && MUSIC.length) {
      if (!music) {
        music = createAudioPlayer(MUSIC[Math.floor(Math.random() * MUSIC.length)].source);
        music.loop = true;
        music.volume = MUSIC_VOLUME;
      }
      music.play();
    } else {
      music?.pause();
    }
  } catch {
    // As above: never let audio break the app.
  }
}

/** Call once when the app starts. Loads saved switches, then starts the music if it is on. */
export async function initSound() {
  if (started) return;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) prefs = { ...DEFAULTS, ...(JSON.parse(saved) as Partial<SoundPrefs>) };
  } catch {
    // Unreadable prefs fall back to the defaults.
  }
  listeners.forEach((l) => l());
  // Respect the phone's silent switch, and play alongside the user's own audio rather than stopping it.
  await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(
    () => {},
  );
  started = true;

  AppState.addEventListener('change', (state) => {
    active = state === 'active';
    syncMusic();
  });
  if (!unlocked && typeof document !== 'undefined') {
    const unlock = () => {
      unlocked = true;
      syncMusic();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
  }
  syncMusic();
}
