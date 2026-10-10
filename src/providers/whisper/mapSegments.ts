/**
 * Pemetaan hasil Whisper → `TranscriptSegment` dengan timestamp TIMELINE MEETING.
 * Murni dan tanpa dependensi berat — unit-testable tanpa menjalankan model.
 *
 * Aturan:
 * - Timestamp model relatif terhadap AWAL audio chunk → digeser `chunkStartTime`.
 * - Nilai di luar durasi chunk di-clamp (whisper bisa meleset di tepi window).
 * - Segmen kosong/putus dilewati; sequence global diberikan pemanggil (antrian).
 */
import type { TranscriptSegment } from '../../core/types/entities';
import { createId } from '../../core/utils/id';
import type { WhisperTimestampChunk } from './whisperProtocol';

export interface SegmentMapContext {
  meetingId: string;
  /** Posisi awal chunk pada timeline meeting (detik). */
  chunkStartTime: number;
  /** Posisi akhir chunk pada timeline meeting (detik). */
  chunkEndTime: number;
  /** Sequence global pertama untuk segmen hasil chunk ini. */
  sequenceOffset: number;
  /** ISO date-time untuk `createdAt` seluruh segmen. */
  now: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function mapWhisperChunksToSegments(
  chunks: WhisperTimestampChunk[],
  context: SegmentMapContext,
): TranscriptSegment[] {
  const duration = Math.max(0, context.chunkEndTime - context.chunkStartTime);
  const segments: TranscriptSegment[] = [];

  for (const chunk of chunks) {
    const text = chunk.text.trim();
    if (text === '') continue;

    const rawStart = chunk.start ?? 0;
    const rawEnd = chunk.end ?? duration;
    const start = context.chunkStartTime + clamp(rawStart, 0, duration);
    let end = context.chunkStartTime + clamp(rawEnd, 0, duration);
    if (end <= start) {
      end = Math.min(context.chunkEndTime, start + 0.5);
      if (end <= start) continue;
    }

    segments.push({
      id: createId(),
      meetingId: context.meetingId,
      startTime: start,
      endTime: end,
      text,
      sequence: context.sequenceOffset + segments.length,
      createdAt: context.now,
    });
  }

  return segments;
}
