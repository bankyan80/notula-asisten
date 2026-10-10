/**
 * Pencarian dalam transkrip — murni di atas TranscriptSegment[].
 * Klik hasil → pemutar audio seek ke `segment.startTime` (Batch 07).
 */
import type { TranscriptSegment } from '../../core/types/entities';

export interface SearchHit {
  segment: TranscriptSegment;
  /** Indeks kecocokan pada teks asli segmen */
  matchStart: number;
  matchEnd: number;
  /** Cuplikan dengan elipsis di sekitar kecocokan */
  snippet: string;
}

export interface SearchOptions {
  limit?: number;
  /** Jumlah karakter konteks sebelum/sesudah kecocokan */
  context?: number;
}

function buildSnippet(text: string, start: number, end: number, context: number): string {
  const from = Math.max(0, start - context);
  const to = Math.min(text.length, end + context);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < text.length ? '…' : '';
  return `${prefix}${text.slice(from, to)}${suffix}`;
}

export function searchSegments(
  segments: TranscriptSegment[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  const limit = options.limit ?? 50;
  const context = options.context ?? 30;
  const needle = trimmed.toLowerCase();
  const hits: SearchHit[] = [];

  for (const segment of segments) {
    if (hits.length >= limit) break;
    const index = segment.text.toLowerCase().indexOf(needle);
    if (index === -1) continue;
    hits.push({
      segment,
      matchStart: index,
      matchEnd: index + needle.length,
      snippet: buildSnippet(segment.text, index, index + needle.length, context),
    });
  }

  return hits;
}
