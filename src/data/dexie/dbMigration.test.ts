import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { NotulaDatabase } from './db';

/** Skema persis v1 (Batch 03) — tanpa kolom transkripsi di audioChunks. */
function createLegacyDatabase(name: string): Dexie {
  const db = new Dexie(name);
  db.version(1).stores({
    meetings: 'id, date, status, createdAt, updatedAt',
    audioChunks: 'id, meetingId, sequence, [meetingId+sequence], createdAt',
    speakers: 'id, meetingId, [meetingId+code], createdAt',
    transcriptSegments: 'id, meetingId, sequence, [meetingId+sequence], startTime',
    bookmarks: 'id, meetingId, timestamp, [meetingId+timestamp]',
    summaries: 'id, meetingId, createdAt',
    decisions: 'id, meetingId, sourceTimestamp, [meetingId+sourceTimestamp]',
    actionItems: 'id, meetingId, status, createdAt',
    minutes: 'id, meetingId, createdAt',
    exports: 'id, meetingId, createdAt',
    syncQueue: 'id, meetingId, status, attempts, createdAt',
  });
  return db;
}

const opened: Array<{ db: Dexie; name: string }> = [];

afterEach(async () => {
  for (const entry of opened.splice(0)) {
    if (entry.db.isOpen()) entry.db.close();
    await entry.db.delete();
  }
});

describe('migrasi Dexie v1 → v2 (Batch 06)', () => {
  it('chunk lama di-backfill: transcriptionStatus PENDING, attempts 0', async () => {
    const name = `notula-migrate-${Date.now()}-a`;
    const legacy = createLegacyDatabase(name);
    await legacy.open();
    await legacy.table('audioChunks').add({
      id: 'chunk-lama',
      meetingId: 'm1',
      sequence: 1,
      localPath: 'Meetings/m1/audio/000001.m4a',
      startTime: 0,
      endTime: 300,
      durationSeconds: 300,
      mimeType: 'audio/webm',
      uploadStatus: 'PENDING',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    legacy.close();

    const migrated = new NotulaDatabase(name);
    opened.push({ db: migrated, name });
    await migrated.open();

    const chunk = await migrated.audioChunks.get('chunk-lama');
    expect(chunk).toBeDefined();
    expect(chunk?.transcriptionStatus).toBe('PENDING');
    expect(chunk?.transcriptionAttempts).toBe(0);
    expect(chunk?.transcriptionError).toBeUndefined();
    expect(chunk?.transcribedAt).toBeUndefined();
  });

  it('data non-transkripsi tidak berubah saat upgrade', async () => {
    const name = `notula-migrate-${Date.now()}-b`;
    const legacy = createLegacyDatabase(name);
    await legacy.open();
    await legacy.table('meetings').add({
      id: 'm-lama',
      title: 'Rapat Lama',
      date: '2026-09-01',
      participants: [],
      language: 'id',
      durationSeconds: 600,
      status: 'COMPLETED',
      storageMode: 'device',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T01:00:00.000Z',
    });
    await legacy.table('audioChunks').add({
      id: 'chunk-lama-2',
      meetingId: 'm-lama',
      sequence: 3,
      localPath: 'Meetings/m-lama/audio/000003.m4a',
      startTime: 600,
      endTime: 900,
      durationSeconds: 300,
      mimeType: 'audio/webm',
      uploadStatus: 'PENDING',
      createdAt: '2026-09-01T00:10:00.000Z',
    });
    legacy.close();

    const migrated = new NotulaDatabase(name);
    opened.push({ db: migrated, name });
    await migrated.open();

    const meeting = await migrated.meetings.get('m-lama');
    expect(meeting).toMatchObject({ title: 'Rapat Lama', status: 'COMPLETED' });

    const chunk = await migrated.audioChunks.get('chunk-lama-2');
    expect(chunk).toMatchObject({
      sequence: 3,
      startTime: 600,
      endTime: 900,
      uploadStatus: 'PENDING',
      transcriptionStatus: 'PENDING',
    });
  });
});
