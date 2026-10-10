/**
 * Pipeline diarization pasc-transkripsi (Batch 08).
 *
 * Dipanggil dari `runTranscription` (fire-and-forget) — setiap rapat COMPLETED
 * yang masih punya segmen tanpa pembicara diproses; kalau semua segmen sudah
 * ter-assign, dilewati TANPA decode ulang audio (hemat).
 *
 * Jaminan PRD §13/§14:
 * - Nama pengguna TIDAK PERNAH ditimpa saat run ulang (rename = permanen).
 * - Durasi & jumlah segmen dihitung ulang dari transkrip (angka tidak basi).
 * - Provider tidak tersedia / audio hilang → dilewati jujur, data tidak diubah.
 */
import { createLogger } from '../../core/logging/logger';
import { createId } from '../../core/utils/id';
import { nowIso } from '../../core/utils/time';
import type { Repositories } from '../../data/repositories';
import type { Speaker } from '../../core/types/entities';
import type { SpeakerDiarizationProvider, StorageProvider } from '../../core/types/providers';
import {
  getRecordingEngine,
  getSpeakerDiarizationProvider,
  getStorageProvider,
} from '../../providers';
import {
  computeSpeakerStats,
  orderedTurnCodes,
  pickSpeakerCodeForSegment,
  toTimelineTurns,
  type TimelineTurn,
} from './assignSpeakers';

const log = createLogger('speakers.diarization');

export interface DiarizationOptions {
  repositories: Repositories;
  provider: SpeakerDiarizationProvider;
  storage: StorageProvider;
  isRecordingActive?: () => boolean;
}

export interface DiarizationReport {
  status: 'PROCESSED' | 'SKIPPED';
  skipReason?:
    'RECORDING' | 'PROVIDER_UNAVAILABLE' | 'NO_SEGMENTS' | 'ALREADY_ASSIGNED' | 'NO_AUDIO';
  meetingId?: string;
  /** Speaker yang dibuat + yang statistiknya diperbarui. */
  speakersUpserted: number;
  /** Segmen yang speakerId-nya berubah pada run ini. */
  segmentsAssigned: number;
}

function isProcessable(status: string): boolean {
  // Transkrip sudah ada (tahap akhir pipeline) maupun rapat lama yang sudah
  // COMPLETED — keduanya aman dijadikan bahan segmentasi pembicara.
  return status === 'TRANSCRIPT_READY' || status === 'COMPLETED';
}

async function processMeeting(
  meetingId: string,
  options: DiarizationOptions,
): Promise<DiarizationReport> {
  const { repositories, provider, storage } = options;
  const empty = {
    meetingId,
    speakersUpserted: 0,
    segmentsAssigned: 0,
  };

  const segments = await repositories.transcript.listByMeeting(meetingId);
  if (segments.length === 0) return { status: 'SKIPPED', skipReason: 'NO_SEGMENTS', ...empty };

  const existingSpeakers = await repositories.speakers.listByMeeting(meetingId);
  const allAssigned =
    existingSpeakers.length > 0 && segments.every((segment) => segment.speakerId !== undefined);
  if (allAssigned) {
    return { status: 'SKIPPED', skipReason: 'ALREADY_ASSIGNED', ...empty };
  }

  // Kumpulkan giliran bicara dari SEMUA chunk yang filenya masih ada.
  const chunks = (await repositories.audioChunks.listByMeeting(meetingId)).sort(
    (a, b) => a.sequence - b.sequence,
  );
  const turns: TimelineTurn[] = [];
  let readableChunks = 0;
  let failedChunks = 0;
  for (const chunk of chunks) {
    try {
      const chunkTurns = await provider.identifySegments({
        chunk,
        readAudio: () => storage.readBlob(chunk.localPath),
        language: 'id',
      });
      turns.push(...toTimelineTurns(chunkTurns, chunk.startTime));
      readableChunks += 1;
    } catch (error) {
      failedChunks += 1;
      log.warn('Diarization chunk dilewati', {
        meetingId,
        chunkSequence: chunk.sequence,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (failedChunks > 0) {
    log.warn('Sebagian chunk tidak bisa dianalisis — hasil memakai chunk yang terbaca', {
      meetingId,
      failedChunks,
      readableChunks,
    });
  }
  if (readableChunks === 0) {
    return { status: 'SKIPPED', skipReason: 'NO_AUDIO', ...empty };
  }

  // Pastikan entri pembicara ada per kode — pertahankan ID & NAMA lama (rename aman).
  const byCode = new Map(existingSpeakers.map((speaker) => [speaker.code, speaker]));
  const codes = orderedTurnCodes(turns);
  const created: Speaker[] = [];
  for (const code of codes) {
    if (byCode.has(code)) continue;
    const index = byCode.size + 1;
    const speaker: Speaker = {
      id: createId(),
      meetingId,
      code,
      displayName: `Pembicara ${index}`,
      durationSeconds: 0,
      segmentCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    byCode.set(code, speaker);
    created.push(speaker);
  }

  // Assign segmen → pembicara (max tumpang-tindih); lalu hitung ulang statistik.
  const assignedSegments = segments.map((segment) => {
    const code = pickSpeakerCodeForSegment(segment, turns);
    const speaker = code !== null ? byCode.get(code) : undefined;
    if (speaker === undefined || speaker.id === segment.speakerId) return segment;
    return { ...segment, speakerId: speaker.id };
  });

  let segmentsAssigned = 0;
  for (let i = 0; i < assignedSegments.length; i += 1) {
    const updated = assignedSegments[i]!;
    if (updated !== segments[i]) {
      await repositories.transcript.updateSegment(updated.id, { speakerId: updated.speakerId });
      segmentsAssigned += 1;
    }
  }

  const stats = computeSpeakerStats(assignedSegments);
  const timestamp = nowIso();
  const allSpeakers = [...byCode.values()].map((speaker) => {
    const speakerStats = stats.get(speaker.id);
    return {
      ...speaker,
      durationSeconds: speakerStats?.durationSeconds ?? 0,
      segmentCount: speakerStats?.segmentCount ?? 0,
      updatedAt: timestamp,
    };
  });
  await repositories.speakers.upsertMany(allSpeakers);

  return {
    status: 'PROCESSED',
    meetingId,
    speakersUpserted: allSpeakers.length,
    segmentsAssigned,
  };
}

/** Proses SEMUA rapat COMPLETED yang masih butuh assignment. Idempoten. */
export async function processDiarization(
  options: DiarizationOptions,
): Promise<DiarizationReport[]> {
  if (options.isRecordingActive?.() === true) {
    return [
      { status: 'SKIPPED', skipReason: 'RECORDING', speakersUpserted: 0, segmentsAssigned: 0 },
    ];
  }
  if (!(await options.provider.isAvailable())) {
    return [
      {
        status: 'SKIPPED',
        skipReason: 'PROVIDER_UNAVAILABLE',
        speakersUpserted: 0,
        segmentsAssigned: 0,
      },
    ];
  }

  const meetings = await options.repositories.meetings.list();
  const reports: DiarizationReport[] = [];
  for (const meeting of meetings) {
    if (!isProcessable(meeting.status)) continue;
    reports.push(await processMeeting(meeting.id, options));
  }
  return reports;
}

let activeRun: Promise<DiarizationReport[]> | null = null;

/**
 * Pemicu dari sisi aplikasi (dipanggil `runTranscription` setelah antrian
 * transkripsi; satu run pada satu waktu, gagal diam — audio tetap aman).
 */
export function runDiarization(repositories: Repositories): Promise<DiarizationReport[]> {
  if (activeRun !== null) return activeRun;
  activeRun = (async () => {
    const reports = await processDiarization({
      repositories,
      provider: getSpeakerDiarizationProvider(),
      storage: getStorageProvider(),
      isRecordingActive: () => {
        const status = getRecordingEngine().getState().status;
        return status === 'recording' || status === 'paused';
      },
    });
    const processed = reports.filter((report) => report.status === 'PROCESSED');
    if (processed.length > 0) {
      log.info('Diarization selesai', {
        meetings: processed.length,
        segmentsAssigned: processed.reduce((sum, r) => sum + r.segmentsAssigned, 0),
      });
    }
    return reports;
  })().finally(() => {
    activeRun = null;
  });
  return activeRun;
}
