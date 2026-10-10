/**
 * Template notulen (PRD §18) — 8 pilihan pengguna.
 *
 * Catatan jujur: PRD tidak merinci perbedaan isi antar template; di sini
 * template menentukan JUDUL section (struktur & isi selalu sama — semua
 * berasal dari transkrip/ringkasan/keputusan rapat, tidak dikarang).
 */
export type MinutesTemplateId =
  'umum' | 'dinas' | 'sekolah' | 'guru' | 'evaluasi' | 'koordinasi' | 'proyek' | 'custom';

export type MinutesSectionKey =
  | 'agenda'
  | 'pembahasan'
  | 'keputusan'
  | 'tindakLanjut'
  | 'penanggungJawab'
  | 'deadline'
  | 'catatan';

/** Urutan section sesuai format PRD §17. */
export const MINUTES_SECTION_ORDER: readonly MinutesSectionKey[] = [
  'agenda',
  'pembahasan',
  'keputusan',
  'tindakLanjut',
  'penanggungJawab',
  'deadline',
  'catatan',
] as const;

type SectionTitles = Record<MinutesSectionKey, string>;

export interface MinutesTemplate {
  id: MinutesTemplateId;
  label: string;
  titles: SectionTitles;
}

const UMUM_TITLES: SectionTitles = {
  agenda: 'AGENDA',
  pembahasan: 'PEMBAHASAN',
  keputusan: 'KEPUTUSAN',
  tindakLanjut: 'TINDAK LANJUT',
  penanggungJawab: 'PENANGGUNG JAWAB',
  deadline: 'DEADLINE',
  catatan: 'CATATAN',
};

export const MINUTES_TEMPLATES: readonly MinutesTemplate[] = [
  { id: 'umum', label: 'Notulen Umum', titles: UMUM_TITLES },
  {
    id: 'dinas',
    label: 'Notulen Dinas',
    titles: {
      ...UMUM_TITLES,
      agenda: 'ACARA',
      pembahasan: 'HASIL PEMBAHASAN',
      catatan: 'CATATAN & ARAHAN',
    },
  },
  {
    id: 'sekolah',
    label: 'Notulen Sekolah',
    titles: { ...UMUM_TITLES, agenda: 'AGENDA RAPAT' },
  },
  {
    id: 'guru',
    label: 'Notulen Rapat Guru',
    titles: { ...UMUM_TITLES, pembahasan: 'BAHAN PEMBAHASAN' },
  },
  {
    id: 'evaluasi',
    label: 'Notulen Evaluasi',
    titles: {
      ...UMUM_TITLES,
      agenda: 'AGENDA EVALUASI',
      pembahasan: 'HASIL EVALUASI',
      keputusan: 'TEMUAN & KEPUTUSAN',
    },
  },
  {
    id: 'koordinasi',
    label: 'Notulen Koordinasi',
    titles: { ...UMUM_TITLES, agenda: 'AGENDA KOORDINASI' },
  },
  {
    id: 'proyek',
    label: 'Notulen Proyek',
    titles: {
      ...UMUM_TITLES,
      agenda: 'AGENDA PROYEK',
      pembahasan: 'PROGRES & PEMBAHASAN',
      catatan: 'RISIKO & CATATAN',
    },
  },
  { id: 'custom', label: 'Template Custom', titles: UMUM_TITLES },
];

export function getMinutesTemplate(id: string): MinutesTemplate {
  return MINUTES_TEMPLATES.find((template) => template.id === id) ?? MINUTES_TEMPLATES[0]!;
}
