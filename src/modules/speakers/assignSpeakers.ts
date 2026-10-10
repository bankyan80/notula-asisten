/**
 * Pemetaan hasil diarization → entri pembicara & statistik (Batch 08) — murni.
 *
 * Aturan:
 * - Segmen transkrip di-assign ke giliran bicara (turn) dengan tumpang-tindih
 *   terbesar di timeline meeting; tanpa tumpang-tindih → tidak di-assign (jujur,
 *   tidak menebak).
 * - Statistik (durasi & jumlah segmen) SELALU dihitung ulang dari transkrip —
 *   sumber kebenaran = segmen, bukan angka tersimpan yang bisa basi.
 */
import type { TranscriptSegment } from '../../core/types/entities';
import type { SpeakerSegment as DiarizationTurn } from '../../core/types/providers';

/** Turn dengan waktu sudah digeser ke timeline meeting. */
export interface TimelineTurn {
  startTime: number;
  endTime: number;
  speakerCode: string;
}

export interface SpeakerStats {
  durationSeconds: number;
  segmentCount: number;
}

/** Geser hasil per-chunk ke timeline meeting. */
export function toTimelineTurns(turns: DiarizationTurn[], chunkOffset: number): TimelineTurn[] {
  return turns.map((turn) => ({
    startTime: chunkOffset + turn.startTime,
    endTime: chunkOffset + turn.endTime,
    speakerCode: turn.speakerCode,
  }));
}

function overlapSeconds(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Kode pembicara dengan tumpang-tindih terbesar; seri → yang mulai lebih dulu.
 * `null` bila tidak ada satu pun giliran yang menyentuh segmen.
 */
export function pickSpeakerCodeForSegment(
  segment: Pick<TranscriptSegment, 'startTime' | 'endTime'>,
  turns: TimelineTurn[],
): string | null {
  let best: TimelineTurn | null = null;
  let bestOverlap = 0;
  for (const turn of turns) {
    const overlap = overlapSeconds(
      segment.startTime,
      segment.endTime,
      turn.startTime,
      turn.endTime,
    );
    if (overlap <= 0) continue;
    if (
      overlap > bestOverlap ||
      (overlap === bestOverlap && best !== null && turn.startTime < best.startTime)
    ) {
      best = turn;
      bestOverlap = overlap;
    }
  }
  return best?.speakerCode ?? null;
}

/** Kode → statistik dari daftar segmen yang sudah punya `speakerId`. */
export function computeSpeakerStats(segments: TranscriptSegment[]): Map<string, SpeakerStats> {
  const stats = new Map<string, SpeakerStats>();
  for (const segment of segments) {
    if (segment.speakerId === undefined) continue;
    const current = stats.get(segment.speakerId) ?? { durationSeconds: 0, segmentCount: 0 };
    current.durationSeconds += Math.max(0, segment.endTime - segment.startTime);
    current.segmentCount += 1;
    stats.set(segment.speakerId, current);
  }
  return stats;
}

/** Kode unik urut kemunculan pertama di timeline. */
export function orderedTurnCodes(turns: TimelineTurn[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const sorted = [...turns].sort((a, b) => a.startTime - b.startTime);
  for (const turn of sorted) {
    if (!seen.has(turn.speakerCode)) {
      seen.add(turn.speakerCode);
      ordered.push(turn.speakerCode);
    }
  }
  return ordered;
}
