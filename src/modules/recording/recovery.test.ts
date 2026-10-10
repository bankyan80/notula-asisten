import { beforeEach, describe, expect, it } from 'vitest';
import { audioChunkPath, audioManifestPath } from '../../core/utils/paths';
import { createMemoryRepositories, type MemoryDatabase } from '../../data/memory/repositories';
import { MemStorage } from './memStorage';
import { readManifest } from './manifest';
import { recoverMeeting, recoverAllMeetings } from './recovery';

const MEETING = 'm1';

async function writeManifestWith(
  storage: MemStorage,
  entries: Array<{
    sequence: number;
    startTime: number;
    endTime: number;
    mimeType?: string;
  }>,
): Promise<void> {
  await storage.writeText(
    audioManifestPath(MEETING),
    JSON.stringify({
      version: 1,
      meetingId: MEETING,
      mimeType: 'audio/webm',
      chunkDurationSeconds: 300,
      updatedAt: new Date().toISOString(),
      chunks: entries.map((entry) => ({
        sequence: entry.sequence,
        localPath: audioChunkPath(MEETING, entry.sequence),
        startTime: entry.startTime,
        endTime: entry.endTime,
        byteSize: 4,
        mimeType: entry.mimeType ?? 'audio/webm',
      })),
    }),
  );
}

async function writeFile(storage: MemStorage, sequence: number): Promise<void> {
  await storage.writeBlob(audioChunkPath(MEETING, sequence), new Blob(['data']));
}

describe('recoverMeeting — pemulihan chunk pasca-crash', () => {
  let db: MemoryDatabase;
  let storage: MemStorage;

  beforeEach(() => {
    db = createMemoryRepositories();
    storage = new MemStorage();
  });

  it('mengadopsi chunk dari manifest saat metadata DB hilang', async () => {
    await writeManifestWith(storage, [{ sequence: 1, startTime: 0, endTime: 300 }]);
    await writeFile(storage, 1);

    const report = await recoverMeeting(MEETING, db.repositories, storage);

    expect(report).toMatchObject({ adopted: 1, droppedMissingFile: 0, removedMetadata: 0 });
    const listed = await db.repositories.audioChunks.listByMeeting(MEETING);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      sequence: 1,
      localPath: 'Meetings/m1/audio/000001.m4a',
      startTime: 0,
      endTime: 300,
      durationSeconds: 300,
    });
  });

  it('membuang entri manifest yang file-nya belum tertulis', async () => {
    await writeManifestWith(storage, [{ sequence: 1, startTime: 0, endTime: 300 }]);

    const report = await recoverMeeting(MEETING, db.repositories, storage);

    expect(report.droppedMissingFile).toBe(1);
    expect(await readManifest(storage, MEETING)).toBeNull(); // manifest kosong dibersihkan
    expect(await db.repositories.audioChunks.listByMeeting(MEETING)).toHaveLength(0);
  });

  it('menghapus metadata DB yang file-nya hilang (tidak gantung)', async () => {
    await db.repositories.audioChunks.add({
      id: 'chunk-1',
      meetingId: MEETING,
      sequence: 1,
      localPath: 'Meetings/m1/audio/000001.m4a',
      startTime: 0,
      endTime: 300,
      durationSeconds: 300,
      mimeType: 'audio/webm',
      uploadStatus: 'PENDING',
      transcriptionStatus: 'PENDING',
      transcriptionAttempts: 0,
      createdAt: new Date().toISOString(),
    });

    const report = await recoverMeeting(MEETING, db.repositories, storage);

    expect(report.removedMetadata).toBe(1);
    expect(await db.repositories.audioChunks.listByMeeting(MEETING)).toHaveLength(0);
  });

  it('idempoten: data sehat tidak diubah, panggil dua kali hasil sama', async () => {
    await writeManifestWith(storage, [{ sequence: 1, startTime: 0, endTime: 300 }]);
    await writeFile(storage, 1);
    await recoverMeeting(MEETING, db.repositories, storage);

    const second = await recoverMeeting(MEETING, db.repositories, storage);

    expect(second).toMatchObject({
      adopted: 0,
      droppedMissingFile: 0,
      removedMetadata: 0,
      repairedManifest: 0,
      orphanFiles: [],
    });
    expect(await db.repositories.audioChunks.listByMeeting(MEETING)).toHaveLength(1);
    expect(storage.files.has(audioChunkPath(MEETING, 1))).toBe(true);
  });

  it('membangun ulang manifest dari metadata DB saat manifest hilang', async () => {
    await writeFile(storage, 1);
    await db.repositories.audioChunks.add({
      id: 'chunk-1',
      meetingId: MEETING,
      sequence: 1,
      localPath: 'Meetings/m1/audio/000001.m4a',
      startTime: 0,
      endTime: 300,
      durationSeconds: 300,
      byteSize: 4,
      mimeType: 'audio/webm',
      uploadStatus: 'PENDING',
      transcriptionStatus: 'PENDING',
      transcriptionAttempts: 0,
      createdAt: new Date().toISOString(),
    });

    const report = await recoverMeeting(MEETING, db.repositories, storage);

    expect(report.repairedManifest).toBe(1);
    const manifest = await readManifest(storage, MEETING);
    expect(manifest?.chunks[0]).toMatchObject({ sequence: 1, startTime: 0, endTime: 300 });
  });

  it('file yatim tanpa jejak manifest/DB: dibiarkan utuh dan dilaporkan', async () => {
    await writeFile(storage, 7);

    const report = await recoverMeeting(MEETING, db.repositories, storage);

    expect(report.orphanFiles).toEqual(['Meetings/m1/audio/000007.m4a']);
    expect(report.adopted).toBe(0);
    expect(storage.files.has(audioChunkPath(MEETING, 7))).toBe(true);
    expect(await db.repositories.audioChunks.listByMeeting(MEETING)).toHaveLength(0);
  });

  it('manifest korup + file ada: timeline tidak diketahui → dilaporkan, tidak diadopsi', async () => {
    await storage.writeText(audioManifestPath(MEETING), '{rusak json');
    await writeFile(storage, 1);

    const report = await recoverMeeting(MEETING, db.repositories, storage);

    expect(report.adopted).toBe(0);
    expect(report.orphanFiles).toEqual(['Meetings/m1/audio/000001.m4a']);
    expect(storage.files.has(audioChunkPath(MEETING, 1))).toBe(true);
  });

  it('file tak dikenal di folder audio ikut dilaporkan sebagai orphan', async () => {
    await storage.writeText('Meetings/m1/audio/catatan.txt', 'aneh');

    const report = await recoverMeeting(MEETING, db.repositories, storage);

    expect(report.orphanFiles).toEqual(['Meetings/m1/audio/catatan.txt']);
  });

  it('recoverAllMeetings hanya memperbaiki rapat yang rusak', async () => {
    const good = await db.repositories.meetings.create({ title: 'Sehat', date: '2026-10-07' });
    const broken = await db.repositories.meetings.create({
      title: 'Rusak',
      date: '2026-10-07',
    });

    // Rusak: manifest + file ada, DB hilang — pada rapat "broken".
    const brokenStorage = new MemStorage();
    await brokenStorage.writeText(
      audioManifestPath(broken.id),
      JSON.stringify({
        version: 1,
        meetingId: broken.id,
        mimeType: 'audio/webm',
        chunkDurationSeconds: 300,
        updatedAt: new Date().toISOString(),
        chunks: [
          {
            sequence: 1,
            localPath: `Meetings/${broken.id}/audio/000001.m4a`,
            startTime: 0,
            endTime: 300,
            mimeType: 'audio/webm',
          },
        ],
      }),
    );
    await brokenStorage.writeBlob(`Meetings/${broken.id}/audio/000001.m4a`, new Blob(['x']));

    const reports = await recoverAllMeetings(db.repositories, brokenStorage);

    expect(reports).toHaveLength(2);
    const damaged = reports.find((report) => report.meetingId === broken.id);
    const healthy = reports.find((report) => report.meetingId === good.id);
    expect(damaged?.adopted).toBe(1);
    expect(healthy).toMatchObject({ adopted: 0, removedMetadata: 0 });
    expect(await db.repositories.audioChunks.listByMeeting(good.id)).toHaveLength(0);
  });
});
