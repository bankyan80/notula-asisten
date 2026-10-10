/**
 * Timeline audio-chunk (Batch 07) — logika murni tanpa DOM.
 * Satu rapat = banyak file chunk (5 menit); timeline meeting menyatukan
 * semuanya sehingga seek "detik ke-47" tahu harus membaca file yang mana.
 */
import type { AudioChunk, TranscriptSegment } from '../../core/types/entities';

export interface ChunkSpan {
  chunkId: string;
  /** Path file di storage (mis. Meetings/{id}/audio/000001.m4a) */
  localPath: string;
  sequence: number;
  /** Posisi awal chunk pada timeline meeting (detik) */
  start: number;
  /** Posisi akhir chunk pada timeline meeting (detik) */
  end: number;
}

/** Susun chunk urut sequence → span timeline. Chunk rusak (end ≤ start) tetap ikut. */
export function buildChunkTimeline(chunks: AudioChunk[]): ChunkSpan[] {
  return [...chunks]
    .sort((a, b) => a.sequence - b.sequence)
    .map((chunk) => ({
      chunkId: chunk.id,
      localPath: chunk.localPath,
      sequence: chunk.sequence,
      start: chunk.startTime,
      end: chunk.endTime,
    }));
}

/** Chunk yang membawahi `time` (start ≤ time < end); null bila kosong/luar jangkauan. */
export function findActiveChunk(timeline: ChunkSpan[], time: number): ChunkSpan | null {
  return timeline.find((span) => time >= span.start && time < span.end) ?? null;
}

/**
 * Chunk untuk posisi `time` — tahan terhadap gap antar file (end chunk N <
 * start chunk N+1) dan posisi tepat di akhir rekaman.
 */
export function resolveChunkAt(timeline: ChunkSpan[], time: number): ChunkSpan | null {
  const exact = findActiveChunk(timeline, time);
  if (exact !== null) return exact;
  if (timeline.length === 0) return null;
  // Di gap → chunk pertama yang masih melewati `time`.
  const next = timeline.find((span) => span.end > time);
  if (next !== undefined) return next;
  // Setelah akhir rekaman → chunk terakhir (offset di-clamp saat dipakai).
  return timeline[timeline.length - 1] ?? null;
}

/** Chunk setelah yang sedang berbunyi — dipakai saat file `ended` (lanjut chunk). */
export function findNextChunk(timeline: ChunkSpan[], time: number): ChunkSpan | null {
  const index = timeline.findIndex((span) => time >= span.start && time < span.end);
  if (index >= 0) {
    return timeline[index + 1] ?? null;
  }
  return timeline.find((span) => span.start > time) ?? null;
}

/** Segmen yang sedang "disorot" pada posisi `time` (start ≤ time < end). */
export function findActiveSegment(
  segments: TranscriptSegment[],
  time: number,
): TranscriptSegment | null {
  let active: TranscriptSegment | null = null;
  for (const segment of segments) {
    if (time >= segment.startTime && time < segment.endTime) active = segment;
  }
  return active;
}
