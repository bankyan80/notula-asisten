import { beforeEach, describe, expect, it } from 'vitest';
import type { RecordingChunkEvent } from '../../core/types/providers';
import { audioChunkPath, audioManifestPath } from '../../core/utils/paths';
import { createMemoryRepositories, type MemoryDatabase } from '../../data/memory/repositories';
import { MemStorage } from './memStorage';
import { readManifest } from './manifest';
import { persistChunk } from './persistChunk';
import { recoverMeeting } from './recovery';

/** Manifest gagal ditulis (kuota/IO) — persist berhenti sebelum file & DB. */
class ManifestWriteFails extends MemStorage {
  override async writeText(): Promise<string> {
    throw new Error('gagal tulis manifest');
  }
}

/** File audio gagal ditulis — kondisi crash antara manifest dan file. */
class FileWriteFails extends MemStorage {
  override async writeBlob(): Promise<string> {
    throw new Error('disk penuh');
  }
}

/** Kuota penuh persis seperti dilempar browser saat menulis. */
class QuotaExceeded extends MemStorage {
  override async writeBlob(): Promise<string> {
    throw new DOMException('quota', 'QuotaExceededError');
  }
}

function chunkEvent(overrides?: Partial<RecordingChunkEvent>): RecordingChunkEvent {
  return {
    meetingId: 'm1',
    sequence: 1,
    startTime: 0,
    endTime: 300,
    blob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
    mimeType: 'audio/webm',
    chunkDurationSeconds: 300,
    ...overrides,
  };
}

describe('persistChunk', () => {
  let db: MemoryDatabase;
  let storage: MemStorage;

  beforeEach(() => {
    db = createMemoryRepositories();
    storage = new MemStorage();
  });

  it('menulis manifest, file, dan metadata dengan urutan aman-crash', async () => {
    const chunk = await persistChunk(chunkEvent(), db.repositories, storage);

    expect(chunk.localPath).toBe('Meetings/m1/audio/000001.m4a');
    expect(storage.files.has('Meetings/m1/audio/000001.m4a')).toBe(true);

    const manifest = await readManifest(storage, 'm1');
    expect(manifest).toMatchObject({ meetingId: 'm1', mimeType: 'audio/webm' });
    expect(manifest?.chunks).toHaveLength(1);
    expect(manifest?.chunks[0]).toMatchObject({
      sequence: 1,
      localPath: 'Meetings/m1/audio/000001.m4a',
      startTime: 0,
      endTime: 300,
    });

    expect(chunk).toMatchObject({
      meetingId: 'm1',
      sequence: 1,
      durationSeconds: 300,
      mimeType: 'audio/webm',
      uploadStatus: 'PENDING',
    });
    expect(chunk.byteSize).toBe('audio-bytes'.length);
    expect(await db.repositories.audioChunks.listByMeeting('m1')).toHaveLength(1);
  });

  it('mengurutkan chunk sesuai sequence', async () => {
    await persistChunk(
      chunkEvent({ sequence: 2, startTime: 300, endTime: 600 }),
      db.repositories,
      storage,
    );
    await persistChunk(chunkEvent(), db.repositories, storage);

    const listed = await db.repositories.audioChunks.listByMeeting('m1');
    expect(listed.map((item) => item.sequence)).toEqual([1, 2]);
    const manifest = await readManifest(storage, 'm1');
    expect(manifest?.chunks.map((entry) => entry.sequence)).toEqual([1, 2]);
  });

  it('gagal menulis manifest: tidak ada jejak file/DB (bisa dipulihkan nol)', async () => {
    await expect(
      persistChunk(chunkEvent(), db.repositories, new ManifestWriteFails()),
    ).rejects.toThrow('gagal tulis manifest');

    expect(await db.repositories.audioChunks.listByMeeting('m1')).toHaveLength(0);
  });

  it('crash antara manifest dan file: recovery membuang entri yang belum utuh', async () => {
    const failing = new FileWriteFails();
    await expect(persistChunk(chunkEvent(), db.repositories, failing)).rejects.toThrow(
      'disk penuh',
    );

    // Manifest sudah tertulis, file belum — inilah kondisi pasca-crash.
    expect(await failing.exists(audioManifestPath('m1'))).toBe(true);
    expect(await failing.exists(audioChunkPath('m1', 1))).toBe(false);
    expect(await db.repositories.audioChunks.listByMeeting('m1')).toHaveLength(0);

    const report = await recoverMeeting('m1', db.repositories, failing);
    expect(report.droppedMissingFile).toBe(1);
    expect(report.adopted).toBe(0);
    expect(await readManifest(failing, 'm1')).toBeNull(); // bersih, siap rekam ulang
  });

  it('crash antara file dan DB: recovery mengadopsi dari manifest', async () => {
    // DB gagal di tahap terakhir — manifest + file sudah utuh tertulis.
    const brokenDb = {
      ...db.repositories,
      audioChunks: {
        ...db.repositories.audioChunks,
        add: async (): Promise<never> => {
          throw new Error('db penuh');
        },
      },
    };
    const storage = new MemStorage();

    await expect(persistChunk(chunkEvent(), brokenDb, storage)).rejects.toThrow('db penuh');
    expect(await storage.exists(audioChunkPath('m1', 1))).toBe(true);
    expect(await db.repositories.audioChunks.listByMeeting('m1')).toHaveLength(0);

    const report = await recoverMeeting('m1', db.repositories, storage);
    expect(report).toMatchObject({ adopted: 1, droppedMissingFile: 0, removedMetadata: 0 });
    const listed = await db.repositories.audioChunks.listByMeeting('m1');
    expect(listed[0]).toMatchObject({ sequence: 1, startTime: 0, endTime: 300 });
  });

  it('kuota penuh dipetakan ke STORAGE_FULL (jujur, bisa ditindak)', async () => {
    await expect(
      persistChunk(chunkEvent(), db.repositories, new QuotaExceeded()),
    ).rejects.toMatchObject({ code: 'STORAGE_FULL' });
  });
});
