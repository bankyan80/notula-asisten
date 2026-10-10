/**
 * Perangkai sync engine ke aplikasi (Batch 12):
 * - `maybeSyncCompletedMeeting` — dipanggil transcriptionQueue saat rapat
 *   COMPLETED; no-op pada mode default "Hanya Perangkat" (PRD §25).
 * - `runPendingSync` — proses antrean (dipakai tombol Settings & listener online).
 * - `useAutoSync` — listener `window online` → proses antrean yang tertunda.
 */
import { useEffect } from 'react';
import { useRepositories } from '../../app/useRepositories';
import { useSettingsStore } from '../settings/settingsStore';
import { getStorageProvider, getSyncProvider } from '../../providers';
import type { Repositories } from '../../data/repositories';
import {
  attachOnlineSync,
  processQueue,
  syncMeetingIfEnabled,
  type ProcessResult,
  type SyncEngineDeps,
} from './syncEngine';

export function createDefaultSyncDeps(repositories: Repositories): SyncEngineDeps {
  return {
    repositories,
    provider: getSyncProvider(),
    storage: getStorageProvider(),
  };
}

/** Setelah rapat COMPLETED: enqueue + proses bila pengguna memilih Perangkat + Cloud. */
export async function maybeSyncCompletedMeeting(
  repositories: Repositories,
  meetingId: string,
): Promise<void> {
  await syncMeetingIfEnabled(
    createDefaultSyncDeps(repositories),
    meetingId,
    useSettingsStore.getState().storageMode,
  );
}

export async function runPendingSync(repositories: Repositories): Promise<ProcessResult> {
  return processQueue(createDefaultSyncDeps(repositories));
}

export function useAutoSync(): void {
  const repositories = useRepositories();
  useEffect(
    () =>
      attachOnlineSync(() => {
        void runPendingSync(repositories);
      }),
    [repositories],
  );
}
