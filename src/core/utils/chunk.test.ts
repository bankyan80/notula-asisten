import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHUNK_DURATION_SECONDS,
  chunkFileName,
  chunkRelativePath,
  estimateStorage,
  formatBytes,
  meetingFolders,
  planChunks,
} from './chunk';

describe('planChunks', () => {
  it('membagi 10 menit menjadi 2 chunk 5 menit', () => {
    const plan = planChunks(600, 300);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toEqual({ sequence: 1, startTime: 0, endTime: 300 });
    expect(plan[1]).toEqual({ sequence: 2, startTime: 300, endTime: 600 });
  });

  it('chunk terakhir dipotong sesuai sisa durasi', () => {
    const plan = planChunks(301, 300);
    expect(plan).toHaveLength(2);
    expect(plan[1]).toEqual({ sequence: 2, startTime: 300, endTime: 301 });
  });

  it('default 5 menit (300 detik)', () => {
    expect(DEFAULT_CHUNK_DURATION_SECONDS).toBe(300);
    expect(planChunks(900)).toHaveLength(3);
  });

  it('durasi 0 menghasilkan rencana kosong', () => {
    expect(planChunks(0)).toEqual([]);
  });

  it('durasi chunk tidak valid dilempar', () => {
    expect(() => planChunks(600, 0)).toThrow(RangeError);
  });
});

describe('nama & path chunk', () => {
  it('sequence dipadding 6 digit', () => {
    expect(chunkFileName(1)).toBe('000001.m4a');
    expect(chunkFileName(42, 'ogg')).toBe('000042.ogg');
    expect(() => chunkFileName(0)).toThrow(RangeError);
  });

  it('path mengikuti struktur folder PRD §13', () => {
    expect(chunkRelativePath('m1', 3)).toBe('Meetings/m1/audio/000003.m4a');
    expect(meetingFolders('m1')).toEqual({
      root: 'Meetings/m1',
      audio: 'Meetings/m1/audio',
      transcript: 'Meetings/m1/transcript',
      speakers: 'Meetings/m1/speakers',
      summary: 'Meetings/m1/summary',
      export: 'Meetings/m1/export',
      metadata: 'Meetings/m1/metadata',
    });
  });
});

describe('estimasi storage', () => {
  it('128 kbps selama 2 jam ≈ 115 MB', () => {
    const estimate = estimateStorage(7200, 20 * 1024 ** 3);
    expect(estimate.isEnough).toBe(true);
    expect(estimate.requiredBytes).toBe(16000 * 7200);
    expect(formatBytes(estimate.requiredBytes)).toBe('110 MB');
  });

  it('storage tidak cukup → isEnough false dan remaining negatif', () => {
    const estimate = estimateStorage(7200, 1024);
    expect(estimate.isEnough).toBe(false);
    expect(estimate.remainingBytes).toBeLessThan(0);
  });
});

describe('formatBytes', () => {
  it('format satuan yang mudah dibaca', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 GB');
  });
});
