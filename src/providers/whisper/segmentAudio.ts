/**
 * Pemotongan audio panjang → beberapa segmen pendek untuk STT whisper-web.
 *
 * Kenapa: Whisper menangkap konteks terbatas; audio 5 menit (satu chunk
 * rekaman) dipotong maksimal `MAX_SEGMENT_SECONDS` (2 menit) per panggilan
 * model. Potongan diusahakan jatuh di titik PALING TENANG di sekitar batas
 * (±0.15 s) supaya kata di persimpangan tidak terpotong.
 *
 * Offset waktu tiap potongan dikembalikan sehingga hasil digabung kembali ke
 * SATU timeline rapat — bukan dua transkrip terpisah.
 *
 * Catatan teknis: potongan memakai `slice()` (bukan `subarray`) karena buffer
 * dikirim ke worker dengan `postMessage(..., [buffer])` yang MELERAVKAN buffer
 * asli — `subarray` akan ikut ter-detach.
 */
import { WHISPER_SAMPLE_RATE } from './whisperProtocol';

/** Panjang maksimum satu panggilan model (detik). */
export const MAX_SEGMENT_SECONDS = 120;

/** Potongan terlalu pendek (< detik ini) tidak dibuat — digabung saja. */
export const MIN_SEGMENT_SECONDS = 5;

const RMS_WINDOW_SECONDS = 0.01;
const QUIET_SEARCH_SECONDS = 0.15;

export interface PcmSegment {
  audio: Float32Array;
  /** Posisi awal segmen ini pada audio asli (detik). */
  offsetSeconds: number;
}

export function splitPcmForTranscription(
  pcm: Float32Array,
  options: { sampleRate?: number; maxSegmentSeconds?: number } = {},
): PcmSegment[] {
  const sampleRate = options.sampleRate ?? WHISPER_SAMPLE_RATE;
  const maxSegmentSeconds = options.maxSegmentSeconds ?? MAX_SEGMENT_SECONDS;
  const targetSamples = Math.max(1, Math.floor(maxSegmentSeconds * sampleRate));
  const totalSamples = pcm.length;

  if (totalSamples <= targetSamples) {
    return [{ audio: pcm.slice(0), offsetSeconds: 0 }];
  }

  const searchSamples = Math.floor(QUIET_SEARCH_SECONDS * sampleRate);
  const minSamples = Math.floor(MIN_SEGMENT_SECONDS * sampleRate);
  const segments: PcmSegment[] = [];
  let pos = 0;

  while (totalSamples - pos > targetSamples) {
    const targetEnd = pos + targetSamples;
    const from = Math.max(pos, targetEnd - searchSamples);
    const to = Math.min(totalSamples - minSamples, targetEnd + searchSamples);
    if (to <= from) break;

    const cut = findQuietestCut(pcm, from, to, sampleRate);
    if (cut <= pos || totalSamples - cut < minSamples) break;

    segments.push({ audio: pcm.slice(pos, cut), offsetSeconds: pos / sampleRate });
    pos = cut;
  }

  if (pos < totalSamples) {
    segments.push({ audio: pcm.slice(pos, totalSamples), offsetSeconds: pos / sampleRate });
  }

  return segments;
}

/** Titik awal jendela RMS terkecil di antara `from`..`to`. */
function findQuietestCut(pcm: Float32Array, from: number, to: number, sampleRate: number): number {
  const windowSamples = Math.max(1, Math.round(RMS_WINDOW_SECONDS * sampleRate));
  let best = from;
  let bestRms = Number.POSITIVE_INFINITY;

  for (let start = from; start + windowSamples <= to; start += windowSamples) {
    let sum = 0;
    for (let i = start; i < start + windowSamples; i += 1) {
      const value = pcm[i] ?? 0;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / windowSamples);
    if (rms < bestRms) {
      bestRms = rms;
      best = start;
    }
  }

  return best;
}
