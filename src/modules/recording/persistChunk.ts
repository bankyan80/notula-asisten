/**
 * Menulis satu chunk hasil rekaman ke TIGA sisi dengan urutan aman-crash:
 * 1. **manifest** (`Meetings/{id}/audio/manifest.json`) — timeline tercatat dulu
 * 2. **file audio** (`Meetings/{id}/audio/000001.m4a`, OPFS di web)
 * 3. **metadata `AudioChunk`** di repository (DB)
 *
 * Dipanggil dari langganan `onChunk` di App (diserialisasi antar chunk) — bukan
 * dari engine — agar engine tetap bebas dependensi data. Kuota penuh dipetakan
 * ke `AppError('STORAGE_FULL')` agar UI bisa menghentikan rekaman dengan aman.
 * Pemulihan kondisi crash: `modules/recording/recovery.ts` (Batch 05).
 */
import { AppError, isQuotaExceededError } from '../../core/errors/AppError';
import type { AudioChunk } from '../../core/types/entities';
import type { RecordingChunkEvent, StorageProvider } from '../../core/types/providers';
import { audioChunkPath } from '../../core/utils/paths';
import { createId } from '../../core/utils/id';
import type { Repositories } from '../../data/repositories';
import { recordChunkInManifest, type ManifestChunkEntry } from './manifest';

function mapQuota(error: unknown): unknown {
  if (error instanceof AppError) return error;
  if (isQuotaExceededError(error)) {
    return new AppError('STORAGE_FULL', 'Penyimpanan perangkat penuh.', { cause: error });
  }
  return error;
}

export async function persistChunk(
  event: RecordingChunkEvent,
  repositories: Repositories,
  storage: StorageProvider,
): Promise<AudioChunk> {
  const localPath = audioChunkPath(event.meetingId, event.sequence);
  const entry: ManifestChunkEntry = {
    sequence: event.sequence,
    localPath,
    startTime: event.startTime,
    endTime: event.endTime,
    byteSize: event.blob.size,
    mimeType: event.mimeType,
  };

  // 1. Manifest dulu: bila gagal, tidak ada jejak yang perlu dipulihkan.
  try {
    await recordChunkInManifest(storage, entry, {
      meetingId: event.meetingId,
      mimeType: event.mimeType,
      chunkDurationSeconds: event.chunkDurationSeconds,
    });
  } catch (error) {
    throw mapQuota(error);
  }

  // 2. File audio: bila gagal, manifest dibersihkan oleh recovery (file tak ada).
  try {
    await storage.writeBlob(localPath, event.blob);
  } catch (error) {
    throw mapQuota(error);
  }

  // 3. Metadata DB: bila gagal di sini, manifest+file ada → diadopsi recovery.
  return repositories.audioChunks.add({
    id: createId(),
    meetingId: event.meetingId,
    sequence: event.sequence,
    localPath,
    startTime: event.startTime,
    endTime: event.endTime,
    durationSeconds: Math.max(0, event.endTime - event.startTime),
    byteSize: event.blob.size,
    mimeType: event.mimeType,
    uploadStatus: 'PENDING',
    transcriptionStatus: 'PENDING',
    transcriptionAttempts: 0,
    createdAt: new Date().toISOString(),
  });
}
