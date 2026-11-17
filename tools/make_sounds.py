"""Synthesises bitbybit's sound effects and placeholder music loop from scratch.

Everything here is generated from maths, so the audio is original and free to ship.
Run:  python tools/make_sounds.py   (needs numpy and scipy)
"""

import wave
from pathlib import Path

import numpy as np
from scipy import signal

OUT = Path(__file__).resolve().parent.parent / "mobile" / "assets" / "sounds"
SR = 44100


def note(freq, dur, decay=7.0, harmonics=((1, 1.0), (2, 0.28), (3, 0.08)), attack=0.004, sr=SR):
    """A plucked/mallet-like tone: a few harmonics with a fast attack and exponential decay."""
    t = np.arange(int(dur * sr)) / sr
    y = sum(a * np.sin(2 * np.pi * freq * h * t) for h, a in harmonics)
    return y * np.exp(-decay * t) * np.minimum(1.0, t / attack)


def place(buf, y, at, sr=SR, wrap=False):
    i = int(at * sr)
    if wrap:
        np.add.at(buf, (i + np.arange(len(y))) % len(buf), y)
    else:
        end = min(len(buf), i + len(y))
        buf[i:end] += y[: end - i]


def lowpass(y, cutoff, sr=SR, order=2):
    b, a = signal.butter(order, cutoff / (sr / 2), "low")
    return signal.lfilter(b, a, y)


def save(name, y, sr=SR, peak=0.8):
    y = y / (np.max(np.abs(y)) or 1.0) * peak
    fade = int(0.006 * sr)  # avoid clicks at the very end
    y[-fade:] *= np.linspace(1, 0, fade)
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((y * 32767).astype("<i2").tobytes())
    print(f"{name:28s} {len(y) / sr:5.2f}s  {path.stat().st_size / 1024:7.1f} KB")


def right():
    buf = np.zeros(int(0.6 * SR))
    place(buf, note(659.25, 0.5, decay=9), 0.0)  # E5
    place(buf, note(987.77, 0.5, decay=8), 0.09)  # B5
    return buf


def wrong():
    buf = np.zeros(int(0.5 * SR))
    soft = ((1, 1.0), (3, 0.18))
    place(buf, note(196.0, 0.3, decay=10, harmonics=soft), 0.0)  # G3
    place(buf, note(155.56, 0.4, decay=8, harmonics=soft), 0.12)  # Eb3
    return lowpass(buf, 1800)


def tap():
    return note(1100, 0.06, decay=70, harmonics=((1, 1.0),))


def fanfare(extra=False):
    buf = np.zeros(int((1.9 if extra else 1.3) * SR))
    for i, f in enumerate((523.25, 659.25, 783.99, 1046.5)):  # C5 E5 G5 C6
        place(buf, note(f, 0.9, decay=5), i * 0.085)
    if extra:
        for i, f in enumerate((1318.5, 1568.0, 2093.0)):  # E6 G6 C7 sparkle
            place(buf, 0.5 * note(f, 0.8, decay=6, harmonics=((1, 1.0),)), 0.45 + i * 0.07)
        for f in (523.25, 659.25, 783.99):
            place(buf, 0.6 * note(f, 1.2, decay=3), 0.5)
    return buf


def pack():
    """A rising shimmer for opening a card pack."""
    buf = np.zeros(int(1.2 * SR))
    for i, f in enumerate((392.0, 493.88, 587.33, 783.99, 987.77, 1174.7)):
        place(buf, note(f, 0.7, decay=6), i * 0.06)
    return buf


def womp():
    """The classic comedy 'sad trombone' gesture: four falling notes, the last one drooping."""
    parts = [(233.08, 0.34), (220.0, 0.34), (207.65, 0.34), (196.0, 1.0)]
    out = []
    for i, (f, dur) in enumerate(parts):
        t = np.arange(int(dur * SR)) / SR
        last = i == len(parts) - 1
        droop = 1 - 0.07 * (t / dur) ** 2 if last else 1.0
        vib = 1 + (0.012 * np.sin(2 * np.pi * 5.5 * t) * (t / dur) if last else 0)
        phase = 2 * np.pi * np.cumsum(f * droop * vib) / SR
        y = signal.sawtooth(phase) * 0.6 + np.sin(phase) * 0.4
        shape = np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / (0.25 if last else 0.05))
        out.append(y * shape)
    return lowpass(np.concatenate(out), 1400, order=3)


def music(sr=24000, bpm=84, seed=7):
    """A mellow 8-bar loop: soft electric-piano chords, a sub bass, light drums, a sparse melody.

    Notes that ring past the end wrap round to the start, so it loops without a seam.
    """
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    n = int(32 * beat * sr)
    buf = np.zeros(n)
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)  # noqa: E731  (MIDI note -> Hz)
    chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]  # Fmaj7 Em7 Dm7 Cmaj7
    keys = ((1, 1.0), (2, 0.22), (4, 0.06))
    for c, chord in enumerate(chords):
        for bar in range(2):
            start = (c * 2 + bar) * 4 * beat
            for hit, vol in ((0.0, 1.0), (2.5 * beat, 0.6)):
                for m in chord:
                    y = note(hz(m), 2.4, decay=1.6, harmonics=keys, attack=0.012, sr=sr)
                    y *= 1 + 0.08 * np.sin(2 * np.pi * 4.5 * np.arange(len(y)) / sr)  # gentle tremolo
                    place(buf, 0.20 * vol * y, start + hit, sr, wrap=True)
            for b in (0.0, 2 * beat):  # bass on beats 1 and 3
                place(buf, 0.5 * note(hz(chord[0] - 12), 1.1, decay=2.2, harmonics=((1, 1.0), (2, 0.1)), attack=0.01, sr=sr), start + b, sr, wrap=True)
    scale = [69, 72, 74, 76, 79, 81]  # A C D E G A: fits all four chords
    for bar in range(8):
        for slot in (1.0, 2.5, 3.5):
            if rng.random() < 0.55:
                m = int(rng.choice(scale))
                place(buf, 0.16 * note(hz(m), 1.4, decay=3.0, harmonics=((1, 1.0), (2, 0.12)), attack=0.01, sr=sr), (bar * 4 + slot) * beat, sr, wrap=True)
    # drums
    t = np.arange(int(0.22 * sr)) / sr
    kick = np.sin(2 * np.pi * (45 * t + (110 - 45) * 0.05 * (1 - np.exp(-t / 0.05)))) * np.exp(-14 * t)
    b_hi, a_hi = signal.butter(2, 5000 / (sr / 2), "high")
    b_bp, a_bp = signal.butter(2, [900 / (sr / 2), 3500 / (sr / 2)], "band")
    for b in range(32):
        at = b * beat
        if b % 4 in (0, 2):
            place(buf, 0.55 * kick, at, sr, wrap=True)
        if b % 4 in (1, 3):
            noise = rng.standard_normal(int(0.16 * sr)) * np.exp(-28 * np.arange(int(0.16 * sr)) / sr)
            place(buf, 0.10 * signal.lfilter(b_bp, a_bp, noise), at, sr, wrap=True)
        for eighth, swing in ((0.0, 0.0), (0.5, 0.06)):  # swung hi-hats
            noise = rng.standard_normal(int(0.04 * sr)) * np.exp(-90 * np.arange(int(0.04 * sr)) / sr)
            place(buf, 0.035 * signal.lfilter(b_hi, a_hi, noise), at + (eighth + swing) * beat, sr, wrap=True)
    # A zero-phase filter on a tiled copy keeps the loop seam intact.
    tiled = np.tile(buf, 3)
    b, a = signal.butter(2, 5200 / (sr / 2), "low")
    return signal.filtfilt(b, a, tiled)[n : 2 * n], sr


def save_loop(name, y, sr):
    y = y / np.max(np.abs(y)) * 0.7
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((y * 32767).astype("<i2").tobytes())
    print(f"{name:28s} {len(y) / sr:5.2f}s  {path.stat().st_size / 1024:7.1f} KB")


if __name__ == "__main__":
    save("right.wav", right())
    save("wrong.wav", wrong())
    save("tap.wav", tap())
    save("done.wav", fanfare())
    save("goal.wav", fanfare(extra=True))
    save("pack.wav", pack())
    save("memes/womp.wav", womp())
    save_loop("music/placeholder-loop.wav", *music())
