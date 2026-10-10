import { beforeEach, describe, expect, it } from 'vitest';
import type { MeetingStatus } from '../../core/types/entities';
import { createMemoryRepositories, type MemoryDatabase } from '../../data/memory/repositories';
import type {
  DiarizationRequest,
  SpeakerDiarizationProvider,
  SpeakerSegment,
} from '../../core/types/providers';
import { MemStorage } from '../recording/memStorage';
import { processDiarization, type DiarizationReport } from './runDiarization';

class FakeDiarization implements SpeakerDiarizationProvider {
  readonly id = 'fake-diarization';
  available = true;
  calls = 0;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async identifySegments(request: DiarizationRequest): Promise<SpeakerSegment[]> {
    // Buktikan jalur baca file dipakai — error storage menyebar (jujur).
    await request.readAudio();
    this.calls += 1;
    if (request.chunk.sequence === 1) {
      return [
        { startTime: 0, endTime: 10, speakerCode: 'speaker_1' },
        { startTime: 11, endTime: 20, speakerCode: 'speaker_2' },
      ];
    }
    return [{ startTime: 0, endTime: 300, speakerCode: 'speaker_1' }];
  }
}

interface Seed {
  meetingId: string;
  storage: MemStorage;
}

async function seed(
  db: MemoryDatabase,
  options: { status?: MeetingStatus; segments?: boolean; files?: boolean } = {},
): Promise<Seed> {
  const { status = 'COMPLETED', segments = true, files = true } = options;
  const meeting = await db.repositories.meetings.create({
    title: 'Rapat Diarization',
    date: '2026-10-07',
  });
  await db.repositories.meetings.update(meeting.id, { status });

  const storage = new MemStorage();
  for (const sequence of [1, 2]) {
    const path = `Meetings/${meeting.id}/audio/${String(sequence).padStart(6, '0')}.m4a`;
    if (files) await storage.writeBlob(path, new Blob(['audio']));
    await db.repositories.audioChunks.add({
      id: `chunk-${sequence}`,
      meetingId: meeting.id,
      sequence,
      localPath: path,
      startTime: (sequence - 1) * 300,
      endTime: sequence * 300,
      durationSeconds: 300,
      mimeType: 'audio/webm',
      uploadStatus: 'PENDING',
      transcriptionStatus: 'DONE',
      transcriptionAttempts: 1,
      createdAt: new Date().toISOString(),
    });
  }

  if (segments) {
    await db.repositories.transcript.addSegments([
      {
        id: 'seg-a',
        meetingId: meeting.id,
        startTime: 0,
        endTime: 5,
        text: 'Pembuka',
        sequence: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'seg-b',
        meetingId: meeting.id,
        startTime: 12,
        endTime: 18,
        text: 'Selaan',
        sequence: 1,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'seg-c',
        meetingId: meeting.id,
        startTime: 400,
        endTime: 420,
        text: 'Penutup',
        sequence: 2,
        createdAt: new Date().toISOString(),
      },
    ]);
  }
  return { meetingId: meeting.id, storage };
}

function run(
  db: MemoryDatabase,
  storage: MemStorage,
  provider: FakeDiarization,
  isRecordingActive?: () => boolean,
): Promise<DiarizationReport[]> {
  return processDiarization({
    repositories: db.repositories,
    provider,
    storage,
    isRecordingActive,
  });
}

describe('processDiarization — pipeline pembicara', () => {
  let db: MemoryDatabase;
  let provider: FakeDiarization;
  let storage: MemStorage;

  beforeEach(() => {
    db = createMemoryRepositories();
    provider = new FakeDiarization();
    storage = new MemStorage();
  });

  it('assignment penuh: segmen → pembicara, statistik dari transkrip', async () => {
    const { meetingId, storage: seeded } = await seed(db);
    storage = seeded;

    const reports = await run(db, storage, provider);

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      status: 'PROCESSED',
      meetingId,
      speakersUpserted: 2,
      segmentsAssigned: 3,
    });

    const speakers = await db.repositories.speakers.listByMeeting(meetingId);
    expect(speakers.map((speaker) => speaker.code)).toEqual(['speaker_1', 'speaker_2']);
    expect(speakers.map((speaker) => speaker.displayName)).toEqual(['Pembicara 1', 'Pembicara 2']);

    const [speaker1, speaker2] = speakers;
    const segments = await db.repositories.transcript.listByMeeting(meetingId);
    expect(segments[0]?.speakerId).toBe(speaker1?.id);
    expect(segments[1]?.speakerId).toBe(speaker2?.id);
    expect(segments[2]?.speakerId).toBe(speaker1?.id);

    // Durasi dihitung ulang dari segmen: s1 = (5−0)+(420−400)=25 dtk; s2 = 6 dtk.
    expect(speaker1).toMatchObject({ durationSeconds: 25, segmentCount: 2 });
    expect(speaker2).toMatchObject({ durationSeconds: 6, segmentCount: 1 });
    expect(provider.calls).toBe(2);
  });

  it('run ulang tanpa perubahan → dilewati tanpa decode audio', async () => {
    const { storage: seeded } = await seed(db);
    storage = seeded;
    await run(db, storage, provider);
    const callsAfterFirst = provider.calls;

    const reports = await run(db, storage, provider);

    expect(reports[0]).toMatchObject({ status: 'SKIPPED', skipReason: 'ALREADY_ASSIGNED' });
    expect(provider.calls).toBe(callsAfterFirst);
  });

  it('rename pengguna TIDAK PERNAH ditimpa saat run ulang (PRD §13)', async () => {
    const { meetingId, storage: seeded } = await seed(db);
    storage = seeded;
    await run(db, storage, provider);

    const [speaker1] = await db.repositories.speakers.listByMeeting(meetingId);
    await db.repositories.speakers.rename(speaker1!.id, 'Kepala Sekolah');

    // Segmen baru muncul (transkripsi susulan) → assignment ulang harus jalan.
    await db.repositories.transcript.addSegments([
      {
        id: 'seg-d',
        meetingId,
        startTime: 2,
        endTime: 4,
        text: 'Tambahan',
        sequence: 3,
        createdAt: new Date().toISOString(),
      },
    ]);
    await db.repositories.transcript.updateSegment('seg-a', { speakerId: undefined });

    const reports = await run(db, storage, provider);

    expect(reports[0]?.status).toBe('PROCESSED');
    const speakers = await db.repositories.speakers.listByMeeting(meetingId);
    expect(speakers.find((speaker) => speaker.code === 'speaker_1')?.displayName).toBe(
      'Kepala Sekolah',
    );
    // Statistik ikut menyesuaikan data baru.
    const refreshed = speakers.find((speaker) => speaker.code === 'speaker_1');
    expect(refreshed?.segmentCount).toBeGreaterThanOrEqual(3);
  });

  it('provider tidak tersedia → SKIPPED jujur, tidak ada data diubah', async () => {
    const { meetingId, storage: seeded } = await seed(db);
    storage = seeded;
    provider.available = false;

    const reports = await run(db, storage, provider);

    expect(reports[0]).toMatchObject({ status: 'SKIPPED', skipReason: 'PROVIDER_UNAVAILABLE' });
    expect(await db.repositories.speakers.listByMeeting(meetingId)).toHaveLength(0);
    const segments = await db.repositories.transcript.listByMeeting(meetingId);
    expect(segments.every((segment) => segment.speakerId === undefined)).toBe(true);
  });

  it('sedang merekam → dilewati (jangan makan CPU saat rekam)', async () => {
    const { storage: seeded } = await seed(db);
    storage = seeded;

    const reports = await run(db, storage, provider, () => true);

    expect(reports[0]).toMatchObject({ status: 'SKIPPED', skipReason: 'RECORDING' });
    expect(provider.calls).toBe(0);
  });

  it('rapat tanpa transkrip → NO_SEGMENTS', async () => {
    const { storage: seeded } = await seed(db, { segments: false });
    storage = seeded;

    const reports = await run(db, storage, provider);

    expect(reports[0]).toMatchObject({ status: 'SKIPPED', skipReason: 'NO_SEGMENTS' });
  });

  it('file audio hilang semua → NO_AUDIO, pembicara tidak dikarang', async () => {
    const { meetingId, storage: seeded } = await seed(db, { files: false });
    storage = seeded;

    const reports = await run(db, storage, provider);

    expect(reports[0]).toMatchObject({ status: 'SKIPPED', skipReason: 'NO_AUDIO' });
    expect(await db.repositories.speakers.listByMeeting(meetingId)).toHaveLength(0);
  });

  it('rapat belum COMPLETED tidak disentuh', async () => {
    await seed(db, { status: 'TRANSCRIBING' });

    const reports = await run(db, storage, provider);

    expect(reports).toHaveLength(0);
    expect(provider.calls).toBe(0);
  });
});
