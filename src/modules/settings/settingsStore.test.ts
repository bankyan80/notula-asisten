import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DICTIONARY, useSettingsStore } from './settingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    storageMode: 'device',
    language: 'id',
    dictionary: DEFAULT_DICTIONARY,
    consentAccepted: false,
  });
});

describe('settingsStore', () => {
  it('default: hanya perangkat, bahasa Indonesia, belum setuju rekaman', () => {
    const state = useSettingsStore.getState();
    expect(state.storageMode).toBe('device');
    expect(state.language).toBe('id');
    expect(state.consentAccepted).toBe(false);
    expect(state.dictionary).toContain('NISN');
  });

  it('mengubah mode penyimpanan tersimpan ke localStorage', () => {
    useSettingsStore.getState().setStorageMode('device_cloud');

    expect(useSettingsStore.getState().storageMode).toBe('device_cloud');
    const raw = localStorage.getItem('notula-settings');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw ?? '{}').state.storageMode).toBe('device_cloud');
  });

  it('kamus: tambah, cegah duplikat, hapus', () => {
    const { addDictionaryTerm, removeDictionaryTerm } = useSettingsStore.getState();

    addDictionaryTerm('Kurikulum Merdeka');
    expect(useSettingsStore.getState().dictionary).toContain('Kurikulum Merdeka');

    addDictionaryTerm('Kurikulum Merdeka');
    expect(
      useSettingsStore.getState().dictionary.filter((t) => t === 'Kurikulum Merdeka'),
    ).toHaveLength(1);

    removeDictionaryTerm('NISN');
    expect(useSettingsStore.getState().dictionary).not.toContain('NISN');
  });

  it('term kosong tidak ditambahkan', () => {
    useSettingsStore.getState().addDictionaryTerm('   ');
    expect(useSettingsStore.getState().dictionary).not.toContain('');
    expect(useSettingsStore.getState().dictionary).not.toContain('   ');
  });
});
