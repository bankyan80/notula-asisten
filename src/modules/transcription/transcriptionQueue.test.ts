import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories, type MemoryDatabase } from '../../data/memory/repositories';
import {
  MAX_TRANSCRIPTION_ATTEMPTS,
  processPendingTranscription,
  type TranscriptionQueueOptions,
} from './transcriptionQueue';
import type { SpeechToTextProvider, TranscribeRequest } from '../../core/types/providers';
import { MAX_PIPELINE_ATTEMPTS } from '../pipeline/pipelineStatus';
import type { MeetingStatus, TranscriptSegment } from '../../core/types/entities';
import { AppError } from '../../core/errors/AppError';
import { createId } from '../../core/utils/id';
import { MemStorage } from '../recording/memStorage';

/** Provider palsu KHUSUS TEST: merekam permintaan & bisa diprogram error. */
class FakeStt implements SpeechToTextProvider {
  readonly id = 'fake-stt';
  calls: TranscribeRequest[] = [];
  available = true;
  errorFor: ((request: TranscribeRequest) => unknown | null) | null = null;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async transcribeChunk(request: TranscribeRequest): Promise<TranscriptSegment[]> {
    // Buktikan jalur readAudio dipakai untuk membaca file via storage.
    await request.readAudio();
    this.calls.push(request);
    const error = this.errorFor?.(request) ?? null;
    if (error !== null) throw error;
    return [
      {
        id: createId(),
        meetingId: request.chunk.meetingId,
        startTime: request.chunk.startTime + 1,
        endTime: request.chunk.startTime + 11,
        text: `Teks chunk ${request.chunk.sequence}`,
        sequence: request.sequenceOffset ?? 0,
        createdAt: new Date().toISOString(),
      },
    ];
  }
}

async function seed(
  db: MemoryDatabase,
  storage: MemStorage,
  options: { chunkCount?: number; status?: MeetingStatus; language?: string } = {},
) {
  const { chunkCount = 2, status = 'TRANSCRIPTION_PENDING', language = 'id' } = options;
  const meeting = await db.repositories.meetings.create({
    title: 'Rapat Uji',
    date: '2026-10-07',
    language,
  });
  await db.repositories.meetings.update(meeting.id, { status });
  const chunks = [];
  for (let sequence = 1; sequence <= chunkCount; sequence += 1) {
    const localPath = `Meetings/${meeting.id}/audio/${String(sequence).padStart(6, '0')}.m4a`;
    await storage.writeBlob(localPath, new Blob(['audio']));
    chunks.push(
      await db.repositories.audioChunks.add({
        id: `chunk-${sequence}`,
        meetingId: meeting.id,
        sequence,
        localPath,
        startTime: (sequence - 1) * 300,
        endTime: sequence * 300,
        durationSeconds: 300,
        mimeType: 'audio/webm',
        uploadStatus: 'PENDING',
        transcriptionStatus: 'PENDING',
        transcriptionAttempts: 0,
        createdAt: new Date().toISOString(),
      }),
    );
  }
  return { meeting, storage, chunks };
}

function options(
  db: MemoryDatabase,
  storage: MemStorage,
  provider: FakeStt,
  isRecordingActive = false,
): TranscriptionQueueOptions {
  return {
    repositories: db.repositories,
    storage,
    provider,
    dictionary: ['TKA', 'NISN'],
    isRecordingActive: () => isRecordingActive,
  };
}

describe('processPendingTranscription — antrian offline', () => {
  let db: MemoryDatabase;
  let storage: MemStorage;
  let provider: FakeStt;

  beforeEach(() => {
    db = createMemoryRepositories();
    provider = new FakeStt();
    storage = new MemStorage();
  });

  it('mentranskripsi semua chunk berurutan, timestamp & sequence timeline benar', async () => {
    const { meeting } = await seed(db, storage);
    const report = await processPendingTranscription(options(db, storage, provider));

    expect(report).toMatchObject({
      status: 'PROCESSED',
      transcribedChunks: 2,
      failedChunks: 0,
      segmentsAdded: 2,
      transcriptReadyMeetings: 1,
      errorMeetings: 0,
    });

    const segments = await db.repositories.transcript.listByMeeting(meeting.id);
    expect(segments.map((segment) => [segment.sequence, segment.startTime])).toEqual([
      [0, 1],
      [1, 301],
    ]);
    expect(segments[0]?.text).toBe('Teks chunk 1');

    const chunks = await db.repositories.audioChunks.listByMeeting(meeting.id);
    expect(chunks.every((chunk) => chunk.transcriptionStatus === 'DONE')).toBe(true);
    expect(chunks[0]?.transcriptionAttempts).toBe(1);

    // Transkrip siap → tahap ringkasan/notulen yang lanjut (bukan COMPLETED di sini).
    const updated = await db.repositories.meetings.getById(meeting.id);
    expect(updated?.status).toBe('TRANSCRIPT_READY');
    expect(updated?.pipelineError).toBeUndefined();

    // Bahasa rapat & kamus pengguna diteruskan ke provider.
    expect(provider.calls[0]?.language).toBe('id');
    expect(provider.calls[0]?.dictionary).toEqual(['TKA', 'NISN']);
  });

  it('idempoten: run kedua tidak menambah segmen atau mengulang kerja', async () => {
    const { meeting } = await seed(db, storage);
    await processPendingTranscription(options(db, storage, provider));
    const second = await processPendingTranscription(options(db, storage, provider));

    expect(second.status).toBe('NO_PENDING');
    expect(second.transcribedChunks).toBe(0);
    expect(provider.calls).toHaveLength(2); // hanya run pertama (2 chunk)
    expect(await db.repositories.transcript.listByMeeting(meeting.id)).toHaveLength(2);
  });

  it('melewati antrian saat rekaman masih berjalan', async () => {
    const { meeting, chunks } = await seed(db, storage);
    const report = await processPendingTranscription(
      options(db, storage, provider, /* isRecordingActive */ true),
    );

    expect(report).toMatchObject({ status: 'SKIPPED', skipReason: 'RECORDING' });
    expect(provider.calls).toHaveLength(0);
    expect((await db.repositories.meetings.getById(meeting.id))?.status).toBe(
      'TRANSCRIPTION_PENDING',
    );
    expect(chunks[0]?.transcriptionStatus).toBe('PENDING');
  });

  it('provider belum tersedia → chunk tetap PENDING, meeting tidak disentuh', async () => {
    const { meeting } = await seed(db, storage);
    provider.available = false;

    const report = await processPendingTranscription(options(db, storage, provider));

    expect(report).toMatchObject({ status: 'SKIPPED', skipReason: 'PROVIDER_UNAVAILABLE' });
    expect((await db.repositories.meetings.getById(meeting.id))?.status).toBe(
      'TRANSCRIPTION_PENDING',
    );
    const chunks = await db.repositories.audioChunks.listByMeeting(meeting.id);
    expect(chunks.every((chunk) => chunk.transcriptionStatus === 'PENDING')).toBe(true);
  });

  it('PROVIDER_UNAVAILABLE di tengah jalan → percobaan tidak dihitung, status kembali seperti semula', async () => {
    const { meeting } = await seed(db, storage);
    provider.errorFor = () =>
      new AppError('PROVIDER_UNAVAILABLE', 'Belum siap', { retryable: true });

    const report = await processPendingTranscription(options(db, storage, provider));

    expect(report).toMatchObject({ status: 'SKIPPED', skipReason: 'PROVIDER_UNAVAILABLE' });
    const chunks = await db.repositories.audioChunks.listByMeeting(meeting.id);
    expect(chunks[0]).toMatchObject({ transcriptionStatus: 'PENDING', transcriptionAttempts: 0 });
    expect((await db.repositories.meetings.getById(meeting.id))?.status).toBe(
      'TRANSCRIPTION_PENDING',
    );
  });

  it('error retryable (jaringan/model) → chunk kembali PENDING tanpa hitungan percobaan', async () => {
    const { meeting } = await seed(db, storage);
    provider.errorFor = () =>
      new AppError('TRANSCRIPTION_FAILED', 'Jaringan terputus', { retryable: true });

    const report = await processPendingTranscription(options(db, storage, provider));

    expect(report).toMatchObject({ status: 'SKIPPED', skipReason: 'RETRYABLE_FAILED' });
    const chunks = await db.repositories.audioChunks.listByMeeting(meeting.id);
    expect(chunks[0]).toMatchObject({ transcriptionStatus: 'PENDING', transcriptionAttempts: 0 });
    expect((await db.repositories.meetings.getById(meeting.id))?.status).toBe(
      'TRANSCRIPTION_PENDING',
    );
  });

  it('gagal permanen (codec tak didukung) → FAILED + meeting PROCESSING_ERROR, chunk berikutnya tetap diproses', async () => {
    const { meeting } = await seed(db, storage, { chunkCount: 2 });
    provider.errorFor = (request) =>
      request.chunk.sequence === 1
        ? new AppError('TRANSCRIPTION_FAILED', 'Format tidak didukung', { retryable: false })
        : null;

    const report = await processPendingTranscription(options(db, storage, provider));

    expect(report).toMatchObject({
      status: 'PROCESSED',
      failedChunks: 1,
      transcribedChunks: 1,
      errorMeetings: 1,
    });
    const chunks = await db.repositories.audioChunks.listByMeeting(meeting.id);
    expect(chunks[0]).toMatchObject({
      transcriptionStatus: 'FAILED',
      transcriptionAttempts: 1,
      transcriptionError: 'Format tidak didukung',
    });
    expect(chunks[1]?.transcriptionStatus).toBe('DONE');
    expect((await db.repositories.meetings.getById(meeting.id))?.status).toBe('PROCESSING_ERROR');
  });

  it('batas percobaan tercapai → chunk tidak diproses lagi, tidak dihitung gagal baru', async () => {
    const { meeting, chunks } = await seed(db, storage, { chunkCount: 1 });
    await db.repositories.audioChunks.update(chunks[0]!.id, {
      transcriptionStatus: 'FAILED',
      transcriptionAttempts: MAX_TRANSCRIPTION_ATTEMPTS,
      transcriptionError: 'Format tidak didukung',
    });

    const report = await processPendingTranscription(options(db, storage, provider));

    expect(provider.calls).toHaveLength(0);
    expect(report.failedChunks).toBe(0);
    expect(report.transcribedChunks).toBe(0);
    expect((await db.repositories.meetings.getById(meeting.id))?.status).toBe('PROCESSING_ERROR');
  });

  it('PROCESSING basi (crash di tengah) dipulihkan dan dicoba ulang', async () => {
    const { meeting, chunks } = await seed(db, storage, { chunkCount: 1 });
    await db.repositories.audioChunks.update(chunks[0]!.id, {
      transcriptionStatus: 'PROCESSING',
      transcriptionAttempts: 1,
    });

    const report = await processPendingTranscription(options(db, storage, provider));

    expect(report).toMatchObject({ transcribedChunks: 1, status: 'PROCESSED' });
    const [chunk] = await db.repositories.audioChunks.listByMeeting(meeting.id);
    expect(chunk).toMatchObject({ transcriptionStatus: 'DONE', transcriptionAttempts: 2 });
    expect((await db.repositories.meetings.getById(meeting.id))?.status).toBe('TRANSCRIPT_READY');
  });

  it('sequence dilanjutkan dari transkrip yang sudah ada (tidak menimpa)', async () => {
    const { meeting } = await seed(db, storage, { chunkCount: 1 });
    await db.repositories.transcript.addSegments([
      {
        id: 'lama-1',
        meetingId: meeting.id,
        startTime: 0,
        endTime: 5,
        text: 'Segmen lama',
        sequence: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'lama-2',
        meetingId: meeting.id,
        startTime: 5,
        endTime: 9,
        text: 'Segmen lama 2',
        sequence: 1,
        createdAt: new Date().toISOString(),
      },
    ]);

    await processPendingTranscription(options(db, storage, provider));

    const segments = await db.repositories.transcript.listByMeeting(meeting.id);
    expect(segments.map((segment) => segment.sequence)).toEqual([0, 1, 2]);
    expect(segments[2]?.text).toBe('Teks chunk 1');
  });

  it('rapat sedang DRAFT/RECORDING tidak disentuh (antrian menunggu status proses)', async () => {
    const { meeting } = await seed(db, storage, { status: 'DRAFT' });

    const report = await processPendingTranscription(options(db, storage, provider));

    expect(report.status).toBe('PROCESSED');
    expect(report.transcribedChunks).toBe(0);
    expect((await db.repositories.meetings.getById(meeting.id))?.status).toBe('DRAFT');
    expect(provider.calls).toHaveLength(0);
  });

  it('gagal permanen berulang → percobaan tahap terhitung & berhenti di batas', async () => {
    const { meeting, chunks } = await seed(db, storage, { chunkCount: 1 });
    await db.repositories.audioChunks.update(chunks[0]!.id, {
      transcriptionStatus: 'FAILED',
      transcriptionAttempts: MAX_TRANSCRIPTION_ATTEMPTS,
      transcriptionError: 'Format tidak didukung',
    });

    // Setiap run menghitung satu percobaan tahap — bukan berputar selamanya.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await processPendingTranscription(options(db, storage, provider));
      expect((await db.repositories.meetings.getById(meeting.id))?.pipelineAttempts).toBe(attempt);
    }

    // Mentok di batas → run berikutnya dilewati, status tidak lagi berubah.
    for (let attempt = 4; attempt <= 6; attempt += 1) {
      await processPendingTranscription(options(db, storage, provider));
    }
    const stuck = await db.repositories.meetings.getById(meeting.id);
    expect(stuck).toMatchObject({
      status: 'PROCESSING_ERROR',
      pipelineAttempts: MAX_PIPELINE_ATTEMPTS,
    });
    expect(stuck?.pipelineError).toBeTruthy();
    expect(provider.calls).toHaveLength(0);
  });

  it('memulihkan meeting TRANSCRIBING yang tertinggal → TRANSCRIPT_READY', async () => {
    const { meeting } = await seed(db, storage, { chunkCount: 1 });
    // Semua chunk DONE tapi status meeting belum sempat jadi TRANSCRIPT_READY.
    await db.repositories.meetings.update(meeting.id, { status: 'TRANSCRIBING' });
    await db.repositories.audioChunks.update('chunk-1', {
      transcriptionStatus: 'DONE',
      transcriptionAttempts: 1,
    });

    const report = await processPendingTranscription(options(db, storage, provider));

    expect(report.status).toBe('NO_PENDING');
    expect((await db.repositories.meetings.getById(meeting.id))?.status).toBe('TRANSCRIPT_READY');
    expect(report.transcriptReadyMeetings).toBe(1);
  });
});
