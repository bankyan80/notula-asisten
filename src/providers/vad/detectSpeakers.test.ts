import { describe, expect, it } from 'vitest';
import { detectSpeakerSegments } from './detectSpeakers';

const RATE = 16000;

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(RATE * seconds));
}

function tone(seconds: number, frequency: number, amplitude = 0.5): Float32Array {
  const length = Math.round(RATE * seconds);
  const signal = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    signal[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / RATE);
  }
  return signal;
}

function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('detectSpeakerSegments — VAD + pemisah pembicara', () => {
  it('bisu total → tidak ada giliran (tidak mengarang pembicara)', () => {
    expect(detectSpeakerSegments(silence(2), RATE)).toEqual([]);
  });

  it('satu suara menerus → satu giliran, satu pembicara', () => {
    const segments = detectSpeakerSegments(tone(1, 200), RATE);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ speakerCode: 'speaker_1' });
    expect(segments[0]?.startTime).toBeGreaterThanOrEqual(0);
    expect(segments[0]?.endTime).toBeGreaterThan(0.8);
    expect(segments[0]?.endTime).toBeLessThanOrEqual(1.1);
  });

  it('dua suara berbeda frekuensi dengan jeda panjang → dua pembicara berurutan', () => {
    const signal = concat(tone(1, 200), silence(1), tone(1, 2000));
    const segments = detectSpeakerSegments(signal, RATE);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.speakerCode).toBe('speaker_1');
    expect(segments[1]?.speakerCode).toBe('speaker_2');
    // Timeline: [0–1] lalu [2–3] detik.
    expect(segments[0]?.startTime).toBeLessThan(0.1);
    expect(segments[0]?.endTime).toBeCloseTo(1, 0);
    expect(segments[1]?.startTime).toBeCloseTo(2, 0);
    expect(segments[1]?.endTime).toBeCloseTo(3, 0);
  });

  it('suara sama dipisah jeda pendek (≤ 300 ms) → disatukan jadi satu giliran', () => {
    const signal = concat(tone(1, 200), silence(0.1), tone(1, 200));
    const segments = detectSpeakerSegments(signal, RATE);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.endTime).toBeCloseTo(2.1, 0);
  });

  it('giliran sangat pendek (< 150 ms) dibuang sebagai noise', () => {
    const signal = concat(tone(1, 200), silence(0.5), tone(0.1, 2000), silence(0.5));
    const segments = detectSpeakerSegments(signal, RATE);

    expect(segments.every((segment) => segment.endTime - segment.startTime >= 0.15)).toBe(true);
    expect(segments.some((segment) => segment.speakerCode === 'speaker_2')).toBe(false);
  });

  it('sinyal terlalu pendek (kurang dari satu frame) → kosong', () => {
    expect(detectSpeakerSegments(tone(0.01, 200), RATE)).toEqual([]);
  });
});
