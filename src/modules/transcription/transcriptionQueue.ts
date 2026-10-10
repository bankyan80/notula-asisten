/**
 * Antrian transkripsi offline (Batch 06) — tahap PERTAMA pipeline otomatis.
 *
 * Prinsip:
 * - Audio adalah sumber utama: kegagalan TIDAK PERNAH menghapus/mengubah audio;
 *   chunk ditandai FAILED/PENDING dan dicoba lagi pada run berikutnya.
 * - Urutan per rapat = urutan sequence → timestamp monoton di timeline meeting.
 * - Transkripsi hanya jalan saat TIDAK ada rekaman aktif (hindari rebutan CPU/IO).
 * - Retryable error (jaringan/unduhan model) → chunk kembali PENDING tanpa
 *   menghitung percobaan chunk; error permanen (codec tak didukung) → FAILED
 *   dengan batas 3 percobaan; crash di tengah → PROCESSING basi dipulihkan.
 * - Kegagalan SEMENTARA yang berulang dihitung per rapat lewat
 *   `meeting.pipelineAttempts` dan berhenti di `MAX_PIPELINE_ATTEMPTS`
 *   (lihat `modules/pipeline/pipelineStatus.ts`) supaya tidak berputar selamanya.
 *
 * Transisi status meeting: TRANSCRIPTION_PENDING → TRANSCRIBING →
 * TRANSCRIPT_READY (lanjut ke tahap ringkasan) | PROCESSING_ERROR.
 */
import { isAppError } from '../../core/errors/AppError';
import { createLogger } from '../../core/logging/logger';
import type { AudioChunk } from '../../core/types/entities';
import type { SpeechToTextProvider, StorageProvider } from '../../core/types/providers';
import type { Repositories } from '../../data/repositories';
import {
  isInTranscriptionStage,
  MAX_PIPELINE_ATTEMPTS,
  orFallback,
} from '../pipeline/pipelineStatus';

const log = createLogger('transcription.queue');

export const MAX_TRANSCRIPTION_ATTEMPTS = 3;

export type TranscriptionSkipReason = 'RECORDING' | 'PROVIDER_UNAVAILABLE' | 'RETRYABLE_FAILED';

export interface TranscriptionReport {
  status: 'PROCESSED' | 'SKIPPED' | 'NO_PENDING';
  skipReason?: TranscriptionSkipReason;
  transcribedChunks: number;
  failedChunks: number;
  segmentsAdded: number;
  /** Rapat yang transkripnya selesai (status → TRANSCRIPT_READY). */
  transcriptReadyMeetings: number;
  errorMeetings: number;
}

export interface TranscriptionQueueOptions {
  repositories: Repositories;
  storage: StorageProvider;
  provider: SpeechToTextProvider;
  /** Kamus istilah pengguna (Pengaturan) — diteruskan ke provider. */
  dictionary: string[];
  isRecordingActive: () => boolean;
}

function emptyReport(): TranscriptionReport {
  return {
    status: 'NO_PENDING',
    transcribedChunks: 0,
    failedChunks: 0,
    segmentsAdded: 0,
    transcriptReadyMeetings: 0,
    errorMeetings: 0,
  };
}

/** Hasil satu run per rapat — `null` = selesai, nilai = alasan berhenti global. */
type MeetingOutcome = TranscriptionSkipReason | null;

async function processMeeting(
  meetingId: string,
  chunks: AudioChunk[],
  options: TranscriptionQueueOptions,
  report: TranscriptionReport,
): Promise<MeetingOutcome> {
  const { repositories } = options;
  const meeting = await repositories.meetings.getById(meetingId);
  if (meeting === null || !isInTranscriptionStage(meeting.status)) {
    log.info('Rapat dilewati (status tidak proses transkripsi)', {
      meetingId,
      status: meeting === null ? 'MISSING' : meeting.status,
    });
    return null;
  }

  // Percobaan otomatis sudah mentok → jangan muter lagi; status & pesan sudah
  // ditandai pada run sebelumnya. Pengguna bisa memulai lewat tombol "Coba Lagi".
  if (
    meeting.status === 'PROCESSING_ERROR' &&
    (meeting.pipelineAttempts ?? 0) >= MAX_PIPELINE_ATTEMPTS
  ) {
    log.info('Rapat dilewati (batas percobaan transkripsi tercapai)', {
      meetingId,
      attempts: meeting.pipelineAttempts,
    });
    return null;
  }

  const previousStatus = meeting.status;

  await repositories.meetings.update(meetingId, { status: 'TRANSCRIBING' });

  const existing = await repositories.transcript.listByMeeting(meetingId);
  let nextSequence = existing.reduce((max, segment) => Math.max(max, segment.sequence + 1), 0);

  /**
   * Berhenti global karena gangguan sementara / provider belum siap.
   * Percobaan gagal DIHITUNG per rapat dan dibatasi `MAX_PIPELINE_ATTEMPTS`;
   * begitu mentok, rapat berhenti di PROCESSING_ERROR (audio tetap aman).
   */
  const abort = async (
    reason: TranscriptionSkipReason,
    message: string,
  ): Promise<MeetingOutcome> => {
    const attempts = (meeting.pipelineAttempts ?? 0) + 1;
    const exhausted = attempts >= MAX_PIPELINE_ATTEMPTS;
    await repositories.meetings.update(meetingId, {
      status: exhausted ? 'PROCESSING_ERROR' : previousStatus,
      pipelineAttempts: attempts,
      pipelineError: orFallback(
        message,
        'Transkripsi gagal — audio tetap aman dan bisa dicoba lagi.',
      ),
    });
    log.warn('Transkripsi terhenti', { meetingId, reason, attempts, exhausted, message });
    return reason;
  };

  for (const chunk of chunks) {
    if (chunk.transcriptionAttempts >= MAX_TRANSCRIPTION_ATTEMPTS) {
      // Batas tercapai — jangan coba lagi; pastikan statusnya jujur (FAILED).
      // Tidak dihitung sebagai kegagalan baru (toast hanya untuk yang baru gagal).
      if (chunk.transcriptionStatus !== 'FAILED') {
        await repositories.audioChunks.update(chunk.id, {
          transcriptionStatus: 'FAILED',
          transcriptionError: 'Melewati batas percobaan transkripsi.',
        });
      }
      continue;
    }

    await repositories.audioChunks.update(chunk.id, {
      transcriptionStatus: 'PROCESSING',
      transcriptionAttempts: chunk.transcriptionAttempts + 1,
    });

    try {
      const segments = await options.provider.transcribeChunk({
        chunk,
        readAudio: () => options.storage.readBlob(chunk.localPath),
        language: meeting.language,
        dictionary: options.dictionary,
        sequenceOffset: nextSequence,
      });
      if (segments.length > 0) {
        await repositories.transcript.addSegments(segments);
        nextSequence += segments.length;
        report.segmentsAdded += segments.length;
      }
      await repositories.audioChunks.update(chunk.id, {
        transcriptionStatus: 'DONE',
        transcriptionError: undefined,
        transcribedAt: new Date().toISOString(),
      });
      report.transcribedChunks += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isAppError(error) && error.code === 'PROVIDER_UNAVAILABLE') {
        // Provider tidak tersedia → kembalikan chunk ke PENDING tanpa menghitung
        // percobaan chunk; berhenti (chunk berikutnya pasti gagal juga).
        await repositories.audioChunks.update(chunk.id, {
          transcriptionStatus: 'PENDING',
          transcriptionAttempts: chunk.transcriptionAttempts,
          transcriptionError: undefined,
        });
        log.info('Provider transkripsi belum tersedia', { meetingId });
        return abort('PROVIDER_UNAVAILABLE', message);
      }

      if (isAppError(error) && error.retryable) {
        // Gangguan sementara (jaringan/unduhan model) → coba lagi run berikutnya.
        await repositories.audioChunks.update(chunk.id, {
          transcriptionStatus: 'PENDING',
          transcriptionAttempts: chunk.transcriptionAttempts,
          transcriptionError: message,
        });
        log.warn('Transkripsi terhenti sementara', { meetingId, message });
        return abort('RETRYABLE_FAILED', message);
      }

      // Gagal permanen (mis. codec tak didukung) → catat, lanjut chunk berikutnya.
      await repositories.audioChunks.update(chunk.id, {
        transcriptionStatus: 'FAILED',
        transcriptionError: message,
      });
      report.failedChunks += 1;
      log.warn('Chunk gagal ditranskripsi', { meetingId, sequence: chunk.sequence, message });
    }
  }

  const remaining = (await repositories.audioChunks.listByMeeting(meetingId)).filter(
    (chunk) => chunk.transcriptionStatus !== 'DONE',
  );
  if (remaining.length === 0) {
    // Transkrip siap — tahap ringkasan/notulen dilanjutkan oleh `runPipeline`.
    await repositories.meetings.update(meetingId, {
      status: 'TRANSCRIPT_READY',
      pipelineAttempts: 0,
      pipelineError: undefined,
    });
    report.transcriptReadyMeetings += 1;
  } else {
    const firstError = remaining.find((chunk) => chunk.transcriptionError !== undefined);
    // Sisa chunk = kegagalan non-retryable / percobaan chunk sudah mentok.
    // Hitung sebagai percobaan tahap supaya TIDAK berputar selamanya tiap 15 dtk.
    const attempts = (meeting.pipelineAttempts ?? 0) + 1;
    await repositories.meetings.update(meetingId, {
      status: 'PROCESSING_ERROR',
      pipelineAttempts: attempts,
      pipelineError: orFallback(
        firstError?.transcriptionError,
        'Sebagian audio gagal ditranskripsi — audio tetap aman dan bisa dicoba lagi.',
      ),
    });
    log.warn('Transkripsi berhenti dengan sisa chunk gagal', {
      meetingId,
      attempts,
      exhausted: attempts >= MAX_PIPELINE_ATTEMPTS,
      remaining: remaining.length,
    });
    report.errorMeetings += 1;
  }
  return null;
}

/**
 * Proses SEMUA chunk yang belum selesai ditranskripsi.
 * Aman dipanggil berulang (app start, interval scheduler, setelah stop) — idempoten.
 */
export async function processPendingTranscription(
  options: TranscriptionQueueOptions,
): Promise<TranscriptionReport> {
  const report = emptyReport();

  if (options.isRecordingActive()) {
    return { ...report, status: 'SKIPPED', skipReason: 'RECORDING' };
  }
  if (!(await options.provider.isAvailable())) {
    return { ...report, status: 'SKIPPED', skipReason: 'PROVIDER_UNAVAILABLE' };
  }

  const pending = await options.repositories.audioChunks.listPendingTranscription();
  if (pending.length === 0) {
    await healStuckMeetings(options.repositories, report);
    return report;
  }

  // Kelompokkan per rapat, urutkan per sequence (timestamp monoton).
  const byMeeting = new Map<string, AudioChunk[]>();
  for (const chunk of pending) {
    const list = byMeeting.get(chunk.meetingId);
    if (list === undefined) byMeeting.set(chunk.meetingId, [chunk]);
    else list.push(chunk);
  }

  for (const [meetingId, chunks] of byMeeting) {
    chunks.sort((a, b) => a.sequence - b.sequence);
    const abortReason = await processMeeting(meetingId, chunks, options, report);
    if (abortReason !== null) {
      return { ...report, status: 'SKIPPED', skipReason: abortReason };
    }
  }

  await healStuckMeetings(options.repositories, report);
  report.status = 'PROCESSED';
  return report;
}

/**
 * Pastikan tidak ada rapat yang tersangkut "menunggu" tanpa batas waktu:
 * - status tahap transkripsi + seluruh chunk DONE → TRANSCRIPT_READY
 *   (crash tepat setelah chunk terakhir, sebelum status meeting diperbarui);
 * - status tahap transkripsi + TIDAK ADA chunk sama sekali → PROCESSING_ERROR
 *   dengan pesan jujur (tidak ada audio yang tersimpan).
 */
async function healStuckMeetings(
  repositories: Repositories,
  report: TranscriptionReport,
): Promise<void> {
  const meetings = await repositories.meetings.list({ limit: 1000 });
  for (const meeting of meetings) {
    if (!isInTranscriptionStage(meeting.status)) continue;
    if (meeting.status === 'TRANSCRIPT_READY') continue;
    // Percobaan sudah mentok — jangan dibangkitkan tiap run (loop tak berujung).
    if (
      meeting.status === 'PROCESSING_ERROR' &&
      (meeting.pipelineAttempts ?? 0) >= MAX_PIPELINE_ATTEMPTS
    ) {
      continue;
    }

    const chunks = await repositories.audioChunks.listByMeeting(meeting.id);

    if (chunks.length === 0) {
      // PROCESSING_ERROR tanpa audio memang sudah benar — jangan ditimpa.
      if (meeting.status === 'PROCESSING_ERROR' || meeting.status === 'ERROR') continue;
      if (meeting.status === 'RECORDING' || meeting.status === 'SAVING_AUDIO') continue;
      await repositories.meetings.update(meeting.id, {
        status: 'PROCESSING_ERROR',
        pipelineError: 'Tidak ada audio yang tersimpan dari rekaman ini.',
      });
      report.errorMeetings += 1;
      log.warn('Rapat tanpa audio dipulihkan ke PROCESSING_ERROR', { meetingId: meeting.id });
      continue;
    }

    if (chunks.every((chunk) => chunk.transcriptionStatus === 'DONE')) {
      await repositories.meetings.update(meeting.id, {
        status: 'TRANSCRIPT_READY',
        pipelineAttempts: 0,
        pipelineError: undefined,
      });
      report.transcriptReadyMeetings += 1;
    }
  }
}
