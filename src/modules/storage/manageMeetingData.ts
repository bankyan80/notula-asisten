/**
 * Penghapusan data terpisah per rapat (PRD §26): pengguna dapat menghapus
 * audio, transkrip, atau hasil AI TANPA menghapus rapat itu sendiri.
 * File dihapus dulu; bila storage gagal, metadata TIDAK disentuh agar tidak
 * ada data yang "hilang setengah" secara diam-diam.
 */
import type { Repositories } from '../../data/repositories';
import { isAppError } from '../../core/errors/AppError';
import { meetingRoot } from '../../core/utils/paths';
import { getStorageProvider } from '../../providers';

export type MeetingDataKind = 'audio' | 'transcript' | 'ai';

export const MEETING_DATA_KIND_LABEL: Record<MeetingDataKind, string> = {
  audio: 'audio',
  transcript: 'transkrip',
  ai: 'hasil AI',
};

/**
 * Hapus data satu jenis. Mengembalikan jumlah entitas/file yang dihapus
 * (0 = memang tidak ada apa-apa; UI memberi pesan jujur).
 */
export async function deleteMeetingDataKind(
  repositories: Repositories,
  meetingId: string,
  kind: MeetingDataKind,
): Promise<number> {
  if (kind === 'audio') {
    const storage = getStorageProvider();
    let files: string[];
    try {
      files = await storage.list(`${meetingRoot(meetingId)}/audio`);
    } catch (error) {
      // OPFS tak tersedia → memang tidak ada file untuk dihapus; bukan kegagalan.
      if (isAppError(error) && error.code === 'PROVIDER_UNAVAILABLE') {
        files = [];
      } else {
        throw error;
      }
    }
    for (const file of files) {
      await storage.remove(file);
    }
    const chunks = await repositories.audioChunks.listByMeeting(meetingId);
    await repositories.audioChunks.deleteByMeeting(meetingId);
    return chunks.length + files.length;
  }

  if (kind === 'transcript') {
    const segments = await repositories.transcript.listByMeeting(meetingId);
    await repositories.transcript.deleteByMeeting(meetingId);
    return segments.length;
  }

  const [summary, decisions, items, minutes, speakers] = await Promise.all([
    repositories.summaries.get(meetingId),
    repositories.decisions.listByMeeting(meetingId),
    repositories.actionItems.listByMeeting(meetingId),
    repositories.minutes.get(meetingId),
    repositories.speakers.listByMeeting(meetingId),
  ]);
  await Promise.all([
    repositories.summaries.delete(meetingId),
    repositories.decisions.deleteByMeeting(meetingId),
    repositories.actionItems.deleteByMeeting(meetingId),
    repositories.minutes.delete(meetingId),
    repositories.speakers.deleteByMeeting(meetingId),
  ]);
  return (
    (summary === null ? 0 : 1) +
    decisions.length +
    items.length +
    (minutes === null ? 0 : 1) +
    speakers.length
  );
}
