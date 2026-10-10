/**
 * Langganan global chunk rekaman (Batch 04, diperkuat Batch 05):
 * - setiap chunk diserialisasi (antrean promise) lalu disimpan (manifest → file → DB);
 * - gagal karena storage penuh → rekaman DIHENTIKAN dengan aman lewat
 *   `stopRecordingSafely` (audio yang sudah ada tetap utuh);
 * - gagal lain → toast, rekaman tetap berjalan.
 * Dipasang sekali di App sehingga tetap bekerja walau pengguna meninggalkan
 * layar Rekam. Antrean tuli diekspos lewat `chunkWriteChain.ts` supaya tombol
 * SELESAI bisa menunggu chunk terakhir benar-benar tersimpan.
 */
import { useEffect } from 'react';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { friendlyMessage, isAppError } from '../../core/errors/AppError';
import { getRecordingEngine, getStorageProvider } from '../../providers';
import { enqueueChunkWrite, withChunkWriteWaitSkipped } from './chunkWriteChain';
import { persistChunk } from './persistChunk';
import { stopRecordingSafely } from './stopRecording';

export function useChunkPersistence(): void {
  const repositories = useRepositories();
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    const engine = getRecordingEngine();
    const storage = getStorageProvider();

    return engine.onChunk((event) => {
      enqueueChunkWrite(async () => {
        try {
          await persistChunk(event, repositories, storage);
        } catch (error) {
          if (isAppError(error) && error.code === 'STORAGE_FULL') {
            // Kita SEDANG berada di dalam rantai tulis → stop tidak boleh
            // menunggu rantai yang sama (deadlock). Lihat chunkWriteChain.ts.
            const stopped = await withChunkWriteWaitSkipped(() =>
              stopRecordingSafely(engine, repositories, event.meetingId),
            ).catch(() => null);
            // Toast hanya sekali: chunk berikutnya (bila ada) sudah berhenti.
            if (stopped !== null) showToast(friendlyMessage(error));
            return;
          }
          showToast(friendlyMessage(error));
        }
      });
    });
  }, [repositories, showToast]);
}
