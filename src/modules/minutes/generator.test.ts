import { describe, expect, it } from 'vitest';
import type { ActionItem, Decision, Meeting, Summary } from '../../core/types/entities';
import { generateMinutes } from './generator';
import { getMinutesTemplate, MINUTES_SECTION_ORDER, MINUTES_TEMPLATES } from './templates';

const meeting: Meeting = {
  id: 'm1',
  title: 'Rapat Koordinasi Data',
  date: '2026-10-07',
  startTime: '2026-10-07T09:00:00.000Z',
  location: 'Ruang Guru',
  description: '1. Evaluasi data semester\n2. Persiapan ujian',
  participants: ['Budi', 'Sari'],
  language: 'id',
  durationSeconds: 3600,
  status: 'COMPLETED',
  storageMode: 'device',
  createdAt: '2026-10-07T08:00:00.000Z',
  updatedAt: '2026-10-07T08:00:00.000Z',
};

const summary: Summary = {
  id: 'sum-1',
  meetingId: 'm1',
  content: 'Rapat membahas verifikasi data semester dan persiapan ujian.',
  topics: ['verifikasi data', 'persiapan ujian'],
  undecided: ['Menunggu keputusan kepala bidang'],
  sourceSegmentIds: ['seg-1'],
  createdAt: '2026-10-07T10:00:00.000Z',
};

const decisions: Decision[] = [
  {
    id: 'dec-1',
    meetingId: 'm1',
    content: 'Disepakati semua data diverifikasi sebelum Jumat.',
    sourceTimestamp: 125,
    sourceSegmentId: 'seg-2',
    createdAt: '2026-10-07T10:00:00.000Z',
  },
];

const actionItems: ActionItem[] = [
  {
    id: 'act-1',
    meetingId: 'm1',
    task: 'Budi akan mengirimkan rekap data.',
    assignee: 'Budi',
    deadline: 'besok',
    status: 'OPEN',
    sourceTimestamp: 200,
    sourceSegmentId: 'seg-3',
    createdAt: '2026-10-07T10:00:00.000Z',
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
  {
    id: 'act-2',
    meetingId: 'm1',
    task: 'Tugas tanpa keterangan tambahan.',
    status: 'OPEN',
    createdAt: '2026-10-07T10:00:00.000Z',
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
];

function baseInput(overrides: Partial<Parameters<typeof generateMinutes>[0]> = {}) {
  return {
    meeting,
    summary,
    decisions,
    actionItems,
    ...overrides,
  };
}

function sectionMap(minutes: ReturnType<typeof generateMinutes>) {
  return new Map(minutes.sections.map((section) => [section.key, section]));
}

describe('template notulen (PRD §18)', () => {
  it('menyediakan 8 template sesuai daftar PRD', () => {
    expect(MINUTES_TEMPLATES.map((template) => template.label)).toEqual([
      'Notulen Umum',
      'Notulen Dinas',
      'Notulen Sekolah',
      'Notulen Rapat Guru',
      'Notulen Evaluasi',
      'Notulen Koordinasi',
      'Notulen Proyek',
      'Template Custom',
    ]);
  });

  it('template tidak dikenal → fallback Notulen Umum', () => {
    expect(getMinutesTemplate('ngawur').id).toBe('umum');
  });
});

describe('generateMinutes — notulen terstruktur PRD §17', () => {
  it('urutan section persis format PRD §17', () => {
    const minutes = generateMinutes(baseInput());

    expect(minutes.sections.map((section) => section.key)).toEqual([...MINUTES_SECTION_ORDER]);
    expect(minutes.sections.map((section) => section.title)).toEqual([
      'AGENDA',
      'PEMBAHASAN',
      'KEPUTUSAN',
      'TINDAK LANJUT',
      'PENANGGUNG JAWAB',
      'DEADLINE',
      'CATATAN',
    ]);
    expect(minutes.templateId).toBe('umum');
    expect(minutes.meetingId).toBe('m1');
  });

  it('agenda dari deskripsi rapat (multi-baris)', () => {
    const minutes = generateMinutes(baseInput());
    const agenda = sectionMap(minutes).get('agenda');

    expect(agenda?.lines).toEqual(['1. Evaluasi data semester', '2. Persiapan ujian']);
  });

  it('pembahasan dari pokok ringkasan', () => {
    const minutes = generateMinutes(baseInput());
    expect(sectionMap(minutes).get('pembahasan')?.lines).toEqual([
      'verifikasi data',
      'persiapan ujian',
    ]);
  });

  it('keputusan membawa jejak sumber jam (traceability)', () => {
    const minutes = generateMinutes(baseInput());
    expect(sectionMap(minutes).get('keputusan')?.lines).toEqual([
      'Disepakati semua data diverifikasi sebelum Jumat. (sumber: 00:02:05)',
    ]);
  });

  it('tindak lanjut, penanggung jawab (PIC), dan deadline terpisah rapi', () => {
    const minutes = generateMinutes(baseInput());
    const sections = sectionMap(minutes);

    expect(sections.get('tindakLanjut')?.lines).toEqual([
      'Budi akan mengirimkan rekap data. (sumber: 00:03:20)',
      'Tugas tanpa keterangan tambahan.',
    ]);
    // Hanya item yang punya PIC (PRD §52.15 — jika disebutkan).
    expect(sections.get('penanggungJawab')?.lines).toEqual([
      'Budi — Budi akan mengirimkan rekap data.',
    ]);
    expect(sections.get('deadline')?.lines).toEqual(['besok — Budi akan mengirimkan rekap data.']);
  });

  it('catatan = hal yang belum diputuskan', () => {
    const minutes = generateMinutes(baseInput());
    expect(sectionMap(minutes).get('catatan')?.lines).toEqual(['Menunggu keputusan kepala bidang']);
  });

  it('tanpa ringkasan & keputusan → section kosong (UI menampilkan placeholder jujur)', () => {
    const minutes = generateMinutes(baseInput({ summary: null, decisions: [], actionItems: [] }));

    for (const section of minutes.sections) {
      if (section.key === 'agenda') continue; // agenda berasal dari deskripsi meeting
      expect(section.lines).toEqual([]);
    }
  });

  it('meeting tanpa deskripsi → agenda kosong (tidak mengarang agenda)', () => {
    const minutes = generateMinutes(baseInput({ meeting: { ...meeting, description: undefined } }));
    expect(sectionMap(minutes).get('agenda')?.lines).toEqual([]);
  });

  it('template dipilih mengubah judul section', () => {
    const minutes = generateMinutes(baseInput({ templateId: 'proyek' }));
    const sections = sectionMap(minutes);

    expect(minutes.templateId).toBe('proyek');
    expect(sections.get('agenda')?.title).toBe('AGENDA PROYEK');
    expect(sections.get('pembahasan')?.title).toBe('PROGRES & PEMBAHASAN');
    expect(sections.get('catatan')?.title).toBe('RISIKO & CATATAN');
  });

  it('template tidak dikenal → aman memakai Notulen Umum', () => {
    const minutes = generateMinutes(baseInput({ templateId: 'tidak-ada' }));
    expect(minutes.templateId).toBe('umum');
  });
});
