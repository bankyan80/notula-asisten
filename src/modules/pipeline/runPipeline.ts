/**
 * Pipeline otomatis pascarekaman — satu-satunya penggerak dari audio sampai
 * notulen. Tidak ada tombol tambahan yang harus ditekan pengguna.
 *
 *   SAVING_AUDIO → TRANSCRIPTION_PENDING → TRANSCRIBING → TRANSCRIPT_READY
 *   → SUMMARIZING → GENERATING_MINUTES → COMPLETED
 *
 * Tahapan:
 * 1. TUNGGU seluruh penulisan chunk selesai (menutup race chunk terakhir).
 * 2. Transkripsi audio (`transcriptionQueue`) → simpan segmen ke DB lokal.
 * 3. Ringkasan AI + keputusan + tindak lanjut → simpan.
 * 4. Notulen → simpan → status COMPLETED.
 *
 * Jaminan:
 * - Idempoten: tahap yang sudah berhasil tidak diulang (cek data, bukan status).
 * - Gagal AI → transkrip TETAP terbaca, status TRANSCRIPT_READY + `pipelineError`
 *   (UI menampilkan "Coba Buat Ringkasan Lagi").
 * - Percobaan otomatis dibatasi `MAX_PIPELINE_ATTEMPTS` per tahap.
 * - Audio tidak pernah dihapus saat gagal.
 * - Disimpan di DB → bisa dilanjutkan setelah aplikasi ditutup/buka lagi.
 */
import { friendlyMessage } from '../../core/errors/AppError';
import { createLogger } from '../../core/logging/logger';
import type { MeetingStatus } from '../../core/types/entities';
import type { Repositories } from '../../data/repositories';
import type {
  AISummarizationProvider,
  SpeechToTextProvider,
  StorageProvider,
} from '../../core/types/providers';
import { useToastStore } from '../../app/toastStore';
import {
  getAISummarizationProvider,
  getRecordingEngine,
  getSpeechToTextProvider,
  getStorageProvider,
} from '../../providers';
import { useSettingsStore } from '../settings/settingsStore';
import { runDiarization } from '../speakers/runDiarization';
import { maybeSyncCompletedMeeting } from '../sync/autoSync';
import { generateMinutesForMeeting } from '../minutes/generateForMeeting';
import { generateSummaryForMeeting } from '../summary/generateSummary';
import { drainChunkWrites } from '../recording/chunkWriteChain';
import {
  processPendingTranscription,
  type TranscriptionReport,
} from '../transcription/transcriptionQueue';
import { MAX_PIPELINE_ATTEMPTS } from './pipelineStatus';

const log = createLogger('pipeline.run');

export interface PipelineOptions {
  repositories: Repositories;
  storage: StorageProvider;
  stt: SpeechToTextProvider;
  ai: AISummarizationProvider;
  dictionary: string[];
  isRecordingActive: () => boolean;
}

export interface PipelineReport {
  transcription: TranscriptionReport;
  summariesCreated: number;
  minutesCreated: number;
  completedMeetings: number;
  /** Rapat yang gagal pada tahap ringkasan/notulen (transkrip tetap aman). */
  failedAiMeetings: number;
  skipped: boolean;
}

function emptyReport(): PipelineReport {
  return {
    transcription: {
      status: 'NO_PENDING',
      transcribedChunks: 0,
      failedChunks: 0,
      segmentsAdded: 0,
      transcriptReadyMeetings: 0,
      errorMeetings: 0,
    },
    summariesCreated: 0,
    minutesCreated: 0,
    completedMeetings: 0,
    failedAiMeetings: 0,
    skipped: false,
  };
}

/** Rapat yang tahap AI-nya belum selesai (termasuk sisa crash di tengah jalan). */
function needsFinalization(status: string): boolean {
  return (
    status === 'TRANSCRIPT_READY' || status === 'SUMMARIZING' || status === 'GENERATING_MINUTES'
  );
}

/**
 * Tahap ringkasan + notulen. Berhenti pada kegagalan pertama per rapat dan
 * mencatat `pipelineError`; transkrip tidak disentuh.
 */
async function finalizeMeetings(options: PipelineOptions, report: PipelineReport): Promise<void> {
  const { repositories } = options;
  const meetings = await repositories.meetings.list({ limit: 1000 });

  for (const meeting of meetings) {
    if (!needsFinalization(meeting.status)) continue;

    const segments = await repositories.transcript.listByMeeting(meeting.id);
    if (segments.length === 0) {
      // Audio tertranskripsi tetapi tidak menghasilkan TEKS apa pun
      // (rekaman sunyi/bising). Jujur: berhenti dengan pesan jelas, tanpa
      // mengarang ringkasan. Percobaan otomatis dimatikan langsung karena
      // audio yang sama pasti memberi hasil yang sama; pengguna memutuskan
      // lewat tombol "Coba Lagi" (yang me-reset chunk → transkripsi ulang).
      await repositories.meetings.update(meeting.id, {
        status: 'PROCESSING_ERROR',
        pipelineAttempts: MAX_PIPELINE_ATTEMPTS,
        pipelineError:
          'Tidak ada teks yang terbaca dari rekaman ini. Periksa mikrofon saat merekam.',
      });
      report.failedAiMeetings += 1;
      log.warn('Rapat tanpa teks — transkripsi tidak menghasilkan segmen', {
        meetingId: meeting.id,
      });
      continue;
    }

    const fail = async (error: unknown): Promise<void> => {
      const attempts = (meeting.pipelineAttempts ?? 0) + 1;
      await repositories.meetings.update(meeting.id, {
        status: 'TRANSCRIPT_READY',
        pipelineAttempts: attempts,
        pipelineError: friendlyMessage(error),
      });
      report.failedAiMeetings += 1;
      log.warn('Tahap AI gagal', {
        meetingId: meeting.id,
        attempts,
        exhausted: attempts >= MAX_PIPELINE_ATTEMPTS,
        error: friendlyMessage(error),
      });
    };

    let summary = await repositories.summaries.get(meeting.id);
    if (summary === null) {
      if ((meeting.pipelineAttempts ?? 0) >= MAX_PIPELINE_ATTEMPTS) {
        // Percobaan otomatis mentok — UI menyediakan "Coba Buat Ringkasan Lagi".
        report.failedAiMeetings += 1;
        continue;
      }
      await repositories.meetings.update(meeting.id, { status: 'SUMMARIZING' });
      try {
        summary = await generateSummaryForMeeting(repositories, meeting.id, options.ai);
        report.summariesCreated += 1;
      } catch (error) {
        await fail(error);
        continue;
      }
    }

    const existingMinutes = await repositories.minutes.get(meeting.id);
    if (existingMinutes === null) {
      await repositories.meetings.update(meeting.id, { status: 'GENERATING_MINUTES' });
      try {
        await generateMinutesForMeeting(repositories, meeting.id);
        report.minutesCreated += 1;
      } catch (error) {
        await fail(error);
        continue;
      }
    }

    await repositories.meetings.update(meeting.id, {
      status: 'COMPLETED',
      pipelineAttempts: 0,
      pipelineError: undefined,
    });
    report.completedMeetings += 1;
    await maybeSyncCompletedMeeting(repositories, meeting.id);
    log.info('Rapat selesai diproses', { meetingId: meeting.id });
  }
}

/**
 * Jalankan SELURUGH pipeline sekali. Aman dipanggil berulang dari berbagai
 * pemicu (stop, interval, kembali online, tombol coba lagi) — idempoten.
 */
export async function executePipeline(options: PipelineOptions): Promise<PipelineReport> {
  const report = emptyReport();

  // 1. Pastikan seluruh audio benar-benar tersimpan sebelum dibaca.
  await drainChunkWrites();

  if (options.isRecordingActive()) {
    report.skipped = true;
    return report;
  }

  // 2. Transkripsi.
  report.transcription = await processPendingTranscription({
    repositories: options.repositories,
    storage: options.storage,
    provider: options.stt,
    dictionary: options.dictionary,
    isRecordingActive: options.isRecordingActive,
  });

  // 3–4. Ringkasan AI + notulen untuk rapat yang transkripnya sudah siap.
  await finalizeMeetings(options, report);

  // Diarization pembicara — non-blocking; provider tak tersedia cukup dilewati.
  void runDiarization(options.repositories).catch(() => undefined);

  if (report.transcription.failedChunks > 0) {
    useToastStore
      .getState()
      .showToast(
        `${report.transcription.failedChunks} bagian audio gagal ditranskripsi — audio tetap aman.`,
      );
  }
  if (report.completedMeetings > 0) {
    useToastStore.getState().showToast('Rapat selesai. Hasil tersedia.');
  }

  return report;
}

function defaultOptions(repositories: Repositories): PipelineOptions {
  return {
    repositories,
    storage: getStorageProvider(),
    stt: getSpeechToTextProvider(),
    ai: getAISummarizationProvider(),
    dictionary: useSettingsStore.getState().dictionary,
    isRecordingActive: () => {
      const status = getRecordingEngine().getState().status;
      return status === 'recording' || status === 'paused';
    },
  };
}

let activeRun: Promise<PipelineReport> | null = null;
let rerunRequested = false;

/**
 * Pemicu UI/background: satu run pada satu waktu; bila dipanggil selagi berjalan,
 * run ULANG dijadwalkan setelahnya supaya chunk yang baru sampai tidak hilang.
 */
export function runPipeline(repositories: Repositories): Promise<PipelineReport> {
  if (activeRun !== null) {
    rerunRequested = true;
    return activeRun;
  }
  activeRun = (async (): Promise<PipelineReport> => {
    let report = await executePipeline(defaultOptions(repositories));
    while (rerunRequested) {
      rerunRequested = false;
      report = await executePipeline(defaultOptions(repositories));
    }
    return report;
  })().finally(() => {
    activeRun = null;
    rerunRequested = false;
  });
  return activeRun;
}

/**
 * Tombol "Coba Lagi": reset percobaan gagal + kembalikan chunk FAILED ke
 * PENDING, lalu jalankan pipeline. Audio TIDAK pernah dihapus.
 */
export async function retryPipeline(repositories: Repositories, meetingId: string): Promise<void> {
  const meeting = await repositories.meetings.getById(meetingId);
  if (meeting === null) return;

  const chunks = await repositories.audioChunks.listByMeeting(meetingId);
  for (const chunk of chunks) {
    if (chunk.transcriptionStatus === 'FAILED') {
      await repositories.audioChunks.update(chunk.id, {
        transcriptionStatus: 'PENDING',
        transcriptionAttempts: 0,
        transcriptionError: undefined,
      });
    }
  }

  const segments = await repositories.transcript.listByMeeting(meetingId);
  const pending = chunks.filter((chunk) => chunk.transcriptionStatus !== 'DONE');

  let nextStatus: MeetingStatus;
  let errorMessage: string | undefined;
  if (chunks.length === 0) {
    // Tidak ada audio sama sekali — tetap jujur, jangan berpura-pura siap.
    nextStatus = 'PROCESSING_ERROR';
    errorMessage = 'Tidak ada audio yang tersimpan dari rekaman ini.';
  } else if (pending.length > 0 || segments.length === 0) {
    // Transkrip belum ada → ulangi transkripsi dari awal (chunk di-reset).
    nextStatus = 'TRANSCRIPTION_PENDING';
    if (segments.length === 0 && pending.length === 0) {
      for (const chunk of chunks) {
        await repositories.audioChunks.update(chunk.id, {
          transcriptionStatus: 'PENDING',
          transcriptionAttempts: 0,
          transcriptionError: undefined,
        });
      }
    }
  } else {
    // Transkrip sudah lengkap → serahkan ke tahap ringkasan/notulen.
    nextStatus = 'TRANSCRIPT_READY';
  }

  await repositories.meetings.update(meetingId, {
    status: nextStatus,
    pipelineAttempts: 0,
    pipelineError: errorMessage,
  });

  await runPipeline(repositories);
}

/**
 * Koneksi kembali tersedia → beri anggaran percobaan baru untuk rapat yang
 * tertunda (unduhan model Whisper / jaringan adalah penyebab tersering).
 */
export async function resetPendingAttempts(repositories: Repositories): Promise<void> {
  const meetings = await repositories.meetings.list({ limit: 1000 });
  for (const meeting of meetings) {
    if (meeting.status === 'COMPLETED' || meeting.status === 'DRAFT') continue;
    if (meeting.status === 'RECORDING' || meeting.status === 'ARCHIVED') continue;
    if ((meeting.pipelineAttempts ?? 0) === 0) continue;
    await repositories.meetings.update(meeting.id, { pipelineAttempts: 0 });
  }
}
