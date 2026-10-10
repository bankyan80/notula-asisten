/**
 * Verifikasi audio setelah rekaman berhenti — langkah wajib sebelum rapat
 * masuk antrean transkripsi (PRD: SAVE → VERIFY → QUEUE).
 *
 * Jujur: mengecek bahwa SETIAP chunk benar-benar punya file di perangkat dan
 * ukurannya lebih dari nol. Bila tidak, rapat ditandai PROCESSING_ERROR dengan
 * pesan jelas — bukan berpura-pura "menunggu transkripsi" selamanya.
 */
import { AppError } from '../../core/errors/AppError';
import type { Repositories } from '../../data/repositories';
import type { StorageProvider } from '../../core/types/providers';

export async function verifySavedAudio(
  repositories: Repositories,
  storage: StorageProvider,
  meetingId: string,
): Promise<AppError | null> {
  const chunks = await repositories.audioChunks.listByMeeting(meetingId);

  if (chunks.length === 0) {
    return new AppError('STORAGE_WRITE_FAILED', 'Tidak ada audio yang tersimpan dari rekaman ini.');
  }

  for (const chunk of chunks) {
    if ((chunk.byteSize ?? 0) <= 0) {
      return new AppError(
        'STORAGE_WRITE_FAILED',
        `Audio bagian ${chunk.sequence} tersimpan kosong (0 byte).`,
      );
    }
    try {
      if (!(await storage.exists(chunk.localPath))) {
        return new AppError(
          'STORAGE_READ_FAILED',
          `File audio bagian ${chunk.sequence} tidak ditemukan di perangkat.`,
        );
      }
      const blob = await storage.readBlob(chunk.localPath);
      if (blob.size <= 0) {
        return new AppError(
          'STORAGE_READ_FAILED',
          `File audio bagian ${chunk.sequence} berukuran 0 byte.`,
        );
      }
    } catch (error) {
      if (error instanceof AppError) return error;
      return new AppError(
        'STORAGE_READ_FAILED',
        `File audio bagian ${chunk.sequence} tidak terbaca.`,
        {
          cause: error,
        },
      );
    }
  }

  return null;
}
