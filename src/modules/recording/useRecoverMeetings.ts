/**
 * Pemulihan chunk saat aplikasi dibuka (Batch 05): memperbaiki akibat
 * crash/interrupt di sesi sebelumnya — metadata gantung dibersihkan, chunk
 * yang file-nya utuh tapi DB-nya hilang diadopsi. Berjalan async tanpa
 * memblokir UI; bila storage tidak tersedia (jsdom/OPFS mati) diabaikan diam
 * (bukan error pengguna).
 */
import { useEffect } from 'react';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { createLogger } from '../../core/logging/logger';
import { getRecordingEngine, getStorageProvider } from '../../providers';
import { markRecoverySettled } from '../transcription/recoveryGate';
import { recoverAllMeetings } from './recovery';

const log = createLogger('recording.recovery');

export function useRecoverMeetings(): void {
  const repositories = useRepositories();
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    // Jangan sentuh data saat ada rekaman aktif (race dengan persist chunk).
    const engine = getRecordingEngine();
    const status = engine.getState().status;
    if (status === 'recording' || status === 'paused') {
      // Antrian transkripsi tetap boleh jalan (dia juga mengecek rekaman sendiri).
      markRecoverySettled();
      return;
    }

    let cancelled = false;
    void recoverAllMeetings(repositories, getStorageProvider())
      .then((reports) => {
        const adopted = reports.reduce((sum, report) => sum + report.adopted, 0);
        const orphaned = reports.reduce((sum, report) => sum + report.orphanFiles.length, 0);
        if (orphaned > 0) log.warn('File audio tanpa jejak ditemukan', { count: orphaned });
        if (!cancelled && adopted > 0) {
          showToast(`${adopted} chunk audio dipulihkan dari sesi sebelumnya.`);
        }
      })
      .catch((error: unknown) => {
        log.info('Recovery dilewati (storage tidak siap atau kosong)', { error: String(error) });
      })
      .finally(() => {
        // Sinyalkan SELESAI (sukses/gagal) — transkripsi menunggu sinyal ini.
        markRecoverySettled();
      });
    return () => {
      cancelled = true;
    };
  }, [repositories, showToast]);
}
