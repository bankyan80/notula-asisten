/**
 * Settings pengguna — persist ke localStorage (nyata, selamat setelah reload).
 * Default: HANYA PERANGKAT (cloud opsional, PRD §30).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type StorageModeSetting = 'device' | 'device_cloud';

export const DEFAULT_DICTIONARY = [
  'TKA',
  'SPMB',
  'NPSN',
  'NISN',
  'Dapodik',
  'Korwil',
  'PPPK',
  'GTK',
  'Rombel',
];

export const MINUTES_TEMPLATES = [
  { id: 'umum', label: 'Notulen Umum' },
  { id: 'dinas', label: 'Notulen Dinas' },
  { id: 'sekolah', label: 'Notulen Sekolah' },
  { id: 'rapat-guru', label: 'Notulen Rapat Guru' },
  { id: 'evaluasi', label: 'Notulen Evaluasi' },
  { id: 'koordinasi', label: 'Notulen Koordinasi' },
  { id: 'proyek', label: 'Notulen Proyek' },
  { id: 'custom', label: 'Template Custom' },
];

interface SettingsState {
  storageMode: StorageModeSetting;
  language: string;
  dictionary: string[];
  /** Pengguna sudah membaca pemberitahuan rekaman */
  consentAccepted: boolean;
  setStorageMode: (mode: StorageModeSetting) => void;
  setLanguage: (language: string) => void;
  setConsentAccepted: (accepted: boolean) => void;
  addDictionaryTerm: (term: string) => void;
  removeDictionaryTerm: (term: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      storageMode: 'device',
      language: 'id',
      dictionary: DEFAULT_DICTIONARY,
      consentAccepted: false,
      setStorageMode: (storageMode) => set({ storageMode }),
      setLanguage: (language) => set({ language }),
      setConsentAccepted: (consentAccepted) => set({ consentAccepted }),
      addDictionaryTerm: (term) =>
        set((state) => {
          const normalized = term.trim();
          if (normalized === '' || state.dictionary.includes(normalized)) return state;
          return { dictionary: [...state.dictionary, normalized] };
        }),
      removeDictionaryTerm: (term) =>
        set((state) => ({ dictionary: state.dictionary.filter((item) => item !== term) })),
    }),
    {
      name: 'notula-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        storageMode: state.storageMode,
        language: state.language,
        dictionary: state.dictionary,
        consentAccepted: state.consentAccepted,
      }),
    },
  ),
);
