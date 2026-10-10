import { beforeEach, describe, expect, it } from 'vitest';
import { audioManifestPath } from '../../core/utils/paths';
import { MemStorage } from './memStorage';
import { readManifest, recordChunkInManifest, writeManifest } from './manifest';

describe('manifest chunk audio', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('roundtrip: tulis lalu baca kembali', async () => {
    await writeManifest(storage, {
      version: 1,
      meetingId: 'm1',
      mimeType: 'audio/webm',
      chunkDurationSeconds: 300,
      updatedAt: '2026-10-07T00:00:00.000Z',
      chunks: [
        {
          sequence: 1,
          localPath: 'Meetings/m1/audio/000001.m4a',
          startTime: 0,
          endTime: 300,
          byteSize: 10,
          mimeType: 'audio/webm',
        },
      ],
    });

    const manifest = await readManifest(storage, 'm1');
    expect(manifest?.meetingId).toBe('m1');
    expect(manifest?.chunks).toHaveLength(1);
  });

  it('belum ada file → null (bukan error)', async () => {
    expect(await readManifest(storage, 'm1')).toBeNull();
  });

  it('JSON korup atau skema invalid → null (jujur, tidak melempar)', async () => {
    await storage.writeText(audioManifestPath('m1'), 'bukan-json');
    expect(await readManifest(storage, 'm1')).toBeNull();

    await storage.writeText(audioManifestPath('m1'), JSON.stringify({ version: 1 }));
    expect(await readManifest(storage, 'm1')).toBeNull();
  });

  it('manifest milik rapat lain → ditolak', async () => {
    await storage.writeText(
      audioManifestPath('m1'),
      JSON.stringify({
        version: 1,
        meetingId: 'm2',
        mimeType: 'audio/webm',
        updatedAt: '2026-10-07T00:00:00.000Z',
        chunks: [],
      }),
    );
    expect(await readManifest(storage, 'm1')).toBeNull();
  });

  it('recordChunkInManifest meng-upsert per sequence (retry tidak dobel)', async () => {
    const meta = { meetingId: 'm1', mimeType: 'audio/webm', chunkDurationSeconds: 300 };
    const entry = {
      sequence: 1,
      localPath: 'Meetings/m1/audio/000001.m4a',
      startTime: 0,
      endTime: 300,
      mimeType: 'audio/webm',
    };

    await recordChunkInManifest(storage, entry, meta);
    await recordChunkInManifest(storage, { ...entry, endTime: 250 }, meta);

    const manifest = await readManifest(storage, 'm1');
    expect(manifest?.chunks).toHaveLength(1);
    expect(manifest?.chunks[0]?.endTime).toBe(250);
  });
});
