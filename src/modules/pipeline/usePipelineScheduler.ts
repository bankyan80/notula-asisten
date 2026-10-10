/**
 * Pemicu pipeline otomatis — pengganti `useTranscriptionQueue`.
 *
 * Tiga pemicu, supaya pekerjaan tidak pernah berhenti diam-diam:
 * 1. Aplikasi dibuka (setelah pemulihan chunk selesai) — memulihkan status basi.
 * 2. Interval 15 detik — menangani kegagalan sementara (jaringan/unduhan model).
 * 3. `window online` — memberi anggaran percobaan baru saat koneksi kembali.
 *
 * Pemicu keempat (tombol SELESAI) ada di `stopRecordingSafely`.
 */
import { useEffect } from 'react';
import { useRepositories } from '../../app/useRepositories';
import { createLogger } from '../../core/logging/logger';
import { onRecoverySettled } from '../transcription/recoveryGate';
import { PIPELINE_INTERVAL_MS } from './pipelineStatus';
import { resetPendingAttempts, runPipeline } from './runPipeline';

const log = createLogger('pipeline.scheduler');

export function usePipelineScheduler(): void {
  const repositories = useRepositories();

  useEffect(() => {
    let cancelled = false;

    const trigger = (): void => {
      if (cancelled) return;
      void runPipeline(repositories).catch((error: unknown) => {
        log.info('Pipeline dilewati (storage/provider belum siap)', { error: String(error) });
      });
    };

    const unsubscribeRecovery = onRecoverySettled(trigger);
    const timer = window.setInterval(trigger, PIPELINE_INTERVAL_MS);
    const handleOnline = (): void => {
      if (cancelled) return;
      void resetPendingAttempts(repositories)
        .then(trigger)
        .catch(() => undefined);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      unsubscribeRecovery();
      window.clearInterval(timer);
      window.removeEventListener('online', handleOnline);
    };
  }, [repositories]);
}
