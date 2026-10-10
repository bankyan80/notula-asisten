import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '../../core/types/entities';
import { searchSegments } from './searchSegments';

const segment = (id: string, sequence: number, text: string): TranscriptSegment => ({
  id,
  meetingId: 'm1',
  startTime: sequence * 10,
  endTime: sequence * 10 + 8,
  text,
  sequence,
  createdAt: '2026-10-07T00:00:00.000Z',
});

const segments = [
  segment('s1', 1, 'Selamat pagi, kita mulai rapat koordinasi TKA tahun ini.'),
  segment('s2', 2, 'Baik, untuk data peserta, semuanya sudah kami siapkan.'),
  segment('s3', 3, 'Kita perlu memastikan data NISN sudah valid sebelum tanggal 10.'),
  segment('s4', 4, 'Untuk jadwal pelaksanaan, apakah sudah ditetapkan?'),
];

describe('searchSegments', () => {
  it('mencari tanpa memedulikan huruf besar/kecil', () => {
    const hits = searchSegments(segments, 'NISN');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.segment.id).toBe('s3');
    expect(hits[0]?.matchStart).toBe(27);
    expect(hits[0]?.matchEnd).toBe(31);
  });

  it('query kosong tidak menghasilkan apa pun', () => {
    expect(searchSegments(segments, '   ')).toEqual([]);
  });

  it('tidak cocok → kosong', () => {
    expect(searchSegments(segments, 'KATA_TIDAK_ADA')).toEqual([]);
  });

  it('cuplikan menyertakan konteks dan elipsis', () => {
    const long = [
      segment('l1', 1, `awal ${'kata '.repeat(40)} data NISN siswa ${'akhir '.repeat(40)}`),
    ];
    const hits = searchSegments(long, 'NISN', { context: 20 });
    expect(hits[0]?.snippet).toContain('…');
    expect(hits[0]?.snippet).toContain('NISN');
    expect(hits[0]?.snippet.length).toBeLessThan(long[0]!.text.length);
  });

  it('menghormati batas hasil (limit)', () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      segment(`m${index}`, index, 'transkrip NISN'),
    );
    expect(searchSegments(many, 'NISN', { limit: 3 })).toHaveLength(3);
  });

  it('mempertahankan urutan segmen', () => {
    const hits = searchSegments(segments, 'rapat');
    expect(hits.map((hit) => hit.segment.sequence)).toEqual([1]);
  });
});
