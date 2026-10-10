/**
 * Pipeline otomatis pascarekaman — uji tahap demi tahap dengan provider palsu
 * (transkripsi & AI) supaya hasilnya deterministik tanpa model nyata.
 *
 * Yang diuji adalah KONTRAK pipeline, bukan kualitas model:
 * - sukses penuh → COMPLETED + ringkasan + notulan tersimpan;
 * - AI gagal → transkrip tetap terbaca (TRANSCRIPT_READY + pipelineError);
 * - provider belum siap → TIDAK menambah hitungan percobaan;
 * - resume tahap yang tersisa (crash di tengah);
 * - idempoten (run kedua tidak mengulang kerja).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRepositories, type MemoryDatabase } from '../../data/memory/repositories';
import type {
  AISummarizationProvider,
  AISummaryResult,
  SpeechToTextProvider,
  TranscribeRequest,
} from '../../core/types/providers';
import type { MeetingStatus, TranscriptSegment } from '../../core/types/entities';
import { AppError } from '../../core/errors/AppError';
import { createId } from '../../core/utils/id';
import { MemStorage } from '../recording/memStorage';
import { resetChunkWriteChainForTests } from '../recording/chunkWriteChain';
import { MAX_PIPELINE_ATTEMPTS } from './pipelineStatus';
import { executePipeline, retryPipeline, type PipelineOptions } from './runPipeline';

class FakeStt implements SpeechToTextProvider {
  readonly id = 'fake-stt';
  available = true;
  calls = 0;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async transcribeChunk(request: TranscribeRequest): Promise<TranscriptSegment[]> {
    await request.readAudio();
    this.calls += 1;
    return [
      {
        id: createId(),
        meetingId: request.chunk.meetingId,
        startTime: request.chunk.startTime + 1,
        endTime: request.chunk.startTime + 11,
        text: `Teks bagian ${request.chunk.sequence}`,
        sequence: request.sequenceOffset ?? 0,
        createdAt: new Date().toISOString(),
      },
    ];
  }
}

class FakeAi implements AISummarizationProvider {
  readonly id = 'fake-ai';
  available = true;
  calls = 0;
  error: unknown | null = null;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async summarize(): Promise<AISummaryResult> {
    this.calls += 1;
    if (this.error !== null) throw this.error;
    return {
      summary: 'Ringkasan uji.',
      topics: ['Topik satu'],
      decisions: [],
      actionItems: [
        {
          task: 'Kirim laporan',
          assignee: 'Budi',
        },
      ],
      questions: [],
      undecided: ['Tidak disebutkan dalam rapat.'],
    };
  }
}

async function seed(
  db: MemoryDatabase,
  storage: MemStorage,
  options: {
    chunkCount?: number;
    status?: MeetingStatus;
    withTranscript?: boolean;
    pipelineAttempts?: number;
  } = {},
): Promise<{ meetingId: string }> {
  const { chunkCount = 2, status = 'TRANSCRIPTION_PENDING', withTranscript = false } = options;
  const meeting = await db.repositories.meetings.create({
    title: 'Rapat Pipeline',
    date: '2026-10-07',
  });
  await db.repositories.meetings.update(meeting.id, {
    status,
    pipelineAttempts: options.pipelineAttempts ?? 0,
  });

  for (let sequence = 1; sequence <= chunkCount; sequence += 1) {
    const localPath = `Meetings/${meeting.id}/audio/${String(sequence).padStart(6, '0')}.m4a`;
    await storage.writeBlob(localPath, new Blob(['audio']));
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
      transcriptionStatus: withTranscript ? 'DONE' : 'PENDING',
      transcriptionAttempts: withTranscript ? 1 : 0,
      byteSize: 5,
      createdAt: new Date().toISOString(),
    });
  }

  if (withTranscript) {
    await db.repositories.transcript.addSegments([
      {
        id: 'seg-1',
        meetingId: meeting.id,
        startTime: 1,
        endTime: 11,
        text: 'Transkrip uji sudah ada.',
        sequence: 0,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  return { meetingId: meeting.id };
}

describe('executePipeline', () => {
  let db: MemoryDatabase;
  let storage: MemStorage;
  let stt: FakeStt;
  let ai: FakeAi;

  const options = (): PipelineOptions => ({
    repositories: db.repositories,
    storage,
    stt,
    ai,
    dictionary: [],
    isRecordingActive: () => false,
  });

  beforeEach(() => {
    resetChunkWriteChainForTests();
    db = createMemoryRepositories();
    storage = new MemStorage();
    stt = new FakeStt();
    ai = new FakeAi();
  });

  it('sukses penuh: transkripsi → ringkasan → notulen → COMPLETED', async () => {
    const { meetingId } = await seed(db, storage);

    const report = await executePipeline(options());

    expect(report).toMatchObject({
      skipped: false,
      summariesCreated: 1,
      minutesCreated: 1,
      completedMeetings: 1,
      failedAiMeetings: 0,
      transcription: { failedChunks: 0, transcribedChunks: 2 },
    });

    const meeting = await db.repositories.meetings.getById(meetingId);
    expect(meeting).toMatchObject({ status: 'COMPLETED', pipelineAttempts: 0 });
    expect(meeting?.pipelineError).toBeUndefined();

    expect(await db.repositories.transcript.listByMeeting(meetingId)).toHaveLength(2);
    expect((await db.repositories.summaries.get(meetingId))?.content).toBe('Ringkasan uji.');
    expect(await db.repositories.minutes.get(meetingId)).not.toBeNull();
    expect(await db.repositories.actionItems.listByMeeting(meetingId)).toHaveLength(1);
  });

  it('AI gagal → transkrip tetap terbaca, TRANSCRIPT_READY + pipelineError', async () => {
    const { meetingId } = await seed(db, storage);
    ai.error = new AppError('AI_FAILED', 'Model sedang sibuk.', { retryable: true });

    const report = await executePipeline(options());

    expect(report.failedAiMeetings).toBe(1);
    expect(report.completedMeetings).toBe(0);

    const meeting = await db.repositories.meetings.getById(meetingId);
    expect(meeting).toMatchObject({ status: 'TRANSCRIPT_READY' });
    expect(meeting?.pipelineError).toBeTruthy();
    expect(meeting?.pipelineAttempts).toBe(1);

    // Transkrip TIDAK pernah dihapus saat tahap AI gagal.
    const segments = await db.repositories.transcript.listByMeeting(meetingId);
    expect(segments.length).toBeGreaterThan(0);
  });

  it('provider transkripsi belum siap → dilewati TANPA menambah percobaan', async () => {
    const { meetingId } = await seed(db, storage);
    stt.available = false;

    const report = await executePipeline(options());

    expect(report.transcription).toMatchObject({
      status: 'SKIPPED',
      skipReason: 'PROVIDER_UNAVAILABLE',
    });
    expect(report.summariesCreated).toBe(0);

    const meeting = await db.repositories.meetings.getById(meetingId);
    expect(meeting).toMatchObject({ status: 'TRANSCRIPTION_PENDING', pipelineAttempts: 0 });
    expect(meeting?.pipelineError).toBeUndefined();
  });

  it('percobaan AI mentok → berhenti otomatis, menunggu tombol coba lagi', async () => {
    const { meetingId } = await seed(db, storage, { withTranscript: true });
    await db.repositories.meetings.update(meetingId, {
      status: 'TRANSCRIPT_READY',
      pipelineAttempts: MAX_PIPELINE_ATTEMPTS,
      pipelineError: 'Ringkasan AI gagal dibuat.',
    });

    const report = await executePipeline(options());

    expect(ai.calls).toBe(0);
    expect(report.failedAiMeetings).toBe(1);
    expect(report.completedMeetings).toBe(0);

    const meeting = await db.repositories.meetings.getById(meetingId);
    expect(meeting).toMatchObject({
      status: 'TRANSCRIPT_READY',
      pipelineAttempts: MAX_PIPELINE_ATTEMPTS,
      pipelineError: 'Ringkasan AI gagal dibuat.',
    });
  });

  it('resume tahap sisa: transkrip sudah siap → langsung ringkasan + notulen', async () => {
    const { meetingId } = await seed(db, storage, { withTranscript: true });
    await db.repositories.meetings.update(meetingId, { status: 'TRANSCRIPT_READY' });

    const report = await executePipeline(options());

    expect(stt.calls).toBe(0); // tidak mengulang transkripsi
    expect(report.summariesCreated).toBe(1);
    expect(report.minutesCreated).toBe(1);
    expect((await db.repositories.meetings.getById(meetingId))?.status).toBe('COMPLETED');
  });

  it('idempoten: run kedua tidak mengulang transkripsi/ringkasan/notulen', async () => {
    const { meetingId } = await seed(db, storage);

    await executePipeline(options());
    const second = await executePipeline(options());

    expect(stt.calls).toBe(2); // hanya run pertama (2 chunk)
    expect(ai.calls).toBe(1);
    expect(second).toMatchObject({
      summariesCreated: 0,
      minutesCreated: 0,
      completedMeetings: 0,
      transcription: { status: 'NO_PENDING' },
    });
    expect((await db.repositories.meetings.getById(meetingId))?.status).toBe('COMPLETED');
  });

  it('rekaman masih berjalan → pipeline dilewati total', async () => {
    const { meetingId } = await seed(db, storage);
    const opts = options();
    opts.isRecordingActive = () => true;

    const report = await executePipeline(opts);

    expect(report.skipped).toBe(true);
    expect(stt.calls).toBe(0);
    expect((await db.repositories.meetings.getById(meetingId))?.status).toBe(
      'TRANSCRIPTION_PENDING',
    );
  });

  it('transkripsi tidak menghasilkan teks → berhenti jujur, tanpa loop otomatis', async () => {
    const { meetingId } = await seed(db, storage, { chunkCount: 1, withTranscript: true });
    // Chunk DONE tetapi transkrip kosong (rekaman sunyi/bising → tanpa teks).
    for (const segment of await db.repositories.transcript.listByMeeting(meetingId)) {
      await db.repositories.transcript.deleteSegment(segment.id);
    }
    await db.repositories.meetings.update(meetingId, { status: 'TRANSCRIPT_READY' });

    const report = await executePipeline(options());

    const meeting = await db.repositories.meetings.getById(meetingId);
    expect(meeting).toMatchObject({
      status: 'PROCESSING_ERROR',
      pipelineAttempts: MAX_PIPELINE_ATTEMPTS,
    });
    expect(meeting?.pipelineError).toMatch(/Tidak ada teks/);
    expect(report.completedMeetings).toBe(0);

    // Run berikutnya TIDAK membangkitkan lagi (heal & finalize sama-sama skip).
    const second = await executePipeline(options());
    expect(second.completedMeetings).toBe(0);
    const again = await db.repositories.meetings.getById(meetingId);
    expect(again).toMatchObject({ status: 'PROCESSING_ERROR' });
  });

  it('"Coba Lagi" pada rapat tanpa teks → chunk di-reset & transkripsi diulang', async () => {
    const { meetingId } = await seed(db, storage, { chunkCount: 2, withTranscript: true });
    for (const segment of await db.repositories.transcript.listByMeeting(meetingId)) {
      await db.repositories.transcript.deleteSegment(segment.id);
    }
    await db.repositories.meetings.update(meetingId, {
      status: 'PROCESSING_ERROR',
      pipelineAttempts: MAX_PIPELINE_ATTEMPTS,
      pipelineError: 'Tidak ada teks yang terbaca dari rekaman ini.',
    });

    await retryPipeline(db.repositories, meetingId);

    const chunks = await db.repositories.audioChunks.listByMeeting(meetingId);
    expect(chunks.every((chunk) => chunk.transcriptionStatus === 'PENDING')).toBe(true);
    const reset = await db.repositories.meetings.getById(meetingId);
    expect(reset).toMatchObject({ status: 'TRANSCRIPTION_PENDING', pipelineAttempts: 0 });
    expect(reset?.pipelineError).toBeUndefined();

    // Jalankan pipeline (dengan provider uji) → transkripsi ulang lalu tahap AI.
    const report = await executePipeline(options());
    expect(report.transcription).toMatchObject({ transcribedChunks: 2 });
    expect(await db.repositories.summaries.get(meetingId)).not.toBeNull();
    expect((await db.repositories.meetings.getById(meetingId))?.status).toBe('COMPLETED');
  });

  it('kegagalan chunk non-permanen tidak mengubah status jadi gagal', async () => {
    const { meetingId } = await seed(db, storage);
    vi.spyOn(stt, 'transcribeChunk').mockImplementation(async (request) => {
      await request.readAudio();
      throw new AppError('TRANSCRIPTION_FAILED', 'Jaringan terputus', { retryable: true });
    });

    const report = await executePipeline(options());

    expect(report.transcription).toMatchObject({
      status: 'SKIPPED',
      skipReason: 'RETRYABLE_FAILED',
    });
    const meeting = await db.repositories.meetings.getById(meetingId);
    // Percobaan otomatis dihitung per tahap yang benar-benar gagal.
    expect(meeting).toMatchObject({ status: 'TRANSCRIPTION_PENDING', pipelineAttempts: 1 });
  });
});
