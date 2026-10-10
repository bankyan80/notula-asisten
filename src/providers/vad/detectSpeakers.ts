/**
 * Diarization sederhana berbasis audio (Batch 08) — murni, tanpa DOM.
 *
 * Pendekatan (JUJUR, tanpa mengklaim identitas — PRD §13):
 * 1. VAD energi (RMS adaptif) → frame bicara.
 * 2. Gabungkan frame → giliran bicara (turn) — jeda pendek di dalam bicara
 *    disatukan, noise sesaat dibuang.
 * 3. Tiap turn diukur: zero-crossing rate + spectral centroid (FFT).
 * 4. Cluster turn sederhana (single-linkage) → kode `speaker_1..N` urut waktu.
 *
 * Batasan: pemisahan AKUSTIK sederhana — bukan identifikasi orang, bukan model
 * diarization berat. Nama hanya diberikan manual oleh pengguna (PRD §13).
 */
import type { SpeakerSegment } from '../../core/types/providers';
import { rms, spectralCentroid, zeroCrossingRate } from './features';

/** 20 ms @ 16 kHz. */
export const VAD_FRAME_SIZE = 320;
/** Gabungkan jeda ≤ 300 ms di dalam satu giliran. */
export const VAD_MERGE_GAP_SECONDS = 0.3;
/** Buang giliran lebih pendek dari ini (noise / kata singkat). */
export const VAD_MIN_TURN_SECONDS = 0.15;
/** Jumlah pembicara maksimum yang dihasilkan (di atas itu digabung). */
export const VAD_MAX_SPEAKERS = 8;

interface Turn {
  startFrame: number;
  endFrame: number; // inklusif
}

interface TurnFeature {
  zcr: number;
  centroid: number;
}

function speechThreshold(frameRms: number[]): number {
  if (frameRms.length === 0) return Infinity;
  const sorted = [...frameRms].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const peak = sorted[sorted.length - 1] ?? 0;
  if (peak <= 0) return Infinity;
  // Batas atas peak×0.6: sinyal menerus tanpa jeda (noise floor ≈ peak) tetap
  // lolos — tanpa batas ini persentil dasar akan menenggelamkan suara konstan.
  return Math.min(Math.max(noiseFloor * 1.5, peak * 0.08, 0.01), peak * 0.6);
}

function toTurns(mask: boolean[]): Turn[] {
  const turns: Turn[] = [];
  let start = -1;
  for (let i = 0; i <= mask.length; i += 1) {
    const speaking = mask[i] === true;
    if (speaking && start < 0) start = i;
    if (!speaking && start >= 0) {
      turns.push({ startFrame: start, endFrame: i - 1 });
      start = -1;
    }
  }
  return turns;
}

function mergeClose(turns: Turn[], frameSeconds: number): Turn[] {
  const merged: Turn[] = [];
  for (const turn of turns) {
    const previous = merged[merged.length - 1];
    const gapSeconds = previous
      ? (turn.startFrame - previous.endFrame - 1) * frameSeconds
      : Infinity;
    if (previous !== undefined && gapSeconds <= VAD_MERGE_GAP_SECONDS) {
      previous.endFrame = turn.endFrame;
    } else {
      merged.push({ ...turn });
    }
  }
  return merged;
}

function turnFeatures(
  signal: Float32Array,
  turn: Turn,
  sampleRate: number,
  frameSize: number,
): TurnFeature {
  let zcrSum = 0;
  let centroidSum = 0;
  let frames = 0;
  for (let frame = turn.startFrame; frame <= turn.endFrame; frame += 1) {
    const start = frame * frameSize;
    zcrSum += zeroCrossingRate(signal, start, frameSize);
    centroidSum += spectralCentroid(signal, start, frameSize, sampleRate);
    frames += 1;
  }
  return {
    zcr: frames === 0 ? 0 : zcrSum / frames,
    centroid: frames === 0 ? 0 : centroidSum / frames,
  };
}

/** Jarak antar turn: ZCR beda 0.15 ATAU beda 1.5 oktaf centroid sudah dianggap "jauh". */
function turnDistance(a: TurnFeature, b: TurnFeature): number {
  const dz = Math.abs(a.zcr - b.zcr) / 0.15;
  const aCentroid = Math.max(1, a.centroid);
  const bCentroid = Math.max(1, b.centroid);
  const dc = Math.abs(Math.log2(aCentroid) - Math.log2(bCentroid)) / 1.5;
  return dz + dc;
}

/** Single-linkage agglomerative clustering; dipaksa turun ke `maxClusters` bila meledak. */
function cluster(features: TurnFeature[], threshold: number, maxClusters: number): number[] {
  const labels = features.map((_, index) => index); // label = id cluster awal (per elemen)
  const merge = (from: number, to: number): void => {
    for (let i = 0; i < labels.length; i += 1) {
      if (labels[i] === from) labels[i] = to;
    }
  };

  for (;;) {
    const unique = new Set(labels);
    // Di atas batas: paksa merge pasangan TERDEKAT berapa pun jaraknya.
    const overCap = unique.size > maxClusters;
    let bestDistance = overCap ? Infinity : threshold;
    let bestA = -1;
    let bestB = -1;
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        if (labels[i] === labels[j]) continue;
        const distance = turnDistance(features[i]!, features[j]!);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestA = labels[i]!;
          bestB = labels[j]!;
        }
      }
    }
    if (bestA < 0) break;
    merge(bestA, bestB);
  }

  // Kunci ulang: urut kemunculan label → 0..N-1.
  const order = new Map<number, number>();
  for (const label of labels) {
    if (!order.has(label)) order.set(label, order.size);
  }
  return labels.map((label) => order.get(label) ?? 0);
}

/**
 * Deteksi giliran bicara + kode pembicara dari PCM mono 16 kHz.
 * Mengembalikan segmen SE-CHUNK (waktu relatif awal sinyal).
 */
export function detectSpeakerSegments(signal: Float32Array, sampleRate: number): SpeakerSegment[] {
  const frameSize = VAD_FRAME_SIZE;
  const frameSeconds = frameSize / sampleRate;
  const frameCount = Math.floor(signal.length / frameSize);
  if (frameCount === 0) return [];

  const frameRms: number[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    frameRms.push(rms(signal, frame * frameSize, frameSize));
  }
  const threshold = speechThreshold(frameRms);
  const mask = frameRms.map((value) => value > threshold);
  if (!mask.some(Boolean)) return [];

  const turns = mergeClose(toTurns(mask), frameSeconds).filter(
    (turn) => (turn.endFrame - turn.startFrame + 1) * frameSeconds >= VAD_MIN_TURN_SECONDS,
  );
  if (turns.length === 0) return [];

  const features = turns.map((turn) => turnFeatures(signal, turn, sampleRate, frameSize));
  const labels = cluster(features, 1.0, VAD_MAX_SPEAKERS);

  // Kode speaker diurutkan kemunculan pertama di timeline.
  const codeByLabel = new Map<number, string>();
  for (let i = 0; i < turns.length; i += 1) {
    const label = labels[i] ?? 0;
    if (!codeByLabel.has(label)) {
      codeByLabel.set(label, `speaker_${codeByLabel.size + 1}`);
    }
  }

  return turns.map((turn, index) => ({
    startTime: turn.startFrame * frameSeconds,
    endTime: (turn.endFrame + 1) * frameSeconds,
    speakerCode: codeByLabel.get(labels[index] ?? 0) ?? 'speaker_1',
  }));
}
