/**
 * Guard anti-hallucination (Batch 09, PRD §15/§52).
 *
 * Kontrak: setiap keluaran penting wajib punya `sourceTimestamp` yang ADA di
 * dalam transkrip. Guard ini memverifikasi hasil provider terhadap segmen
 * transkrip — item dengan sumber di luar transkrip DIBUANG (bukan diperbaiki
 * diam-diam), agar tidak ada klaim yang tidak dapat diaudit ke audio.
 */
import type { TranscriptSegment } from '../../core/types/entities';
import type { AISummaryResult, TraceableItem } from '../../core/types/providers';
import { createLogger } from '../../core/logging/logger';

const log = createLogger('ai.summaryGuard');

const UNDECIDED_FALLBACK = 'Tidak disebutkan dalam rapat.';

function withinTranscript(timestamp: number, segments: TranscriptSegment[]): boolean {
  if (segments.length === 0) return false;
  if (!Number.isFinite(timestamp)) return false;
  // Toleransi setengah detik: pembulatan timestamp kalimat.
  const epsilon = 0.5;
  return segments.some(
    (segment) => timestamp >= segment.startTime - epsilon && timestamp <= segment.endTime + epsilon,
  );
}

function isTraceableWithValidSource(item: TraceableItem, segments: TranscriptSegment[]): boolean {
  return withinTranscript(item.sourceTimestamp, segments);
}

/**
 * Validasi hasil ringkasan terhadap transkrip.
 * - `decisions`/`questions`: wajib sumber valid, selain itu dibuang.
 * - `actionItems`: tanpa sumber valid → timestamp & segmen sumber dilepas
 *   (tugas tetap ditampilkan bila memang kalimatnya ada — tetapi tanpa jejak).
 * - `undecided` kosong → placeholder jujur.
 */
export function validateSummaryResult(
  result: AISummaryResult,
  segments: TranscriptSegment[],
): AISummaryResult {
  const decisions = result.decisions.filter((item) => isTraceableWithValidSource(item, segments));
  const questions = result.questions.filter((item) => isTraceableWithValidSource(item, segments));
  const actionItems = result.actionItems.map((item) => {
    if (item.sourceTimestamp === undefined) return item;
    if (withinTranscript(item.sourceTimestamp, segments)) return item;
    const rest = { ...item };
    delete rest.sourceTimestamp;
    delete rest.sourceSegmentId;
    return rest;
  });

  const dropped =
    result.decisions.length - decisions.length + result.questions.length - questions.length;
  if (dropped > 0) {
    log.warn('Guard anti-hallucination membuang item tanpa sumber di transkrip', { dropped });
  }

  return {
    ...result,
    decisions,
    questions,
    actionItems,
    undecided: result.undecided.length > 0 ? result.undecided : [UNDECIDED_FALLBACK],
  };
}
