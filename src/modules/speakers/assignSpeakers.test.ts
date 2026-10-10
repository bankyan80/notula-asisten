import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '../../core/types/entities';
import {
  computeSpeakerStats,
  orderedTurnCodes,
  pickSpeakerCodeForSegment,
  toTimelineTurns,
} from './assignSpeakers';

function segment(start: number, end: number, speakerId?: string): TranscriptSegment {
  return {
    id: `seg-${start}`,
    meetingId: 'm1',
    ...(speakerId !== undefined ? { speakerId } : {}),
    startTime: start,
    endTime: end,
    text: 'Teks',
    sequence: 0,
    createdAt: '2026-10-07T10:00:00.000Z',
  };
}

describe('toTimelineTurns', () => {
  it('menggeser turn per-chunk ke timeline meeting', () => {
    const turns = toTimelineTurns(
      [
        { startTime: 0, endTime: 10, speakerCode: 'speaker_1' },
        { startTime: 11, endTime: 20, speakerCode: 'speaker_2' },
      ],
      300,
    );
    expect(turns).toEqual([
      { startTime: 300, endTime: 310, speakerCode: 'speaker_1' },
      { startTime: 311, endTime: 320, speakerCode: 'speaker_2' },
    ]);
  });
});

describe('pickSpeakerCodeForSegment', () => {
  const turns = [
    { startTime: 0, endTime: 10, speakerCode: 'speaker_1' },
    { startTime: 10, endTime: 20, speakerCode: 'speaker_2' },
  ];

  it('memilih tumpang-tindih terbesar', () => {
    expect(pickSpeakerCodeForSegment(segment(2, 5), turns)).toBe('speaker_1');
    expect(pickSpeakerCodeForSegment(segment(15, 19), turns)).toBe('speaker_2');
  });

  it('sebagian besar tumpang-tindih menang meski mulai lebih lambat', () => {
    // 8 detik kena speaker_1, 2 detik kena speaker_2.
    expect(pickSpeakerCodeForSegment(segment(2, 12), turns)).toBe('speaker_1');
  });

  it('seri overlap → giliran yang mulai lebih dulu', () => {
    const aligned = [
      { startTime: 0, endTime: 10, speakerCode: 'speaker_1' },
      { startTime: 0, endTime: 10, speakerCode: 'speaker_2' },
    ];
    expect(pickSpeakerCodeForSegment(segment(0, 10), aligned)).toBe('speaker_1');
  });

  it('tanpa tumpang-tindih sama sekali → null (tidak menebak)', () => {
    expect(pickSpeakerCodeForSegment(segment(50, 60), turns)).toBeNull();
    expect(pickSpeakerCodeForSegment(segment(0, 10), [])).toBeNull();
  });
});

describe('computeSpeakerStats', () => {
  it('durasi & jumlah segmen dihitung dari transkrip (bukan angka basi)', () => {
    const stats = computeSpeakerStats([
      segment(0, 5, 'sp-a'),
      segment(6, 9, 'sp-a'),
      segment(10, 20, 'sp-b'),
      segment(21, 22), // belum ter-assign → dilewati
    ]);

    expect(stats.get('sp-a')).toEqual({ durationSeconds: 8, segmentCount: 2 });
    expect(stats.get('sp-b')).toEqual({ durationSeconds: 10, segmentCount: 1 });
    expect(stats.size).toBe(2);
  });

  it('tanpa segmen → kosong', () => {
    expect(computeSpeakerStats([]).size).toBe(0);
  });
});

describe('orderedTurnCodes', () => {
  it('kode unik menurut kemunculan pertama di timeline', () => {
    expect(
      orderedTurnCodes([
        { startTime: 300, endTime: 320, speakerCode: 'speaker_1' },
        { startTime: 0, endTime: 20, speakerCode: 'speaker_2' },
        { startTime: 21, endTime: 40, speakerCode: 'speaker_1' },
      ]),
    ).toEqual(['speaker_2', 'speaker_1']);
  });
});
