import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingEngine } from '../../core/types/providers';
import { createMemoryRepositories, type MemoryDatabase } from '../../data/memory/repositories';
import { MemStorage } from './memStorage';
import { resetChunkWriteChainForTests } from './chunkWriteChain';
import { stopRecordingSafely } from './stopRecording';

function fakeEngine(status: 'recording' | 'paused' | 'idle'): RecordingEngine {
  return {
    platform: 'web',
    isSupported: () => true,
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    stop: vi.fn(async () => ({
      meetingId: 'm1',
      chunkCount: 2,
      totalDurationSeconds: 125,
    })),
    getState: () => ({ meetingId: 'm1', status, elapsedSeconds: 125, currentSequence: 3 }),
    onChunk: () => () => undefined,
    onStateChange: () => () => undefined,
  };
}

describe('stopRecordingSafely', () => {
  let db: MemoryDatabase;
  let storage: MemStorage;

  beforeEach(async () => {
    resetChunkWriteChainForTests();
    db = createMemoryRepositories();
    storage = new MemStorage();
    await db.repositories.meetings.create({ title: 'Rapat', date: '2026-10-07' });
  });

  /** Tulis N chunk berikut file audio-nya — meniru hasil rekaman yang sehat. */
  async function seedChunks(meetingId: string, count: number): Promise<void> {
    for (let sequence = 1; sequence <= count; sequence += 1) {
      const localPath = `Meetings/${meetingId}/audio/${String(sequence).padStart(6, '0')}.m4a`;
      await storage.writeBlob(localPath, new Blob(['audio-data']));
      await db.repositories.audioChunks.add({
        id: `chunk-${sequence}`,
        meetingId,
        sequence,
        localPath,
        startTime: (sequence - 1) * 300,
        endTime: sequence * 300,
        durationSeconds: 300,
        mimeType: 'audio/webm',
        uploadStatus: 'PENDING',
        transcriptionStatus: 'PENDING',
        transcriptionAttempts: 0,
        byteSize: 10,
        createdAt: new Date().toISOString(),
      });
    }
  }

  it('audio tersimpan → status TRANSCRIPTION_PENDING (siap transkripsi, bukan COMPLETED)', async () => {
    const engine = fakeEngine('recording');
    const [meeting] = await db.repositories.meetings.list();
    await seedChunks(meeting!.id, 2);

    const seen: string[] = [];
    const original = db.repositories.meetings.update.bind(db.repositories.meetings);
    vi.spyOn(db.repositories.meetings, 'update').mockImplementation(async (id, patch) => {
      if (typeof patch.status === 'string') seen.push(patch.status);
      return original(id, patch);
    });

    const result = await stopRecordingSafely(engine, db.repositories, meeting!.id, storage);

    expect(result).toMatchObject({ meetingId: 'm1', chunkCount: 2, totalDurationSeconds: 125 });
    const updated = await db.repositories.meetings.getById(meeting!.id);
    expect(updated).toMatchObject({ status: 'TRANSCRIPTION_PENDING', durationSeconds: 125 });
    expect(updated?.pipelineError).toBeUndefined();
    // Urutan status yang dilihat pengguna: simpan → siap transkripsi.
    expect(seen).toEqual(['SAVING_AUDIO', 'TRANSCRIPTION_PENDING']);
  });

  it('audio TIDAK tersimpan (0 chunk) → PROCESSING_ERROR dengan pesan jujur', async () => {
    const engine = fakeEngine('recording');
    const [meeting] = await db.repositories.meetings.list();

    const result = await stopRecordingSafely(engine, db.repositories, meeting!.id, storage);

    expect(result).not.toBeNull();
    const updated = await db.repositories.meetings.getById(meeting!.id);
    expect(updated?.status).toBe('PROCESSING_ERROR');
    expect(updated?.pipelineError).toMatch(/Tidak ada audio/);
  });

  it('baris chunk ada tapi file hilang → PROCESSING_ERROR, bukan antre palsu', async () => {
    const engine = fakeEngine('recording');
    const [meeting] = await db.repositories.meetings.list();
    await seedChunks(meeting!.id, 1);
    storage.files.clear();

    await stopRecordingSafely(engine, db.repositories, meeting!.id, storage);

    const updated = await db.repositories.meetings.getById(meeting!.id);
    expect(updated?.status).toBe('PROCESSING_ERROR');
    expect(updated?.pipelineError).toMatch(/tidak ditemukan/);
  });

  it('engine berhenti tanpa chunk sama sekali → error jujur, status tidak nyangkut di SAVING_AUDIO', async () => {
    const engine = fakeEngine('recording');
    engine.stop = vi.fn(async () => ({
      meetingId: 'm1',
      chunkCount: 0,
      totalDurationSeconds: 0,
    }));
    const [meeting] = await db.repositories.meetings.list();

    await expect(
      stopRecordingSafely(engine, db.repositories, meeting!.id, storage),
    ).rejects.toThrow(/tanpa data audio/);

    const updated = await db.repositories.meetings.getById(meeting!.id);
    expect(updated?.status).toBe('PROCESSING_ERROR');
    expect(updated?.pipelineError).toMatch(/Periksa izin microphone/);
  });

  it('idempoten: bila tidak ada rekaman aktif → null, meeting tidak disentuh', async () => {
    const engine = fakeEngine('idle');
    const [meeting] = await db.repositories.meetings.list();

    const result = await stopRecordingSafely(engine, db.repositories, meeting!.id, storage);

    expect(result).toBeNull();
    const unchanged = await db.repositories.meetings.getById(meeting!.id);
    expect(unchanged).toMatchObject({ status: 'DRAFT', durationSeconds: 0 });
  });
});
