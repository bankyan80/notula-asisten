import { describe, expect, it } from 'vitest';
import type { AudioChunk, TranscriptSegment } from '../../core/types/entities';
import {
  buildChunkTimeline,
  findActiveChunk,
  findActiveSegment,
  findNextChunk,
  resolveChunkAt,
} from './timeline';

function chunk(sequence: number, start: number, end: number): AudioChunk {
  return {
    id: `chunk-${sequence}`,
    meetingId: 'm1',
    sequence,
    localPath: `Meetings/m1/audio/${String(sequence).padStart(6, '0')}.m4a`,
    startTime: start,
    endTime: end,
    durationSeconds: end - start,
    mimeType: 'audio/webm',
    uploadStatus: 'PENDING',
    transcriptionStatus: 'DONE',
    transcriptionAttempts: 1,
    createdAt: '2026-10-07T10:00:00.000Z',
  };
}

function segment(id: string, start: number, end: number): TranscriptSegment {
  return {
    id,
    meetingId: 'm1',
    startTime: start,
    endTime: end,
    text: `Teks ${id}`,
    sequence: 0,
    createdAt: '2026-10-07T10:00:00.000Z',
  };
}

describe('buildChunkTimeline', () => {
  it('mengurutkan chunk berdasarkan sequence, bukan urutan array', () => {
    const timeline = buildChunkTimeline([chunk(2, 300, 600), chunk(1, 0, 300)]);
    expect(timeline.map((span) => span.sequence)).toEqual([1, 2]);
    expect(timeline[0]).toMatchObject({
      chunkId: 'chunk-1',
      localPath: 'Meetings/m1/audio/000001.m4a',
      start: 0,
      end: 300,
    });
  });

  it('array kosong → timeline kosong', () => {
    expect(buildChunkTimeline([])).toEqual([]);
  });
});

describe('findActiveChunk / resolveChunkAt', () => {
  const timeline = buildChunkTimeline([chunk(1, 0, 300), chunk(2, 300, 600)]);

  it('menemukan chunk yang membawahi posisi', () => {
    expect(findActiveChunk(timeline, 10)?.sequence).toBe(1);
    expect(findActiveChunk(timeline, 300)?.sequence).toBe(2);
    expect(findActiveChunk(timeline, 599.9)?.sequence).toBe(2);
  });

  it('posisi tepat di akhir / di luar rekaman → null', () => {
    expect(findActiveChunk(timeline, 600)).toBeNull();
    expect(findActiveChunk(timeline, -1)).toBeNull();
    expect(findActiveChunk([], 10)).toBeNull();
  });

  it('gap antar chunk (end N < start N+1) → resolve jatuh ke chunk berikutnya', () => {
    const gapped = buildChunkTimeline([chunk(1, 0, 300), chunk(2, 310, 610)]);
    expect(resolveChunkAt(gapped, 305)?.sequence).toBe(2);
    expect(resolveChunkAt(gapped, 305)?.start).toBe(310);
  });

  it('posisi di ujung rekaman → chunk terakhir (offset di-clamp pemanggil)', () => {
    expect(resolveChunkAt(timeline, 600)?.sequence).toBe(2);
    expect(resolveChunkAt([], 0)).toBeNull();
  });
});

describe('findNextChunk', () => {
  it('chunk setelah yang sedang aktif', () => {
    const timeline = buildChunkTimeline([chunk(1, 0, 300), chunk(2, 300, 600)]);
    expect(findNextChunk(timeline, 10)?.sequence).toBe(2);
    expect(findNextChunk(timeline, 500)).toBeNull();
  });

  it('posisi di gap → chunk pertama yang start-nya di depan', () => {
    const gapped = buildChunkTimeline([chunk(1, 0, 300), chunk(2, 310, 610)]);
    expect(findNextChunk(gapped, 305)?.sequence).toBe(2);
  });
});

describe('findActiveSegment', () => {
  const segments = [segment('a', 0, 10), segment('b', 10, 25)];

  it('segmen yang menutupi posisi (start ≤ t < end)', () => {
    expect(findActiveSegment(segments, 5)?.id).toBe('a');
    expect(findActiveSegment(segments, 10)?.id).toBe('b');
    expect(findActiveSegment(segments, 24.9)?.id).toBe('b');
  });

  it('tepat di batas akhir / di luar / kosong → null', () => {
    expect(findActiveSegment(segments, 25)).toBeNull();
    expect(findActiveSegment(segments, 100)).toBeNull();
    expect(findActiveSegment([], 5)).toBeNull();
  });
});
