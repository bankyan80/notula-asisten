import { describe, expect, it } from 'vitest';
import type {
  ActionItem,
  Decision,
  Meeting,
  Speaker,
  Summary,
  TranscriptSegment,
} from '../../core/types/entities';
import {
  buildDocumentText,
  buildExportRequest,
  buildExportTables,
  buildTranscriptText,
  exportFileName,
  type ExportData,
} from './contentBuilder';

const meeting: Meeting = {
  id: 'meet-1',
  title: 'Rapat Kurikulum',
  date: '2026-10-07',
  startTime: '2026-10-07T09:00:00+07:00',
  location: 'Ruang Guru',
  participants: ['Kepala', 'Waka Kurikulum'],
  language: 'id',
  durationSeconds: 1800,
  status: 'COMPLETED',
  storageMode: 'device',
  createdAt: '2026-10-07T09:00:00.000Z',
  updatedAt: '2026-10-07T09:00:00.000Z',
};

const summary: Summary = {
  id: 'sum-1',
  meetingId: 'meet-1',
  content: 'Rapat membahas kurikulum semester genap.',
  topics: ['kurikulum semester genap'],
  undecided: ['Jadwal turnament belum pasti'],
  sourceSegmentIds: ['seg-1'],
  createdAt: '2026-10-07T10:00:00.000Z',
};

const segments: TranscriptSegment[] = [
  {
    id: 'seg-1',
    meetingId: 'meet-1',
    speakerId: 'spk-1',
    startTime: 0,
    endTime: 12,
    text: 'Kita mulai bahas kurikulum.',
    sequence: 0,
    createdAt: '2026-10-07T09:00:00.000Z',
  },
  {
    id: 'seg-2',
    meetingId: 'meet-1',
    startTime: 12,
    endTime: 30,
    text: 'Setuju, lanjutkan ke poin berikutnya.',
    sequence: 1,
    createdAt: '2026-10-07T09:00:00.000Z',
  },
];

const speakers: Speaker[] = [
  {
    id: 'spk-1',
    meetingId: 'meet-1',
    code: 'speaker_1',
    displayName: 'Pembicara 1',
    durationSeconds: 12,
    segmentCount: 1,
    createdAt: '2026-10-07T09:00:00.000Z',
    updatedAt: '2026-10-07T09:00:00.000Z',
  },
];

const decisions: Decision[] = [
  {
    id: 'dec-1',
    meetingId: 'meet-1',
    content: 'Kurikulum disepakati dipakai semester genap.',
    sourceTimestamp: 10,
    sourceSegmentId: 'seg-1',
    createdAt: '2026-10-07T10:00:00.000Z',
  },
];

const actionItems: ActionItem[] = [
  {
    id: 'act-1',
    meetingId: 'meet-1',
    task: 'Susun draf silabus minggu depan.',
    assignee: 'Waka Kurikulum',
    deadline: 'Jumat',
    status: 'OPEN',
    sourceTimestamp: 20,
    sourceSegmentId: 'seg-1',
    createdAt: '2026-10-07T10:00:00.000Z',
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
];

function makeData(overrides: Partial<ExportData> = {}): ExportData {
  return {
    meeting,
    minutes: null,
    summary,
    segments,
    decisions,
    actionItems,
    speakers,
    ...overrides,
  };
}

describe('buildDocumentText — PDF/DOCX §19.1', () => {
  it('memuat identitas rapat, peserta, ringkasan, keputusan, tugas, PIC, deadline', () => {
    const text = buildDocumentText(makeData());

    expect(text).toContain('NOTULEN RAPAT');
    expect(text).toContain('Judul: Rapat Kurikulum');
    expect(text).toContain('Tempat: Ruang Guru');
    expect(text).toContain('Peserta: Kepala, Waka Kurikulum');
    expect(text).toContain('RINGKASAN');
    expect(text).toContain('Rapat membahas kurikulum semester genap.');
    expect(text).toContain('Kurikulum disepakati dipakai semester genap.');
    expect(text).toContain('sumber: 00:00:10');
    expect(text).toContain('Susun draf silabus minggu depan.');
    expect(text).toContain('Waka Kurikulum — Susun draf silabus minggu depan.');
    expect(text).toContain('Jumat — Susun draf silabus minggu depan.');
  });

  it('tempat & peserta kosong diisi jujur', () => {
    const text = buildDocumentText(
      makeData({ meeting: { ...meeting, location: undefined, participants: [] } }),
    );

    expect(text).toContain('Tempat: Tidak disebutkan dalam rapat.');
    expect(text).toContain('Peserta: Tidak disebutkan dalam rapat.');
  });

  it('mengikuti section notulen bila sudah dibuat', () => {
    const text = buildDocumentText(
      makeData({
        minutes: {
          id: 'min-1',
          meetingId: 'meet-1',
          templateId: 'proyek',
          sections: [
            { key: 'identitas', title: 'IDENTITAS RAPAT', lines: ['Rapat proyek'] },
            { key: 'keputusan', title: 'TEMUAN & KEPUTUSAN', lines: ['Dipakai proyek A'] },
          ],
          createdAt: '2026-10-07T10:05:00.000Z',
          updatedAt: '2026-10-07T10:05:00.000Z',
        },
      }),
    );

    expect(text).toContain('TEMUAN & KEPUTUSAN');
    expect(text).toContain('- Dipakai proyek A');
  });
});

describe('buildTranscriptText — TXT §19.3', () => {
  it('transkrip sederhana: timestamp — pembicara lalu teks', () => {
    const text = buildTranscriptText(makeData());

    expect(text).toContain('Rapat Kurikulum');
    expect(text).toContain('00:00:00 — Pembicara 1');
    expect(text).toContain('Kita mulai bahas kurikulum.');
    expect(text).toContain('Setuju, lanjutkan ke poin berikutnya.');
  });

  it('urut sesuai sequence, bukan urutan array acak', () => {
    const reversed = [...segments].reverse();
    const text = buildTranscriptText(makeData({ segments: reversed }));

    expect(text.indexOf('Kita mulai')).toBeLessThan(text.indexOf('Setuju'));
  });
});

describe('buildExportTables — XLSX', () => {
  it('sheet Tindak Lanjut membawa tugas, PIC, deadline, status', () => {
    const tables = buildExportTables(makeData());
    const actions = tables.find((table) => table.name === 'Tindak Lanjut');

    expect(actions?.rows[0]).toEqual(['Tugas', 'PIC', 'Deadline', 'Status', 'Sumber']);
    expect(actions?.rows[1]).toEqual([
      'Susun draf silabus minggu depan.',
      'Waka Kurikulum',
      'Jumat',
      'Terbuka',
      '00:00:20',
    ]);
  });

  it('sheet Keputusan & Pembicara tersedia', () => {
    const tables = buildExportTables(makeData());

    expect(tables.map((table) => table.name)).toEqual(['Tindak Lanjut', 'Keputusan', 'Pembicara']);
    const speakerRows = tables.find((table) => table.name === 'Pembicara')?.rows;
    expect(speakerRows?.[1]?.[0]).toBe('Pembicara 1');
  });
});

describe('buildExportRequest & exportFileName', () => {
  it('TXT memakai transkrip, XLSX memakai tabel, PDF memakai dokumen', () => {
    const data = makeData();

    expect(buildExportRequest('TXT', data).content).toContain('00:00:00');
    expect(buildExportRequest('TXT', data).tables).toBeUndefined();
    expect(buildExportRequest('XLSX', data).content).toContain('Rapat Kurikulum');
    expect(buildExportRequest('XLSX', data).tables).toHaveLength(3);
    expect(buildExportRequest('PDF', data).content).toContain('NOTULEN RAPAT');
    expect(buildExportRequest('DOCX', data).content).toContain('NOTULEN RAPAT');
  });

  it('nama file memakai judul + tanggal + ekstensi format, karakter berbahaya dibersihkan', () => {
    expect(exportFileName({ ...meeting, title: 'Rapat/Demo: "X"?' }, 'PDF')).toBe(
      'Rapat-Demo- -X-- 2026-10-07.pdf',
    );
    expect(exportFileName(meeting, 'XLSX')).toBe('Rapat Kurikulum 2026-10-07.xlsx');
    expect(exportFileName({ ...meeting, title: '   ' }, 'TXT')).toBe('Rapat 2026-10-07.txt');
  });
});
