import { describe, expect, it } from 'vitest';
import { mapWhisperChunksToSegments } from './mapSegments';

const CONTEXT = {
  meetingId: 'm1',
  chunkStartTime: 600,
  chunkEndTime: 900,
  sequenceOffset: 7,
  now: '2026-10-07T10:00:00.000Z',
};

describe('mapWhisperChunksToSegments', () => {
  it('menggeser timestamp audio-chunk ke timeline meeting', () => {
    const segments = mapWhisperChunksToSegments(
      [
        { start: 0, end: 4.5, text: ' Selamat pagi. ' },
        { start: 4.5, end: 12, text: 'Kita mulai rapat.' },
      ],
      CONTEXT,
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      meetingId: 'm1',
      startTime: 600,
      endTime: 604.5,
      text: 'Selamat pagi.',
      sequence: 7,
      createdAt: '2026-10-07T10:00:00.000Z',
    });
    expect(segments[1]).toMatchObject({
      startTime: 604.5,
      endTime: 612,
      sequence: 8,
    });
  });

  it('end null (teks terakhir) diisi sampai akhir chunk', () => {
    const [segment] = mapWhisperChunksToSegments(
      [{ start: 290, end: null, text: 'Penutup' }],
      CONTEXT,
    );
    expect(segment).toMatchObject({ startTime: 890, endTime: 900 });
  });

  it('clamp nilai di luar durasi chunk (whisper bisa meleset di tepi window)', () => {
    const [segment] = mapWhisperChunksToSegments(
      [{ start: -3, end: 400, text: 'Meleset' }],
      CONTEXT,
    );
    expect(segment?.startTime).toBe(600);
    expect(segment?.endTime).toBe(900);
  });

  it('teks kosong dilewati tanpa membuat lubang sequence', () => {
    const segments = mapWhisperChunksToSegments(
      [
        { start: 0, end: 2, text: '   ' },
        { start: 2, end: 5, text: 'Valid' },
      ],
      CONTEXT,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ text: 'Valid', sequence: 7 });
  });

  it('end <= start diperbaiki bila masih di dalam chunk', () => {
    const [segment] = mapWhisperChunksToSegments(
      [{ start: 10, end: 10, text: 'Nol durasi' }],
      CONTEXT,
    );
    expect(segment?.startTime).toBe(610);
    expect(segment?.endTime).toBeGreaterThan(610);
    expect(segment?.endTime).toBeLessThanOrEqual(900);
  });

  it('tanpa timestamp sama sekali (start/end null) memakai seluruh durasi chunk', () => {
    const [segment] = mapWhisperChunksToSegments(
      [{ start: null, end: null, text: 'Tanpa waktu' }],
      CONTEXT,
    );
    expect(segment).toMatchObject({ startTime: 600, endTime: 900 });
  });
});
