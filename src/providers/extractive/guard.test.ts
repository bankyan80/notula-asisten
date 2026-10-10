import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '../../core/types/entities';
import type { AISummaryResult } from '../../core/types/providers';
import { validateSummaryResult } from './guard';

const segments: TranscriptSegment[] = [
  {
    id: 'seg-1',
    meetingId: 'm1',
    startTime: 0,
    endTime: 30,
    text: 'Isi transkrip.',
    sequence: 0,
    createdAt: '2026-10-07T08:00:00.000Z',
  },
];

function baseResult(): AISummaryResult {
  return {
    summary: 'Ringkasan.',
    topics: ['topik'],
    decisions: [
      { content: 'Valid', sourceTimestamp: 10, sourceSegmentId: 'seg-1' },
      { content: 'Mengarang', sourceTimestamp: 999_999, sourceSegmentId: 'seg-x' },
    ],
    actionItems: [
      { task: 'Tugas valid', sourceTimestamp: 5, sourceSegmentId: 'seg-1' },
      { task: 'Tugas tanpa sumber valid', sourceTimestamp: 123_456, sourceSegmentId: 'seg-y' },
      { task: 'Tugas tanpa timestamp' },
    ],
    questions: [{ content: 'Pertanyaan?', sourceTimestamp: 20, sourceSegmentId: 'seg-1' }],
    undecided: [],
  };
}

describe('validateSummaryResult — guard anti-hallucination', () => {
  it('membuang keputusan/pertanyaan yang sumbernya di luar transkrip', () => {
    const guarded = validateSummaryResult(baseResult(), segments);

    expect(guarded.decisions.map((decision) => decision.content)).toEqual(['Valid']);
    expect(guarded.questions.map((question) => question.content)).toEqual(['Pertanyaan?']);
  });

  it('action item tanpa sumber valid → timestamp dilepas, tugas tetap ada', () => {
    const guarded = validateSummaryResult(baseResult(), segments);

    const invalid = guarded.actionItems.find((item) => item.task.includes('tanpa sumber'));
    expect(invalid).toMatchObject({ task: 'Tugas tanpa sumber valid' });
    expect(invalid?.sourceTimestamp).toBeUndefined();
    expect(invalid?.sourceSegmentId).toBeUndefined();

    const valid = guarded.actionItems.find((item) => item.task === 'Tugas valid');
    expect(valid?.sourceTimestamp).toBe(5);

    const noStamp = guarded.actionItems.find((item) => item.task === 'Tugas tanpa timestamp');
    expect(noStamp).toMatchObject({ task: 'Tugas tanpa timestamp' });
  });

  it('item persis di batas segmen (± 0,5 dtk toleransi) tetap valid', () => {
    const result = baseResult();
    result.decisions = [{ content: 'Di awal', sourceTimestamp: -0.3 }];
    const guarded = validateSummaryResult(result, segments);

    expect(guarded.decisions).toHaveLength(1);
  });

  it('tanpa segmen → semua sumber dianggap tidak valid', () => {
    const guarded = validateSummaryResult(baseResult(), []);

    expect(guarded.decisions).toEqual([]);
    expect(guarded.questions).toEqual([]);
    expect(guarded.actionItems.every((item) => item.sourceTimestamp === undefined)).toBe(true);
  });

  it('undecided kosong → placeholder jujur', () => {
    const guarded = validateSummaryResult(baseResult(), segments);
    expect(guarded.undecided).toEqual(['Tidak disebutkan dalam rapat.']);
  });

  it('tidak ada yang dibuang bila semua sumber sah', () => {
    const result: AISummaryResult = {
      summary: 'Ringkasan.',
      topics: [],
      decisions: [{ content: 'Aman', sourceTimestamp: 15, sourceSegmentId: 'seg-1' }],
      actionItems: [{ task: 'Aman dikerjakan', sourceTimestamp: 15 }],
      questions: [],
      undecided: ['Menunggu konfirmasi'],
    };
    const guarded = validateSummaryResult(result, segments);

    expect(guarded.decisions).toHaveLength(1);
    expect(guarded.actionItems).toHaveLength(1);
    expect(guarded.undecided).toEqual(['Menunggu konfirmasi']);
  });
});
