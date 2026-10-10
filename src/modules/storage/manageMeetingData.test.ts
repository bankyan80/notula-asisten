import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import { nowIso } from '../../core/utils/time';
import { deleteMeetingDataKind } from './manageMeetingData';

let meetingId = '';

beforeEach(async () => {
  resetRepositories();
  await clearAllLocalData();
  const meeting = await getRepositories().meetings.create({
    title: 'Rapus Kelola Data',
    date: '2026-10-07',
  });
  meetingId = meeting.id;
});

async function seedAudio(): Promise<void> {
  await getRepositories().audioChunks.add({
    id: 'chunk-1',
    meetingId,
    sequence: 1,
    localPath: `Meetings/${meetingId}/audio/000001.m4a`,
    startTime: 0,
    endTime: 30,
    durationSeconds: 30,
    mimeType: 'audio/webm',
    uploadStatus: 'PENDING',
    transcriptionStatus: 'DONE',
    transcriptionAttempts: 1,
    createdAt: nowIso(),
  });
}

async function seedTranscript(): Promise<void> {
  await getRepositories().transcript.addSegments([
    {
      id: 'seg-1',
      meetingId,
      startTime: 0,
      endTime: 5,
      text: 'Satu',
      sequence: 0,
      createdAt: nowIso(),
    },
    {
      id: 'seg-2',
      meetingId,
      startTime: 5,
      endTime: 10,
      text: 'Dua',
      sequence: 1,
      createdAt: nowIso(),
    },
  ]);
}

async function seedAI(): Promise<void> {
  await getRepositories().summaries.save({
    id: 'sum-1',
    meetingId,
    content: 'Ringkasan.',
    topics: [],
    undecided: [],
    sourceSegmentIds: [],
    createdAt: nowIso(),
  });
  await getRepositories().decisions.replaceForMeeting(meetingId, [
    {
      id: 'dec-1',
      meetingId,
      content: 'Disetujui.',
      sourceTimestamp: 3,
      createdAt: nowIso(),
    },
  ]);
  await getRepositories().actionItems.replaceForMeeting(meetingId, [
    {
      id: 'act-1',
      meetingId,
      task: 'Kirim laporan',
      assignee: 'Budi',
      status: 'OPEN',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ]);
  await getRepositories().minutes.save({
    id: 'min-1',
    meetingId,
    templateId: 'rapat-rutin',
    sections: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  await getRepositories().speakers.add({
    id: 'sp-1',
    meetingId,
    code: 'speaker_1',
    displayName: 'Pembicara 1',
    durationSeconds: 10,
    segmentCount: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

describe('deleteMeetingDataKind (PRD §26)', () => {
  it('hapus audio: chunk hilang, transkrip & rapat tetap ada', async () => {
    await seedAudio();
    await seedTranscript();

    const removed = await deleteMeetingDataKind(getRepositories(), meetingId, 'audio');

    expect(removed).toBe(1);
    expect(await getRepositories().audioChunks.listByMeeting(meetingId)).toHaveLength(0);
    expect(await getRepositories().transcript.listByMeeting(meetingId)).toHaveLength(2);
    expect(await getRepositories().meetings.getById(meetingId)).not.toBeNull();
  });

  it('hapus transkrip: segmen hilang, audio & rapat tetap ada', async () => {
    await seedAudio();
    await seedTranscript();

    const removed = await deleteMeetingDataKind(getRepositories(), meetingId, 'transcript');

    expect(removed).toBe(2);
    expect(await getRepositories().transcript.listByMeeting(meetingId)).toHaveLength(0);
    expect(await getRepositories().audioChunks.listByMeeting(meetingId)).toHaveLength(1);
    expect(await getRepositories().meetings.getById(meetingId)).not.toBeNull();
  });

  it('hapus hasil AI: ringkasan/keputusan/tindak lanjut/notulen/pembicara hilang bersama', async () => {
    await seedAI();

    const removed = await deleteMeetingDataKind(getRepositories(), meetingId, 'ai');

    expect(removed).toBe(5);
    expect(await getRepositories().summaries.get(meetingId)).toBeNull();
    expect(await getRepositories().decisions.listByMeeting(meetingId)).toHaveLength(0);
    expect(await getRepositories().actionItems.listByMeeting(meetingId)).toHaveLength(0);
    expect(await getRepositories().minutes.get(meetingId)).toBeNull();
    expect(await getRepositories().speakers.listByMeeting(meetingId)).toHaveLength(0);
    expect(await getRepositories().meetings.getById(meetingId)).not.toBeNull();
  });

  it('tidak ada data → 0 (jujur), bukan error', async () => {
    expect(await deleteMeetingDataKind(getRepositories(), meetingId, 'audio')).toBe(0);
    expect(await deleteMeetingDataKind(getRepositories(), meetingId, 'transcript')).toBe(0);
    expect(await deleteMeetingDataKind(getRepositories(), meetingId, 'ai')).toBe(0);
  });
});
