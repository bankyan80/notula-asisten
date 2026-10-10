import { useState, type FormEvent } from 'react';
import { clearAllLocalData } from '../../data';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { friendlyMessage } from '../../core/errors/AppError';
import { useOnlineStatus } from '../../core/hooks/useOnlineStatus';
import { getSyncProvider } from '../../providers';
import { Button, Chip, ScreenHeader, SelectField } from '../../ui';
import { createDefaultSyncDeps, runPendingSync } from '../sync/autoSync';
import { enqueueMeetingSync, type SyncEngineDeps } from '../sync/syncEngine';
import { MINUTES_TEMPLATES, useSettingsStore } from './settingsStore';

export function SettingsPage() {
  const showToast = useToastStore((state) => state.showToast);

  const storageMode = useSettingsStore((state) => state.storageMode);
  const setStorageMode = useSettingsStore((state) => state.setStorageMode);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const dictionary = useSettingsStore((state) => state.dictionary);
  const addDictionaryTerm = useSettingsStore((state) => state.addDictionaryTerm);
  const removeDictionaryTerm = useSettingsStore((state) => state.removeDictionaryTerm);
  const consentAccepted = useSettingsStore((state) => state.consentAccepted);
  const setConsentAccepted = useSettingsStore((state) => state.setConsentAccepted);

  const [term, setTerm] = useState('');
  const [clearing, setClearing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const repositories = useRepositories();
  const online = useOnlineStatus();
  const providerAvailable = getSyncProvider().isAvailable();

  const cloudMode = storageMode === 'device_cloud';
  const canSync = cloudMode && providerAvailable && online && !syncing;

  const handleSync = async (): Promise<void> => {
    setSyncing(true);
    try {
      const deps: SyncEngineDeps = createDefaultSyncDeps(repositories);
      const meetings = await repositories.meetings.list();
      for (const meeting of meetings) {
        await enqueueMeetingSync(deps, meeting.id);
      }
      const result = await runPendingSync(repositories);
      if (result.reason === 'provider_unavailable') {
        showToast('Backend sinkronisasi belum dikonfigurasi. Data tetap di perangkat.');
      } else if (result.reason === 'offline') {
        showToast('Offline. Sinkronisasi berjalan saat koneksi kembali.');
      } else {
        showToast(`Sinkronisasi selesai: ${result.uploaded} berhasil, ${result.failed} gagal.`);
      }
    } catch (error) {
      showToast(friendlyMessage(error));
    } finally {
      setSyncing(false);
    }
  };

  const handleAddTerm = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const normalized = term.trim();
    if (normalized === '') return;
    addDictionaryTerm(normalized);
    setTerm('');
    showToast(`Istilah "${normalized}" ditambahkan.`);
  };

  const handleClearAll = async (): Promise<void> => {
    const confirmed = window.confirm(
      'Hapus SEMUA data lokal (rapat, audio, transkrip, ringkasan, notulen)? Tindakan ini tidak dapat dibatalkan.',
    );
    if (!confirmed) return;
    setClearing(true);
    try {
      await clearAllLocalData();
      showToast('Seluruh data lokal dihapus.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="min-h-dvh bg-surface">
      <ScreenHeader title="Pengaturan" backTo="/" />

      <main className="px-5 pb-8 pt-3 space-y-4">
        {/* Storage mode */}
        <section className="rounded-2xl bg-white p-4">
          <h2 className="text-lg font-bold text-ink">Penyimpanan</h2>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer gap-3">
              <input
                type="radio"
                name="storageMode"
                value="device"
                checked={storageMode === 'device'}
                onChange={() => setStorageMode('device')}
                className="mt-1 h-4 w-4 accent-brand"
              />
              <span>
                <b className="block text-base text-ink">Hanya Perangkat</b>
                <span className="text-sm text-muted">Data hanya tersimpan di perangkat ini.</span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3">
              <input
                type="radio"
                name="storageMode"
                value="device_cloud"
                checked={storageMode === 'device_cloud'}
                onChange={() => setStorageMode('device_cloud')}
                className="mt-1 h-4 w-4 accent-brand"
              />
              <span>
                <b className="block text-base text-ink">Perangkat + Cloud</b>
                <span className="text-sm text-muted">Salinan diunggah bila tersedia.</span>
              </span>
            </label>
          </div>
        </section>

        {/* Sync */}
        {cloudMode && (
          <section className="rounded-2xl bg-white p-4">
            <h2 className="text-lg font-bold text-ink">Sinkronisasi</h2>
            <p className="mt-1 text-sm text-muted">
              {providerAvailable ? 'Backend terkonfigurasi.' : 'Backend belum dikonfigurasi.'}
              {!online && ' Offline.'}
            </p>
            <Button block className="mt-3" disabled={!canSync} onClick={() => void handleSync()}>
              {syncing ? 'Menyinkronkan…' : 'Sinkronkan Sekarang'}
            </Button>
          </section>
        )}

        {/* Language & template */}
        <section className="rounded-2xl bg-white p-4">
          <SelectField
            fieldId="settings-language"
            label="Bahasa Transkripsi"
            options={[
              { value: 'id', label: 'Bahasa Indonesia' },
              { value: 'en', label: 'English' },
            ]}
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            hint="Dipakai untuk rapat baru."
          />
          <SelectField
            fieldId="settings-template"
            label="Template Notulen Default"
            options={MINUTES_TEMPLATES.map((item) => ({ value: item.id, label: item.label }))}
            value="umum"
            onChange={() => showToast('Pilihan template per rapat diatur saat membuat rapat.')}
            hint="Dapat diubah pada saat membuat rapat."
          />
        </section>

        {/* Dictionary */}
        <section className="rounded-2xl bg-white p-4">
          <h2 className="text-lg font-bold text-ink">Kamus Istilah</h2>
          <p className="mt-1 text-sm text-muted">
            Istilah khusus meningkatkan akurasi transkripsi.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {dictionary.map((item) => (
              <Chip key={item} tone="neutral">
                <span>{item}</span>
                <button
                  type="button"
                  onClick={() => removeDictionaryTerm(item)}
                  aria-label={`Hapus istilah ${item}`}
                  className="ml-1 rounded-full px-1 text-danger"
                >
                  ✕
                </button>
              </Chip>
            ))}
            {dictionary.length === 0 && (
              <p className="text-sm italic text-muted">Kamus masih kosong.</p>
            )}
          </div>
          <form onSubmit={handleAddTerm} className="mt-3 flex gap-2">
            <label htmlFor="dictionary-term" className="sr-only">
              Istilah baru
            </label>
            <input
              id="dictionary-term"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Tambah istilah…"
              className="min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none focus:border-brand"
            />
            <Button type="submit" variant="secondary" disabled={term.trim() === ''}>
              Tambah
            </Button>
          </form>
        </section>

        {/* Consent */}
        <section className="rounded-2xl bg-white p-4">
          <h2 className="text-lg font-bold text-ink">Pemberitahuan Rekaman</h2>
          <label className="mt-2 flex items-start gap-3 text-base text-ink">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
              className="mt-1 h-5 w-5 accent-brand"
            />
            Peserta rapat harus menyetujui perekaman.
          </label>
        </section>

        {/* Danger zone */}
        <section className="rounded-2xl bg-white p-4">
          <h2 className="text-lg font-bold text-danger">Zona Berbahaya</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Menghapus seluruh data lokal akan menghilangkan semua rapat, audio, transkrip, dan hasil
            AI.
          </p>
          <Button
            variant="danger"
            block
            className="mt-3"
            loading={clearing}
            onClick={() => void handleClearAll()}
          >
            🗑 Hapus Semua Data Lokal
          </Button>
        </section>
      </main>
    </div>
  );
}
