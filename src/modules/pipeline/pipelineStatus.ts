/**
 * Kontrak status pipeline pemrosesan rapat + pesan yang ditampilkan pengguna.
 *
 * Alur (PRD): RECORDING → SAVING_AUDIO → TRANSCRIPTION_PENDING → TRANSCRIBING →
 * TRANSCRIPT_READY → SUMMARIZING → GENERATING_MINUTES → COMPLETED
 * Kegagalan → PROCESSING_ERROR (transkripsi) atau TRANSCRIPT_READY + pipelineError
 * (ringkasan/notulen — transkrip tetap bisa dibaca, tersedia tombol coba lagi).
 */
import type { MeetingStatus } from '../../core/types/entities';

/** Batas kegagalan berturut-turut per tahap sebelum pipeline berhenti otomatis. */
export const MAX_PIPELINE_ATTEMPTS = 5;

/** Interval pemeriksaan ulang scheduler (ms). */
export const PIPELINE_INTERVAL_MS = 15_000;

/** Status yang MASIH diproses — UI wajib memantau perubahannya. */
const ACTIVE_STATUSES: readonly MeetingStatus[] = [
  'SAVING_AUDIO',
  'TRANSCRIPTION_PENDING',
  'TRANSCRIBING',
  'TRANSCRIPT_READY',
  'SUMMARIZING',
  'GENERATING_MINUTES',
];

/** Status tahap transkripsi (audio diproses menjadi teks). */
const TRANSCRIPTION_STAGE_STATUSES: readonly MeetingStatus[] = [
  'TRANSCRIPTION_PENDING',
  'TRANSCRIBING',
  'TRANSCRIPT_READY',
  'PROCESSING_ERROR',
  // Nama lama dari data pengguna sebelum pipeline ini ada:
  'PROCESSING',
  'ERROR',
];

function isActivePipelineStatus(status: MeetingStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isInTranscriptionStage(status: MeetingStatus): boolean {
  return TRANSCRIPTION_STAGE_STATUSES.includes(status);
}

/**
 * Rapat masih perlu dipantau UI-nya (polling transkrip).
 * `TRANSCRIPT_READY` berhenti dipantau begitu ada `pipelineError` — artinya
 * percobaan otomatis sudah mentok dan pengguna harus menekan tombol coba lagi.
 */
export function shouldPollMeeting(status: MeetingStatus, pipelineError?: string): boolean {
  if (status === 'TRANSCRIPT_READY') return pipelineError === undefined || pipelineError === '';
  return isActivePipelineStatus(status);
}

/**
 * Pesan progres sesuai permintaan PRD — tampil di tab Transkrip.
 * Kunci memakai `MeetingStatus`; status tanpa pesan (COMPLETED/ARCHIVED/dll)
 * memang tidak menampilkan banner apa pun.
 */
export const PIPELINE_MESSAGES: Partial<Record<MeetingStatus, string>> = {
  SAVING_AUDIO: 'Menyimpan audio…',
  TRANSCRIPTION_PENDING: 'Menyiapkan transkripsi…',
  TRANSCRIBING: 'Sedang mengubah suara menjadi teks…',
  TRANSCRIPT_READY: 'Transkrip selesai. Membuat ringkasan AI…',
  SUMMARIZING: 'Transkrip selesai. Membuat ringkasan AI…',
  GENERATING_MINUTES: 'Menyiapkan notulen…',
};

/**
 * Pesan kegagalan dari provider bisa kosong (mis. `DOMException` tanpa teks).
 * Layar tidak boleh pernah kosong — selalu ada kalimat jujur berbahasa Indonesia.
 */
export function orFallback(message: string | undefined, fallback: string): string {
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
}

/** Pesan untuk keadaan gagal — kembali ke status lama agar data lama tetap terbaca. */
export function failureMessage(status: MeetingStatus): string | null {
  if (status === 'PROCESSING_ERROR' || status === 'ERROR') {
    return 'Transkripsi gagal — audio tetap aman dan bisa dicoba lagi.';
  }
  return null;
}
