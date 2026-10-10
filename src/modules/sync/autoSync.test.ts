import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import { useSettingsStore } from '../settings/settingsStore';
import { createDefaultSyncDeps, maybeSyncCompletedMeeting, runPendingSync } from './autoSync';

let meetingId = '';

async function seedMeetingWithTranscript(): Promise<void> {
  const meeting = await getRepositories().meetings.create({
    title: 'Rapat Auto Sync',
    date: '2026-10-07',
  });
  meetingId = meeting.id;
  await getRepositories().transcript.addSegments([
    {
      id: 'seg-1',
      meetingId,
      startTime: 0,
      endTime: 5,
      text: 'Isi transkrip.',
      sequence: 0,
      createdAt: new Date().toISOString(),
    },
  ]);
}

beforeEach(async () => {
  resetRepositories();
  useSettingsStore.setState({ storageMode: 'device' });
  await clearAllLocalData();
  await seedMeetingWithTranscript();
});

describe('maybeSyncCompletedMeeting — dipanggil saat rapat COMPLETED', () => {
  it('mode default "Hanya Perangkat" → tidak ada antrean (PRD §25)', async () => {
    await maybeSyncCompletedMeeting(getRepositories(), meetingId);

    const items = await getRepositories().syncQueue.listAll();
    expect(items).toHaveLength(0);
  });

  it('mode "Perangkat + Cloud" → antrean terisi, tetap PENDING bila backend siap tidak', async () => {
    useSettingsStore.setState({ storageMode: 'device_cloud' });

    await maybeSyncCompletedMeeting(getRepositories(), meetingId);

    const items = await getRepositories().syncQueue.listAll();
    expect(items.length).toBeGreaterThanOrEqual(2);
    // Default test: VITE_API_BASE_URL kosong → provider unavailable → jujur menunggu.
    expect(items.every((item) => item.status === 'PENDING')).toBe(true);
    expect(items.every((item) => item.attempts === 0)).toBe(true);
  });
});

describe('runPendingSync', () => {
  it('tanpa antrean → tanpa kerja; dengan antrean → reason jujur', async () => {
    const empty = await runPendingSync(getRepositories());
    expect(empty).toEqual({ uploaded: 0, failed: 0, skipped: 0 });

    useSettingsStore.setState({ storageMode: 'device_cloud' });
    await maybeSyncCompletedMeeting(getRepositories(), meetingId);

    const result = await runPendingSync(getRepositories());
    expect(result.reason).toBe('provider_unavailable');
    expect(result.uploaded).toBe(0);
  });

  it('deps default membawa provider & storage aplikasi', () => {
    const deps = createDefaultSyncDeps(getRepositories());
    expect(deps.provider.id).toBe('http-sync');
    expect(deps.storage.id.length).toBeGreaterThan(0);
  });
});
