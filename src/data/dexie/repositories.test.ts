import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '../repositories';
import { NotulaDatabase } from './db';
import { createDexieRepositories } from './repositories';

let db: NotulaDatabase;
let repos: Repositories;
let dbName: string;

beforeEach(() => {
  dbName = `notula-test-${Math.random().toString(36).slice(2)}`;
  db = new NotulaDatabase(dbName);
  repos = createDexieRepositories(db);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe('Dexie MeetingRepository', () => {
  it('membuat rapat dengan default yang benar', async () => {
    const meeting = await repos.meetings.create({
      title: 'Rapat Koordinasi TKA SD',
      date: '2026-10-07',
      location: 'Ruang Guru',
    });

    expect(meeting.id).toBeTruthy();
    expect(meeting.status).toBe('DRAFT');
    expect(meeting.storageMode).toBe('device');
    expect(meeting.language).toBe('id');
    expect(meeting.durationSeconds).toBe(0);
    expect(await repos.meetings.getById(meeting.id)).toEqual(meeting);
  });

  it('list terbaru diurutkan dari yang terbaru dan mendukung limit', async () => {
    const first = await repos.meetings.create({ title: 'A', date: '2026-10-01' });
    const second = await repos.meetings.create({ title: 'B', date: '2026-10-02' });

    // Paksa createdAt berbeda agar urutan pasti (dalam produksi bisa sama milidetik).
    await db.meetings.put({ ...second, createdAt: '2026-10-02T00:00:00.000Z' });
    await db.meetings.put({ ...first, createdAt: '2026-10-01T00:00:00.000Z' });

    const list = await repos.meetings.list();
    expect(list.map((m) => m.id)).toEqual([second.id, first.id]);
    expect((await repos.meetings.list({ limit: 1 })).map((m) => m.id)).toEqual([second.id]);
  });

  it('update mempertahankan id & createdAt', async () => {
    const meeting = await repos.meetings.create({ title: 'A', date: '2026-10-01' });
    const updated = await repos.meetings.update(meeting.id, { status: 'RECORDING' });

    expect(updated.id).toBe(meeting.id);
    expect(updated.createdAt).toBe(meeting.createdAt);
    expect(updated.status).toBe('RECORDING');
    expect(updated.updatedAt).not.toBe('');
  });
});

describe('Dexie cascade delete', () => {
  it('menghapus meeting beserta seluruh data turunannya', async () => {
    const meeting = await repos.meetings.create({ title: 'Rapat', date: '2026-10-07' });
    const id = meeting.id;
    const timestamp = new Date().toISOString();

    await repos.audioChunks.add({
      id: 'chunk-1',
      meetingId: id,
      sequence: 1,
      localPath: 'Meetings/x/audio/000001.m4a',
      startTime: 0,
      endTime: 300,
      durationSeconds: 300,
      mimeType: 'audio/mp4',
      uploadStatus: 'PENDING',
      transcriptionStatus: 'PENDING',
      transcriptionAttempts: 0,
      createdAt: timestamp,
    });
    await repos.speakers.add({
      id: 'spk-1',
      meetingId: id,
      code: 'speaker_1',
      displayName: 'Pembicara 1',
      durationSeconds: 60,
      segmentCount: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await repos.transcript.addSegments([
      {
        id: 'seg-1',
        meetingId: id,
        startTime: 0,
        endTime: 5,
        text: 'Halo',
        sequence: 1,
        createdAt: timestamp,
      },
    ]);
    await repos.summaries.save({
      id: 'sum-1',
      meetingId: id,
      content: 'Ringkasan',
      topics: [],
      undecided: [],
      sourceSegmentIds: [],
      createdAt: timestamp,
    });
    await repos.minutes.save({
      id: 'min-1',
      meetingId: id,
      templateId: 'umum',
      sections: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await repos.decisions.replaceForMeeting(id, [
      {
        id: 'dec-1',
        meetingId: id,
        content: 'Sepakat',
        sourceTimestamp: 10,
        createdAt: timestamp,
      },
    ]);

    await repos.meetings.delete(id);

    expect(await repos.meetings.getById(id)).toBeNull();
    expect(await repos.audioChunks.listByMeeting(id)).toHaveLength(0);
    expect(await repos.speakers.listByMeeting(id)).toHaveLength(0);
    expect(await repos.transcript.listByMeeting(id)).toHaveLength(0);
    expect(await repos.summaries.get(id)).toBeNull();
    expect(await repos.minutes.get(id)).toBeNull();
    expect(await repos.decisions.listByMeeting(id)).toHaveLength(0);
  });
});

describe('Dexie AudioChunkRepository.delete (dipakai recovery)', () => {
  it('menghapus satu chunk; id kedua kali melempar', async () => {
    const meeting = await repos.meetings.create({ title: 'Rapat', date: '2026-10-07' });
    await repos.audioChunks.add({
      id: 'chunk-del',
      meetingId: meeting.id,
      sequence: 1,
      localPath: `Meetings/${meeting.id}/audio/000001.m4a`,
      startTime: 0,
      endTime: 300,
      durationSeconds: 300,
      mimeType: 'audio/webm',
      uploadStatus: 'PENDING',
      transcriptionStatus: 'PENDING',
      transcriptionAttempts: 0,
      createdAt: new Date().toISOString(),
    });

    await repos.audioChunks.delete('chunk-del');
    expect(await repos.audioChunks.getById('chunk-del')).toBeNull();
    await expect(repos.audioChunks.delete('chunk-del')).rejects.toThrow(
      'Audio chunk chunk-del tidak ditemukan',
    );
  });
});

describe('Dexie summary & minutes (satu per rapat)', () => {
  it('save terakhir menggantikan hasil sebelumnya', async () => {
    const meeting = await repos.meetings.create({ title: 'A', date: '2026-10-01' });
    const timestamp = new Date().toISOString();

    await repos.summaries.save({
      id: 'v1',
      meetingId: meeting.id,
      content: 'Pertama',
      topics: [],
      undecided: [],
      sourceSegmentIds: [],
      createdAt: timestamp,
    });
    await repos.summaries.save({
      id: 'v2',
      meetingId: meeting.id,
      content: 'Kedua',
      topics: [],
      undecided: [],
      sourceSegmentIds: [],
      createdAt: timestamp,
    });

    const summary = await repos.summaries.get(meeting.id);
    expect(summary?.id).toBe('v2');
    expect(await db.summaries.where('meetingId').equals(meeting.id).count()).toBe(1);
  });
});

describe('Dexie persistensi (survive reload)', () => {
  it('data tetap ada setelah koneksi DB ditutup dan dibuka ulang', async () => {
    const meeting = await repos.meetings.create({ title: 'Rapat Tetap', date: '2026-10-07' });

    db.close();
    const reopened = new NotulaDatabase(dbName);
    const reopenedRepos = createDexieRepositories(reopened);

    const loaded = await reopenedRepos.meetings.getById(meeting.id);
    expect(loaded?.title).toBe('Rapat Tetap');

    reopened.close();
    await reopened.delete();
  });
});

describe('SyncQueue retry idempotent', () => {
  it('FAILED → RETRY hanya untuk item yang gagal', async () => {
    const meeting = await repos.meetings.create({ title: 'A', date: '2026-10-01' });
    const timestamp = new Date().toISOString();

    await repos.syncQueue.enqueue({
      id: 'q-1',
      entityKind: 'meeting',
      entityId: meeting.id,
      meetingId: meeting.id,
      status: 'FAILED',
      attempts: 1,
      lastError: 'timeout',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await repos.syncQueue.enqueue({
      id: 'q-2',
      entityKind: 'meeting',
      entityId: meeting.id,
      meetingId: meeting.id,
      status: 'SUCCESS',
      attempts: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const retried = await repos.syncQueue.retryFailed(meeting.id);
    expect(retried.map((item) => item.id)).toEqual(['q-1']);
    expect(retried[0]?.status).toBe('RETRY');
    expect((await repos.syncQueue.listPending()).map((item) => item.id)).toEqual(['q-1']);
  });
});
