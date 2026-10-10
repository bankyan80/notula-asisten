/**
 * Helper penghapusan file rapat — dipanggil UI bersama `meetings.delete()`.
 * Repository hanya menangani metadata (DB); file audio/transkrip/export ditangani
 * StorageProvider. Bila OPFS tak tersedia, memang tidak ada file untuk dihapus.
 */
import { getStorageProvider } from '../../providers';

export async function removeMeetingFiles(meetingId: string): Promise<void> {
  try {
    await getStorageProvider().removeMeeting(meetingId);
  } catch {
    // Best effort: metadata sudah dihapus; file gagal dihapus dicatat lewat error
    // berikutnya bila OS menolak akses (pada Android, Batch 14).
  }
}
