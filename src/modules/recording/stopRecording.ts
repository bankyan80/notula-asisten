/**
 * Menghentikan rekaman + memperbarui status meeting lewat SATU jalur —
 * dipakai tombol "SELESAI" dan auto-stop saat storage penuh (Batch 05),
 * supaya perilakunya identik dan tidak ada logika dobel.
 *
 * Urutan pipeline setelah berhenti (PRD):
 *   1. `engine.stop()` — menunggu event `dataavailable` terakhir + `stop`
 *   2. `waitForChunkWrites()` — menunggu manifest → file → baris DB benar-benar ada
 *   3. `verifySavedAudio()` — file tersedia dan ukurannya > 0
 *   4. status → `TRANSCRIPTION_PENDING` (audio tersimpan, transkripsi belum tentu)
 *   5. `runPipeline()` non-blocking → transkripsi → ringkasan → notulen → COMPLETED
 *
 * PENTING: `waitForChunkWrites()` DILEWATI bila dipanggil dari dalam rantai
 * tulis chunk (handler storage penuh) — lihat `chunkWriteChain.ts` (anti-deadlock).
 */
import { AppError } from '../../core/errors/AppError';
import { createLogger } from '../../core/logging/logger';
import type {
  RecordingStopResult,
  RecordingEngine,
  StorageProvider,
} from '../../core/types/providers';
import type { Repositories } from '../../data/repositories';
import { getStorageProvider } from '../../providers';
import { runPipeline } from '../pipeline/runPipeline';
import { waitForChunkWrites } from './chunkWriteChain';
import { verifySavedAudio } from './verifySavedAudio';

const log = createLogger('recording.stop');

export async function stopRecordingSafely(
  engine: RecordingEngine,
  repositories: Repositories,
  meetingId: string,
  storage: StorageProvider = getStorageProvider(),
): Promise<RecordingStopResult | null> {
  const status = engine.getState().status;
  if (status !== 'recording' && status !== 'paused') return null;

  // 0. Beri tahu UI: audio sedang ditulis ke perangkat.
  await repositories.meetings.update(meetingId, { status: 'SAVING_AUDIO' });

  // 1. Berhenti — resolve SETELAH dataavailable terakhir dikirim.
  const result = await engine.stop();

  // 1b. Rekaman tidak boleh kosong: mic yang gagal/terpotong sangat awal
  //     menghasilkan 0 chunk. Beri tahu pengguna dan jangan menyeret rapat ke
  //     antrean transkripsi yang pasti gagal.
  if (result.chunkCount === 0) {
    const empty = 'Rekaman berakhir tanpa data audio. Periksa izin microphone lalu rekam ulang.';
    log.error('Rekaman kosong (0 chunk)', new Error(empty), { meetingId });
    await repositories.meetings.update(meetingId, {
      status: 'PROCESSING_ERROR',
      durationSeconds: result.totalDurationSeconds,
      pipelineAttempts: 0,
      pipelineError: empty,
    });
    throw new AppError('RECORDING_FAILED', empty);
  }

  // 2. Tunggu seluruh penulisan chunk (manifest → file → DB) benar-benar selesai.
  await waitForChunkWrites();

  // 3. Verifikasi: file ada dan tidak kosong.
  const problem = await verifySavedAudio(repositories, storage, meetingId);
  if (problem !== null) {
    log.error('Verifikasi audio gagal', problem, { meetingId });
    await repositories.meetings.update(meetingId, {
      status: 'PROCESSING_ERROR',
      durationSeconds: result.totalDurationSeconds,
      pipelineAttempts: 0,
      pipelineError: problem.message,
    });
    return result;
  }

  // 4. Audio tersimpan — antre untuk transkripsi.
  await repositories.meetings.update(meetingId, {
    status: 'TRANSCRIPTION_PENDING',
    durationSeconds: result.totalDurationSeconds,
    pipelineAttempts: 0,
    pipelineError: undefined,
  });

  // 5. Pipeline non-blocking: transkripsi → ringkasan → notulen → COMPLETED.
  void runPipeline(repositories).catch((error: unknown) => {
    log.warn('Pipeline gagal dijalankan dari stop', { meetingId, error: String(error) });
  });

  return result;
}
