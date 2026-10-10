import { beforeEach, describe, expect, it } from 'vitest';
import type { AudioChunk, TranscriptSegment } from '../../core/types/entities';
import { createMemoryRepositories, type MemoryDatabase } from './repositories';

let db: MemoryDatabase;

beforeEach(() => {
  db = createMemoryRepositories();
});

const newChunk = (meetingId: string, sequence: number): AudioChunk => ({
  id: `chunk-${meetingId}-${sequence}`,
  meetingId,
  sequence,
  localPath: `Meetings/${meetingId}/audio/${String(sequence).padStart(6, '0')}.m4a`,
  startTime: (sequence - 1) * 300,
  endTime: sequence * 300,
  durationSeconds: 300,
  mimeType: 'audio/mp4',
  uploadStatus: 'PENDING',
  transcriptionStatus: 'PENDING',
  transcriptionAttempts: 0,
  createdAt: new Date().toISOString(),
});

const newSegment = (meetingId: string, sequence: number, startTime: number): TranscriptSegment => ({
  id: `seg-${meetingId}-${sequence}`,
  meetingId,
  startTime,
  endTime: startTime + 5,
  text: `Segmen ${sequence}`,
  sequence,
  createdAt: new Date().toISOString(),
});

describe('MeetingRepository', () => {
  it('membuat meeting dengan default yang benar', async () => {
    const meeting = await db.repositories.meetings.create({
      title: 'Rapat Koordinasi TKA SD',
      date: '2026-10-07',
    });

    expect(meeting.id).toBeTruthy();
    expect(meeting.status).toBe('DRAFT');
    expect(meeting.storageMode).toBe('device');
    expect(meeting.language).toBe('id');
    expect(meeting.durationSeconds).toBe(0);
    expect(await db.repositories.meetings.getById(meeting.id)).toEqual(meeting);
  });

  it('list terbaru di urutkan dari yang terbaru', async () => {
    const first = await db.repositories.meetings.create({ title: 'A', date: '2026-10-01' });
    const second = await db.repositories.meetings.create({ title: 'B', date: '2026-10-02' });

    const list = await db.repositories.meetings.list();
    expect(list.map((m) => m.id)).toEqual([second.id, first.id]);
    expect((await db.repositories.meetings.list({ limit: 1 })).map((m) => m.id)).toEqual([
      second.id,
    ]);
  });

  it('update mempertahankan id & createdAt', async () => {
    const meeting = await db.repositories.meetings.create({ title: 'A', date: '2026-10-01' });
    const updated = await db.repositories.meetings.update(meeting.id, { status: 'RECORDING' });

    expect(updated.id).toBe(meeting.id);
    expect(updated.createdAt).toBe(meeting.createdAt);
    expect(updated.status).toBe('RECORDING');
  });

  it('update meeting yang tidak ada melempar error', async () => {
    await expect(db.repositories.meetings.update('tidak-ada', { title: 'x' })).rejects.toThrow(
      'tidak ditemukan',
    );
  });

  it('delete meeting melakukan cascade ke data turunan', async () => {
    const meeting = await db.repositories.meetings.create({ title: 'A', date: '2026-10-01' });
    await db.repositories.audioChunks.add(newChunk(meeting.id, 1));
    await db.repositories.transcript.addSegments([newSegment(meeting.id, 1, 0)]);
    await db.repositories.summaries.save({
      id: 's1',
      meetingId: meeting.id,
      content: 'Ringkasan',
      topics: [],
      undecided: [],
      sourceSegmentIds: [],
      createdAt: new Date().toISOString(),
    });

    await db.repositories.meetings.delete(meeting.id);

    expect(await db.repositories.meetings.getById(meeting.id)).toBeNull();
    expect(await db.repositories.audioChunks.listByMeeting(meeting.id)).toEqual([]);
    expect(await db.repositories.transcript.listByMeeting(meeting.id)).toEqual([]);
    expect(await db.repositories.summaries.get(meeting.id)).toBeNull();
  });
});

describe('TranscriptRepository', () => {
  it('segmen diurutkan berdasarkan sequence', async () => {
    const meeting = await db.repositories.meetings.create({ title: 'A', date: '2026-10-01' });
    await db.repositories.transcript.addSegments([
      newSegment(meeting.id, 2, 30),
      newSegment(meeting.id, 1, 0),
      newSegment(meeting.id, 3, 60),
    ]);

    const segments = await db.repositories.transcript.listByMeeting(meeting.id);
    expect(segments.map((s) => s.sequence)).toEqual([1, 2, 3]);
    expect(segments.map((s) => s.startTime)).toEqual([0, 30, 60]);
  });

  it('update segmen menandai editedAt', async () => {
    const meeting = await db.repositories.meetings.create({ title: 'A', date: '2026-10-01' });
    const [segment] = await db.repositories.transcript.addSegments([newSegment(meeting.id, 1, 0)]);

    const updated = await db.repositories.transcript.updateSegment(segment!.id, {
      text: 'Koreksi teks',
    });
    expect(updated.text).toBe('Koreksi teks');
    expect(updated.editedAt).toBeTruthy();
  });
});

describe('AudioChunkRepository', () => {
  it('chunk diurutkan berdasarkan sequence dan bisa diupdate', async () => {
    const meeting = await db.repositories.meetings.create({ title: 'A', date: '2026-10-01' });
    await db.repositories.audioChunks.add(newChunk(meeting.id, 2));
    await db.repositories.audioChunks.add(newChunk(meeting.id, 1));

    const chunks = await db.repositories.audioChunks.listByMeeting(meeting.id);
    expect(chunks.map((c) => c.sequence)).toEqual([1, 2]);

    const updated = await db.repositories.audioChunks.update(chunks[0]!.id, {
      uploadStatus: 'SUCCESS',
    });
    expect(updated.uploadStatus).toBe('SUCCESS');
  });
});

describe('SpeakerRepository', () => {
  it('rename pembicara bekerja dan mempertahankan meetingId', async () => {
    const meeting = await db.repositories.meetings.create({ title: 'A', date: '2026-10-01' });
    const speaker = await db.repositories.speakers.add({
      id: 'sp1',
      meetingId: meeting.id,
      code: 'speaker_1',
      displayName: 'Pembicara 1',
      durationSeconds: 0,
      segmentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const renamed = await db.repositories.speakers.rename(speaker.id, 'Kepala Sekolah');
    expect(renamed.displayName).toBe('Kepala Sekolah');
    expect(renamed.meetingId).toBe(meeting.id);
  });
});

describe('SyncQueueRepository', () => {
  const item = (id: string) => ({
    id,
    entityKind: 'audio' as const,
    entityId: id,
    meetingId: 'm1',
    status: 'PENDING' as const,
    attempts: 0,
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
  });

  it('siklus status: pending → uploading → success', async () => {
    await db.repositories.syncQueue.enqueue(item('q1'));
    await db.repositories.syncQueue.markUploading('q1');
    const done = await db.repositories.syncQueue.markSuccess('q1');

    expect(done.status).toBe('SUCCESS');
    expect(await db.repositories.syncQueue.listPending()).toEqual([]);
  });

  it('gagal → retry idempotent (attempts naik, tidak menggandakan item)', async () => {
    await db.repositories.syncQueue.enqueue(item('q1'));
    await db.repositories.syncQueue.markFailed('q1', 'network down');

    const failedList = await db.repositories.syncQueue.listByMeeting('m1');
    expect(failedList).toHaveLength(1);
    expect(failedList[0]!.attempts).toBe(1);
    expect(failedList[0]!.lastError).toBe('network down');
    expect(await db.repositories.syncQueue.listPending()).toEqual([]);

    const retried = await db.repositories.syncQueue.retryFailed('m1');
    expect(retried).toHaveLength(1);
    expect(retried[0]!.status).toBe('RETRY');
    expect((await db.repositories.syncQueue.listPending()).map((i) => i.id)).toEqual(['q1']);
    expect((await db.repositories.syncQueue.listByMeeting('m1')).length).toBe(1);
  });
});
