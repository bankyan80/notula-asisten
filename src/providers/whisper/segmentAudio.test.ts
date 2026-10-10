import { describe, expect, it } from 'vitest';
import { MAX_SEGMENT_SECONDS, MIN_SEGMENT_SECONDS, splitPcmForTranscription } from './segmentAudio';
import { WHISPER_SAMPLE_RATE } from './whisperProtocol';

const RATE = WHISPER_SAMPLE_RATE;

function makePcm(seconds: number, fill: number): Float32Array {
  return new Float32Array(Math.floor(seconds * RATE)).fill(fill);
}

describe('splitPcmForTranscription', () => {
  it('audio pendek → satu segmen berisi seluruh sampel', () => {
    const pcm = makePcm(30, 0.5);
    const parts = splitPcmForTranscription(pcm);

    expect(parts).toHaveLength(1);
    expect(parts[0]?.offsetSeconds).toBe(0);
    expect(parts[0]?.audio).toHaveLength(pcm.length);
    expect(Array.from(parts[0]!.audio.slice(0, 4))).toEqual([pcm[0], pcm[1], pcm[2], pcm[3]]);
  });

  it('audio panjang → dipotong, semua potongan ≤ batas kecuali yang terakhir', () => {
    const pcm = makePcm(300, 0.4); // 5 menit
    const parts = splitPcmForTranscription(pcm);

    expect(parts.length).toBeGreaterThan(1);
    const limit = Math.ceil(MAX_SEGMENT_SECONDS * RATE);
    for (const part of parts.slice(0, -1)) {
      expect(part.audio.length).toBeLessThanOrEqual(limit);
      expect(part.audio.length).toBeGreaterThan(0);
    }
    // Potongan terakhir tetap memadai untuk model (tidak serpihan).
    expect(parts[parts.length - 1]!.audio.length).toBeGreaterThan(
      Math.floor(MIN_SEGMENT_SECONDS * RATE),
    );
  });

  it('offset tiap potongan menaik dan menutup seluruh audio tanpa celah', () => {
    const pcm = makePcm(300, 0.4);
    const parts = splitPcmForTranscription(pcm);

    let cursor = 0;
    for (const part of parts) {
      expect(part.offsetSeconds).toBeCloseTo(cursor / RATE, 6);
      cursor += part.audio.length;
    }
    expect(cursor).toBe(pcm.length);

    // Durasi total yang dilaporkan = durasi audio asli.
    const last = parts[parts.length - 1]!;
    const total = last.offsetSeconds + last.audio.length / RATE;
    expect(total).toBeCloseTo(300, 3);
  });

  it('potongan diarahkan ke titik paling tenang di sekitar batas, bukan potongan buta', () => {
    const target = MAX_SEGMENT_SECONDS * RATE;
    const pcm = new Float32Array(Math.floor(300 * RATE)).fill(1);
    // Jendela sunyi 0,1 s yang memuat titik batas 120 s.
    const quietStart = Math.floor(target - 0.03 * RATE);
    const quietEnd = quietStart + Math.floor(0.1 * RATE);
    for (let i = quietStart; i < quietEnd; i += 1) pcm[i] = 0;

    const parts = splitPcmForTranscription(pcm);
    expect(parts.length).toBeGreaterThan(1);

    const cut = parts[1]!.offsetSeconds * RATE;
    expect(cut).toBeGreaterThan(quietStart - RATE);
    expect(cut).toBeLessThan(quietEnd + RATE);
    expect(pcm[Math.round(cut)]).toBe(0);
    // Bukan potongan tepat di 120,000 s yang buta.
    expect(cut).not.toBe(target);
  });

  it('setiap potongan memakai BUFFER BARU (aman dikirim sebagai transferable)', () => {
    const pcm = makePcm(300, 0.3);
    const parts = splitPcmForTranscription(pcm);

    for (const part of parts) {
      expect(part.audio.buffer).not.toBe(pcm.buffer);
      expect(part.audio.byteOffset).toBe(0);
    }
  });
});
