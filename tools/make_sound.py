#!/usr/bin/env python3
"""Синтезирует музыку и звуки для игры «Рыбалка» (чиптюн, без внешних файлов).

Запуск из корня репозитория:  python3 tools/make_sound.py
Нужны numpy и ffmpeg. Результат: src/common/snd/*.mp3
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src', 'common', 'snd')
RATE = 22050


def note(name):
    """'C4' -> частота Гц; пустая строка — пауза"""
    if not name:
        return 0.0
    base = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[name[0]]
    sharp = 1 if '#' in name else 0
    octave = int(name[-1])
    midi = (octave + 1) * 12 + base + sharp
    return 440.0 * 2 ** ((midi - 69) / 12)


def square(freq, t, duty=0.5):
    return np.where((freq * t) % 1.0 < duty, 1.0, -1.0)


def tri(freq, t):
    return 2 * np.abs(2 * ((freq * t) % 1.0) - 1) - 1


def env(n, attack=0.005, decay=0.25):
    e = np.ones(n)
    a = int(RATE * attack)
    d = int(n * decay)
    e[:a] = np.linspace(0, 1, a) if a > 0 else 1
    e[n - d:] *= np.linspace(1, 0, d)
    return e


def music(melody, bass, bpm, bars_repeat):
    beat = 60.0 / bpm
    parts = []
    for _ in range(bars_repeat):
        for (mel, bas) in zip(melody, bass):
            m_chunks = []
            for name, length in mel:
                n = int(RATE * beat * length)
                t = np.arange(n) / RATE
                f = note(name)
                m_chunks.append((square(f, t, 0.25) * 0.18 * env(n, 0.003, 0.3)) if f else np.zeros(n))
            m = np.concatenate(m_chunks)
            b_chunks = []
            for name, length in bas:
                n = int(RATE * beat * length)
                t = np.arange(n) / RATE
                f = note(name)
                b_chunks.append((tri(f, t) * 0.3 * env(n, 0.003, 0.2)) if f else np.zeros(n))
            b = np.concatenate(b_chunks)
            size = max(len(m), len(b))
            m = np.pad(m, (0, size - len(m)))
            b = np.pad(b, (0, size - len(b)))
            parts.append(m + b)
    return np.concatenate(parts)


def track_calm():
    # спокойная мелодия в до мажоре, по два такта на «фразу»
    mel = [
        [('E5', 1), ('G5', 1), ('C6', 2)],
        [('D5', 1), ('C5', 1), ('A4', 2)],
        [('G4', 1), ('A4', 1), ('C5', 2)],
        [('D5', 2), ('G4', 2)],
        [('E5', 1), ('D5', 1), ('C5', 2)],
        [('A4', 1), ('G4', 1), ('E4', 2)],
        [('F4', 1), ('G4', 1), ('A4', 2)],
        [('G4', 4)],
    ]
    bass = [
        [('C3', 4)], [('A2', 4)], [('F2', 4)], [('G2', 4)],
        [('C3', 4)], [('A2', 4)], [('F2', 2), ('G2', 2)], [('C3', 4)],
    ]
    return music(mel, bass, 96, 2)


def track_upbeat():
    mel = [
        [('C5', .5), ('E5', .5), ('G5', .5), ('E5', .5), ('C5', .5), ('E5', .5), ('G5', 1)],
        [('A5', .5), ('G5', .5), ('E5', .5), ('G5', .5), ('D5', 1), ('F5', 1)],
        [('E5', .5), ('D5', .5), ('C5', .5), ('D5', .5), ('E5', 1), ('G5', 1)],
        [('A4', .5), ('C5', .5), ('E5', .5), ('C5', .5), ('G4', 2)],
        [('F5', .5), ('E5', .5), ('D5', .5), ('C5', .5), ('D5', 1), ('E5', 1)],
        [('G5', .5), ('E5', .5), ('C5', .5), ('E5', .5), ('C5', 2)],
        [('D5', .5), ('F5', .5), ('A5', .5), ('F5', .5), ('G5', 2)],
        [('C6', 2), ('G5', 2)],
    ]
    bass = [
        [('C3', .5), ('C3', .5), ('G2', .5), ('G2', .5), ('C3', .5), ('C3', .5), ('G2', .5), ('G2', .5)],
        [('A2', .5), ('A2', .5), ('E2', .5), ('E2', .5), ('A2', .5), ('A2', .5), ('E2', .5), ('E2', .5)],
        [('F2', .5), ('F2', .5), ('C3', .5), ('C3', .5), ('F2', .5), ('F2', .5), ('C3', .5), ('C3', .5)],
        [('G2', .5), ('G2', .5), ('D3', .5), ('D3', .5), ('G2', .5), ('G2', .5), ('D3', .5), ('D3', .5)],
        [('C3', .5), ('C3', .5), ('G2', .5), ('G2', .5), ('C3', .5), ('C3', .5), ('G2', .5), ('G2', .5)],
        [('A2', .5), ('A2', .5), ('E2', .5), ('E2', .5), ('A2', .5), ('A2', .5), ('E2', .5), ('E2', .5)],
        [('F2', .5), ('F2', .5), ('C3', .5), ('C3', .5), ('G2', .5), ('G2', .5), ('G2', .5), ('G2', .5)],
        [('C3', 4)],
    ]
    return music(mel, bass, 132, 2)


def sweep(f0, f1, dur, vol=0.35, noise=0.0):
    n = int(RATE * dur)
    t = np.arange(n) / RATE
    f = np.linspace(f0, f1, n)
    phase = 2 * np.pi * np.cumsum(f) / RATE
    tone = np.sin(phase)
    nz = np.random.RandomState(1).uniform(-1, 1, n)
    return (tone * (1 - noise) + nz * noise) * vol * env(n, 0.005, 0.5)


def blips(names, dur, gap, vol=0.3):
    out = []
    for name in names:
        n = int(RATE * dur)
        t = np.arange(n) / RATE
        out.append(square(note(name), t, 0.5) * vol * env(n, 0.002, 0.4))
        out.append(np.zeros(int(RATE * gap)))
    return np.concatenate(out)


def sfx():
    return {
        'cast': sweep(900, 220, 0.35, 0.3, noise=0.6),
        'bite': blips(['A5', 'A5'], 0.08, 0.06, 0.35),
        'hook': sweep(400, 1300, 0.2, 0.35),
        'win': blips(['C5', 'E5', 'G5', 'C6'], 0.09, 0.01, 0.3),
        'lose': sweep(500, 140, 0.55, 0.3),
        'coin': blips(['G6', 'C7'], 0.07, 0.0, 0.25),
        'rare': blips(['G5', 'C6', 'E6', 'G6', 'C7'], 0.12, 0.0, 0.3),
    }


def write_mp3(samples, name):
    samples = np.clip(samples, -1, 1)
    pcm = (samples * 32767).astype(np.int16)
    fd, wav_path = tempfile.mkstemp(suffix='.wav')
    os.close(fd)
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    out = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path,
                    '-codec:a', 'libmp3lame', '-b:a', '48k', out], check=True)
    os.remove(wav_path)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    write_mp3(track_calm(), 'music_calm')
    write_mp3(track_upbeat(), 'music_upbeat')
    for k, v in sfx().items():
        write_mp3(v, 'sfx_' + k)
    print('готово:', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
