import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../core/errors/AppError';
import type { SyncPayload, SyncProvider } from '../../core/types/providers';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import { MemStorage } from '../recording/memStorage';
import {
  attachOnlineSync,
  buildPayload,
  enqueueMeetingSync,
  processQueue,
  retryFailedSync,
  syncMeetingIfEnabled,
  type SyncEngineDeps,
} from './syncEngine';

class FakeSyncProvider implements SyncProvider {
  readonly id = 'fake-sync';
  available = true;
  failNext = 0;
  uploads: SyncPayload[] = [];

  isAvailable(): boolean {
    return this.available;
  }

  async upload(payload: SyncPayload): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new AppError('NETWORK_ERROR', 'Jaringan terputus.', { retryable: true });
    }
    this.uploads.push(payload);
  }
}

/** Storage yang menolak jujur (simulasi OPFS tak tersedia). */
class BrokenStorage extends MemStorage {
  override async exists(): Promise<boolean> {
    throw new AppError('PROVIDER_UNAVAILABLE', 'Storage tidak tersedia.');
  }
}

let meetingId = '';
let provider: FakeSyncProvider;
let storage: MemStorage;
let deps: SyncEngineDeps;

async function seedMeeting(): Promise<string> {
  const meeting = await getRepositories().meetings.create({
    title: 'Rapat Sinkron',
    date: '2026-10-07',
  });
  return meeting.id;
}

async function seedTranscript(): Promise<void> {
  await getRepositories().transcript.addSegments([
    {
      id: 'seg-1',
      meetingId,
      startTime: 0,
      endTime: 10,
      text: 'Halo semua.',
      sequence: 0,
      createdAt: new Date().toISOString(),
    },
  ]);
}

async function seedSummary(): Promise<void> {
  await getRepositories().summaries.save({
    id: 'sum-1',
    meetingId,
    content: 'Rapat menyepakati jadwal.',
    topics: ['jadwal'],
    undecided: [],
    sourceSegmentIds: ['seg-1'],
    createdAt: new Date().toISOString(),
  });
}

async function seedChunk(withFile: boolean): Promise<void> {
  const localPath = `Meetings/${meetingId}/audio/000001.m4a`;
  await getRepositories().audioChunks.add({
    id: 'chunk-1',
    meetingId,
    sequence: 1,
    localPath,
    startTime: 0,
    endTime: 30,
    durationSeconds: 30,
    mimeType: 'audio/webm',
    uploadStatus: 'PENDING',
    transcriptionStatus: 'PENDING',
    transcriptionAttempts: 0,
    createdAt: new Date().toISOString(),
  });
  if (withFile) await storage.writeBlob(localPath, new Blob(['audio-bytes']));
}

beforeEach(async () => {
  resetRepositories();
  await clearAllLocalData();
  provider = new FakeSyncProvider();
  storage = new MemStorage();
  deps = { repositories: getRepositories(), provider, storage, isOnline: () => true };
  meetingId = await seedMeeting();
});

describe('enqueueMeetingSync — SAVE LOCAL → VERIFY → antre', () => {
  it('hanya mendaftarkan entitas yang benar ada secara lokal', async () => {
    const result = await enqueueMeetingSync(deps, meetingId);

    const kinds = result.created.map((item) => item.entityKind);
    expect(kinds).toContain('meeting');
    // transcript/summary/audio belum ada → tidak ikut (verifikasi lokal).
    expect(kinds).not.toContain('transcript');
    expect(kinds).not.toContain('summary');
    expect(kinds).not.toContain('audio');

    const stored = await getRepositories().syncQueue.listByMeeting(meetingId);
    expect(stored).toHaveLength(result.created.length);
    expect(stored.every((item) => item.status === 'PENDING')).toBe(true);
  });

  it('idempoten: panggil dua kali tidak menduplikasi item aktif', async () => {
    await seedTranscript();
    await seedSummary();

    const first = await enqueueMeetingSync(deps, meetingId);
    const second = await enqueueMeetingSync(deps, meetingId);

    expect(first.created.length).toBeGreaterThanOrEqual(3);
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toBeGreaterThan(0);
    const stored = await getRepositories().syncQueue.listAll();
    expect(stored).toHaveLength(first.created.length);
  });

  it('audio ikut hanya bila file-nya ada; file hilang → dilewati', async () => {
    await seedChunk(true);
    const withFile = await enqueueMeetingSync(deps, meetingId);
    expect(withFile.created.some((item) => item.entityKind === 'audio')).toBe(true);

    // Rapat terpisah: chunk terdaftar tapi file-nya tidak ada di storage.
    const other = await getRepositories().meetings.create({
      title: 'Tanpa File',
      date: '2026-10-08',
    });
    await getRepositories().audioChunks.add({
      id: 'chunk-hilang',
      meetingId: other.id,
      sequence: 1,
      localPath: `Meetings/${other.id}/audio/000001.m4a`,
      startTime: 0,
      endTime: 30,
      durationSeconds: 30,
      mimeType: 'audio/webm',
      uploadStatus: 'PENDING',
      transcriptionStatus: 'PENDING',
      transcriptionAttempts: 0,
      createdAt: new Date().toISOString(),
    });

    const result = await enqueueMeetingSync(deps, other.id);
    expect(result.created.some((item) => item.entityKind === 'audio')).toBe(false);
    expect(result.created.map((item) => item.entityKind)).toContain('meeting');
  });

  it('storage tak tersedia → audio dilewati tanpa error (jujur)', async () => {
    const brokenDeps: SyncEngineDeps = { ...deps, storage: new BrokenStorage() };
    await seedChunk(true);

    const result = await enqueueMeetingSync(brokenDeps, meetingId);
    expect(result.created.some((item) => item.entityKind === 'audio')).toBe(false);
    expect(result.created.map((item) => item.entityKind)).toContain('meeting');
  });

  it('meeting tidak ada → NOT_FOUND', async () => {
    await expect(enqueueMeetingSync(deps, 'meet-hilang')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('buildPayload — VERIFY ulang tepat sebelum upload', () => {
  it('payload memuat data terbaru dari repository (bukan salinan lama)', async () => {
    await seedTranscript();
    await seedSummary();
    const { created } = await enqueueMeetingSync(deps, meetingId);

    // Ubah data SETELAH enqueue.
    await getRepositories().summaries.save({
      id: 'sum-1',
      meetingId,
      content: 'Versi terbaru setelah edit.',
      topics: ['jadwal'],
      undecided: [],
      sourceSegmentIds: ['seg-1'],
      createdAt: new Date().toISOString(),
    });

    const summaryItem = created.find((item) => item.entityKind === 'summary');
    const payload = await buildPayload(deps, summaryItem!);
    expect((payload.data as { summary: { content: string } }).summary.content).toBe(
      'Versi terbaru setelah edit.',
    );
  });

  it('audio: blob dibaca dari storage & nama file benar', async () => {
    await seedChunk(true);
    const { created } = await enqueueMeetingSync(deps, meetingId);
    const audioItem = created.find((item) => item.entityKind === 'audio');

    const payload = await buildPayload(deps, audioItem!);
    const data = payload.data as { blob: Blob; fileName: string };
    expect(data.fileName).toBe('000001.m4a');
    expect(data.blob.size).toBeGreaterThan(0);
  });

  it('entitas hilang → NOT_FOUND (bukan payload kosong palsu)', async () => {
    await seedTranscript();
    const { created } = await enqueueMeetingSync(deps, meetingId);
    const transcriptItem = created.find((item) => item.entityKind === 'transcript');

    await getRepositories().meetings.delete(meetingId);
    await expect(buildPayload(deps, transcriptItem!)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('processQueue — upload nyata, gagal jujur, tanpa sukses palsu', () => {
  it('provider belum tersedia → semua tetap PENDING + reason jujur', async () => {
    provider.available = false;
    await seedTranscript();
    await enqueueMeetingSync(deps, meetingId);

    const result = await processQueue(deps);
    expect(result.reason).toBe('provider_unavailable');
    expect(result.uploaded).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);

    const items = await getRepositories().syncQueue.listAll();
    expect(items.every((item) => item.status === 'PENDING')).toBe(true);
    expect(items.every((item) => item.attempts === 0)).toBe(true);
  });

  it('offline → menunggu koneksi, tidak gagal', async () => {
    const offlineDeps: SyncEngineDeps = { ...deps, isOnline: () => false };
    await seedTranscript();
    await enqueueMeetingSync(deps, meetingId);

    const result = await processQueue(offlineDeps);
    expect(result.reason).toBe('offline');
    const items = await getRepositories().syncQueue.listAll();
    expect(items.every((item) => item.status === 'PENDING')).toBe(true);
  });

  it('sukses → SUCCESS + payload terverifikasi terkirim', async () => {
    await seedTranscript();
    await seedSummary();
    await enqueueMeetingSync(deps, meetingId);

    const result = await processQueue(deps);
    expect(result.uploaded).toBeGreaterThanOrEqual(3);
    expect(result.failed).toBe(0);
    expect(provider.uploads.map((upload) => upload.kind)).toEqual(
      expect.arrayContaining(['meeting', 'transcript', 'summary']),
    );

    const items = await getRepositories().syncQueue.listAll();
    expect(items.every((item) => item.status === 'SUCCESS')).toBe(true);
  });

  it('upload gagal → FAILED, attempts naik, lastError jujur; bisa retry', async () => {
    await seedTranscript();
    await enqueueMeetingSync(deps, meetingId);
    provider.failNext = 1;

    const firstRun = await processQueue(deps);
    expect(firstRun.failed).toBeGreaterThan(0);
    let items = await getRepositories().syncQueue.listAll();
    const failedItem = items.find((item) => item.status === 'FAILED');
    expect(failedItem).toBeDefined();
    expect(failedItem?.attempts).toBe(1);
    // lastError memakai pesan ramah (friendlyMessage) — tetap berisi konteks kegagalan.
    expect(failedItem?.lastError).toContain('Offline. Rekaman tetap berjalan');

    // Retry → kembali RETRY lalu berhasil (idempoten, tidak dobel).
    const retryResult = await retryFailedSync(deps);
    expect(retryResult.uploaded).toBeGreaterThan(0);
    items = await getRepositories().syncQueue.listAll();
    expect(items.some((item) => item.status === 'FAILED')).toBe(false);
    expect(items.every((item) => item.status === 'SUCCESS')).toBe(true);

    // Enqueue ulang setelah SUCCESS: data terbaru boleh masuk antrean lagi.
    const again = await enqueueMeetingSync(deps, meetingId);
    expect(again.created.length).toBeGreaterThan(0);
    expect(again.created.every((item) => item.status === 'PENDING')).toBe(true);
  });

  it('proses berulang aman: antrean kosong → tanpa kerja', async () => {
    const result = await processQueue(deps);
    expect(result).toEqual({ uploaded: 0, failed: 0, skipped: 0 });
  });
});

describe('syncMeetingIfEnabled — default Hanya Perangkat = no-op', () => {
  it('mode device → tidak ada antrean sama sekali', async () => {
    await seedTranscript();
    const result = await syncMeetingIfEnabled(deps, meetingId, 'device');
    expect(result).toBeNull();
    const items = await getRepositories().syncQueue.listAll();
    expect(items).toHaveLength(0);
  });

  it('mode device_cloud → antrean terisi & tetap jujur bila backend siap', async () => {
    await seedTranscript();
    const result = await syncMeetingIfEnabled(deps, meetingId, 'device_cloud');
    expect(result).not.toBeNull();
    expect(result!.created.length).toBeGreaterThanOrEqual(2);
    // provider available → benar-benar terunggah
    expect(provider.uploads.length).toBeGreaterThanOrEqual(2);
  });
});

describe('attachOnlineSync', () => {
  it('event online memicu callback; lepas listener → berhenti', () => {
    let calls = 0;
    const detach = attachOnlineSync(() => {
      calls += 1;
    });

    window.dispatchEvent(new Event('online'));
    expect(calls).toBe(1);

    detach();
    window.dispatchEvent(new Event('online'));
    expect(calls).toBe(1);
  });
});
