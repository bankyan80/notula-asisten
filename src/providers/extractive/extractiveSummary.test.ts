import { describe, expect, it } from 'vitest';
import type { Meeting, TranscriptSegment } from '../../core/types/entities';
import { getAISummarizationProvider } from '..';
import { ExtractiveAISummarizationProvider } from './extractiveSummary';

const meeting: Meeting = {
  id: 'm1',
  title: 'Rapat',
  date: '2026-10-07',
  participants: [],
  language: 'id',
  durationSeconds: 30,
  status: 'COMPLETED',
  storageMode: 'device',
  createdAt: '2026-10-07T08:00:00.000Z',
  updatedAt: '2026-10-07T08:00:00.000Z',
};

const segments: TranscriptSegment[] = [
  {
    id: 'seg-1',
    meetingId: 'm1',
    startTime: 0,
    endTime: 15,
    text: 'Rapat membahas verifikasi data. Disepakati semua data diverifikasi Jumat.',
    sequence: 0,
    createdAt: '2026-10-07T08:00:00.000Z',
  },
  {
    id: 'seg-2',
    meetingId: 'm1',
    startTime: 15,
    endTime: 30,
    text: 'Operator akan mengirim rekap hari ini.',
    sequence: 1,
    createdAt: '2026-10-07T08:00:00.000Z',
  },
];

describe('ExtractiveAISummarizationProvider', () => {
  it('tersedia offline penuh (tanpa jaringan & API key)', async () => {
    const provider = new ExtractiveAISummarizationProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(provider.id).toBe('extractive');
  });

  it('registry memakai extractive sebagai default (VITE_AI_PROVIDER)', () => {
    expect(getAISummarizationProvider().id).toBe('extractive');
    expect(getAISummarizationProvider('extractive')).toBeInstanceOf(
      ExtractiveAISummarizationProvider,
    );
  });

  it('setiap keputusan & tindak lanjut punya sumber di dalam transkrip', async () => {
    const provider = new ExtractiveAISummarizationProvider();
    const result = await provider.summarize({
      meeting,
      segments,
      speakers: [],
      language: 'id',
    });

    for (const decision of result.decisions) {
      expect(decision.sourceTimestamp).toBeGreaterThanOrEqual(0);
      expect(decision.sourceTimestamp).toBeLessThanOrEqual(30);
      expect(decision.sourceSegmentId).toBeDefined();
    }
    for (const item of result.actionItems) {
      if (item.sourceTimestamp === undefined) continue;
      expect(item.sourceTimestamp).toBeGreaterThanOrEqual(0);
      expect(item.sourceTimestamp).toBeLessThanOrEqual(30);
    }
    expect(result.decisions.length).toBeGreaterThanOrEqual(1);
    expect(result.actionItems.length).toBeGreaterThanOrEqual(1);
  });

  it('deterministik — hasil identik antar panggilan', async () => {
    const provider = new ExtractiveAISummarizationProvider();
    const input = { meeting, segments, speakers: [], language: 'id' };
    const first = await provider.summarize(input);
    const second = await provider.summarize(input);
    expect(first).toEqual(second);
  });
});
