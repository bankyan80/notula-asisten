import { describe, expect, it } from 'vitest';
import type { Meeting, Speaker, TranscriptSegment } from '../../core/types/entities';
import type { SummaryInput } from '../../core/types/providers';
import { collectSentences, summarizeExtractive } from './extractSummary';

function meeting(): Meeting {
  return {
    id: 'm1',
    title: 'Rapat Evaluasi Data',
    date: '2026-10-07',
    participants: [],
    language: 'id',
    durationSeconds: 40,
    status: 'COMPLETED',
    storageMode: 'device',
    createdAt: '2026-10-07T08:00:00.000Z',
    updatedAt: '2026-10-07T08:00:00.000Z',
  };
}

function segment(
  id: string,
  sequence: number,
  startTime: number,
  endTime: number,
  text: string,
): TranscriptSegment {
  return {
    id,
    meetingId: 'm1',
    startTime,
    endTime,
    text,
    sequence,
    createdAt: '2026-10-07T08:00:00.000Z',
  };
}

function speaker(id: string, displayName: string): Speaker {
  return {
    id,
    meetingId: 'm1',
    code: `speaker_${id}`,
    displayName,
    durationSeconds: 20,
    segmentCount: 2,
    createdAt: '2026-10-07T08:00:00.000Z',
    updatedAt: '2026-10-07T08:00:00.000Z',
  };
}

function baseInput(segments: TranscriptSegment[]): SummaryInput {
  return {
    meeting: meeting(),
    segments,
    speakers: [speaker('s1', 'Budi'), speaker('s2', 'Operator')],
    language: 'id',
  };
}

const sampleSegments = (): TranscriptSegment[] => [
  segment('seg-1', 0, 0, 10, 'Selamat pagi. Kita mulai rapat evaluasi data semester ini.'),
  segment('seg-2', 1, 10, 15, 'Apakah data NISN sudah diverifikasi?'),
  segment('seg-3', 2, 15, 25, 'Disepakati seluruh operator sekolah wajib menyerahkan rekap data.'),
  segment('seg-4', 3, 25, 30, 'Budi akan mengirimkan laporan paling lambat besok.'),
  segment('seg-5', 4, 30, 40, 'Verifikasi data Korwil menunggu keputusan kepala bidang.'),
];

describe('collectSentences', () => {
  it('setiap kalimat membawa segmen sumbernya', () => {
    const sentences = collectSentences(sampleSegments());
    expect(sentences.length).toBeGreaterThan(5);
    expect(sentences[0]).toMatchObject({
      text: 'Selamat pagi.',
      segmentId: 'seg-1',
      startTime: 0,
    });
    expect(sentences.map((sentence) => sentence.order)).toEqual(sentences.map((_, index) => index));
  });

  it('urut berdasarkan sequence, bukan urutan array', () => {
    const reversed = [...sampleSegments()].reverse();
    const sentences = collectSentences(reversed);
    expect(sentences[0]?.segmentId).toBe('seg-1');
  });
});

describe('summarizeExtractive — pipeline PRD §15', () => {
  it('keputusan terekstrak dengan timestamp segmen sumber (traceability)', () => {
    const result = summarizeExtractive(baseInput(sampleSegments()));

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.content).toContain('Disepakati');
    expect(result.decisions[0]?.sourceTimestamp).toBe(15);
    expect(result.decisions[0]?.sourceSegmentId).toBe('seg-3');
  });

  it('tindak lanjut membawa PIC (nama pembicara disebut) dan deadline', () => {
    const result = summarizeExtractive(baseInput(sampleSegments()));

    const item = result.actionItems.find((entry) => entry.task.includes('Budi'));
    expect(item).toBeDefined();
    expect(item?.assignee).toBe('Budi');
    expect(item?.deadline).toBe('besok');
    expect(item?.sourceTimestamp).toBe(25);
    expect(item?.sourceSegmentId).toBe('seg-4');
  });

  it('pertanyaan terekstrak sebagai TraceableItem', () => {
    const result = summarizeExtractive(baseInput(sampleSegments()));

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.sourceTimestamp).toBe(10);
  });

  it('"menunggu keputusan" masuk belum diputuskan, BUKAN keputusan', () => {
    const result = summarizeExtractive(baseInput(sampleSegments()));

    expect(result.undecided.join(' ')).toContain('menunggu keputusan');
    expect(result.decisions.some((decision) => decision.content.includes('menunggu'))).toBe(false);
  });

  it('ringkasan & topik diambil dari kalimat/frasa transkrip (bukan karangan)', () => {
    const result = summarizeExtractive(baseInput(sampleSegments()));

    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary).not.toBe('Tidak disebutkan dalam rapat.');
    expect(result.topics.length).toBeGreaterThan(0);
    // Kalimat ringkasan harus berasal dari transkrip.
    const allText = sampleSegments()
      .map((segment) => segment.text)
      .join(' ');
    for (const fragment of result.summary
      .split('. ')
      .map((part) => part.replace(/\.$/, '').trim())
      .filter((part) => part.length > 0)) {
      expect(allText).toContain(fragment.slice(0, Math.min(40, fragment.length)));
    }
  });

  it('transkrip kosong → placeholder jujur, tanpa daftar mengarang', () => {
    const result = summarizeExtractive(baseInput([]));

    expect(result.summary).toBe('Tidak disebutkan dalam rapat.');
    expect(result.topics).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.actionItems).toEqual([]);
    expect(result.undecided).toEqual(['Tidak disebutkan dalam rapat.']);
  });

  it('tanpa pola keputusan → daftar keputusan kosong (tidak dipaksakan)', () => {
    const result = summarizeExtractive(
      baseInput([segment('seg-a', 0, 0, 10, 'Diskusi umum tentang cuaca dan kondisi sekolah.')]),
    );

    expect(result.decisions).toEqual([]);
    expect(result.actionItems).toEqual([]);
    expect(result.undecided).toEqual(['Tidak disebutkan dalam rapat.']);
  });

  it('deterministik: hasil sama pada panggilan berulang', () => {
    const input = baseInput(sampleSegments());
    expect(summarizeExtractive(input)).toEqual(summarizeExtractive(input));
  });
});
