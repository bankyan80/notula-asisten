/**
 * Pemulihan chunk audio setelah crash/interrupt (Batch 05).
 *
 * Sumber kebenaran: **file di disk**. Manifest memberi timeline; DB memberi
 * metadata. Urutan persist (`manifest → file → DB`, lihat `persistChunk.ts`)
 * membuat semua kondisi crash bisa diselesaikan tanpa menebak-nebak:
 *
 * | Kondisi                         | Tindakan                              |
 * | ------------------------------- | ------------------------------------- |
 * | manifest ada, file hilang       | entri manifest dibuang (belum utuh)   |
 * | DB ada, file hilang             | metadata DB dihapus (gantung)         |
 * | manifest + file, DB hilang      | metadata diadopsi dari manifest       |
 * | file + DB, manifest hilang      | manifest dibangun ulang dari DB       |
 * | file tanpa jejak apa pun        | file DIBIARKAN + dilaporkan (jangan   |
 * |                                 | mengarang timeline)                   |
 *
 * Idempoten: memanggil berulang pada data sehat tidak mengubah apa pun.
 */
import { createLogger } from '../../core/logging/logger';
import type { StorageProvider } from '../../core/types/providers';
import {
  AUDIO_MANIFEST_FILE_NAME,
  audioManifestPath,
  meetingFolderPath,
} from '../../core/utils/paths';
import { createId } from '../../core/utils/id';
import type { Repositories } from '../../data/repositories';
import { AUDIO_MANIFEST_VERSION, readManifest, writeManifest } from './manifest';

const log = createLogger('recording.recovery');

const CHUNK_FILE = /^(\d{6})\.m4a$/;

export interface RecoveryReport {
  meetingId: string;
  /** Metadata dibuat ulang dari manifest (file + manifest ada, DB hilang) */
  adopted: number;
  /** Entri manifest dibuang karena file-nya belum tertulis */
  droppedMissingFile: number;
  /** Record DB dihapus karena file audionya hilang */
  removedMetadata: number;
  /** Manifest dibangun ulang dari metadata DB */
  repairedManifest: number;
  /** File yang tidak dikenal — dibiarkan utuh, dilaporkan untuk inspeksi */
  orphanFiles: string[];
}

function emptyReport(meetingId: string): RecoveryReport {
  return {
    meetingId,
    adopted: 0,
    droppedMissingFile: 0,
    removedMetadata: 0,
    repairedManifest: 0,
    orphanFiles: [],
  };
}

export async function recoverMeeting(
  meetingId: string,
  repositories: Repositories,
  storage: StorageProvider,
): Promise<RecoveryReport> {
  const report = emptyReport(meetingId);
  const audioDir = meetingFolderPath(meetingId, 'audio');

  const pathBySequence = new Map<number, string>();
  for (const path of await storage.list(audioDir)) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (name === AUDIO_MANIFEST_FILE_NAME) continue;
    const match = CHUNK_FILE.exec(name);
    if (match) {
      pathBySequence.set(Number(match[1]), path);
    } else {
      report.orphanFiles.push(path);
    }
  }

  const manifest = await readManifest(storage, meetingId);
  let entries = manifest ? [...manifest.chunks] : [];

  const dbChunks = await repositories.audioChunks.listByMeeting(meetingId);
  const survivingDb = dbChunks.filter((chunk) => pathBySequence.has(chunk.sequence));

  // 1. Metadata gantung: file hilang → bersihkan manifest & DB.
  const missingInManifest = entries.filter((entry) => !pathBySequence.has(entry.sequence));
  if (missingInManifest.length > 0) {
    report.droppedMissingFile = missingInManifest.length;
    entries = entries.filter((entry) => pathBySequence.has(entry.sequence));
  }
  for (const chunk of dbChunks) {
    if (!pathBySequence.has(chunk.sequence)) {
      await repositories.audioChunks.delete(chunk.id);
      report.removedMetadata += 1;
    }
  }

  const dbBySequence = new Map(survivingDb.map((chunk) => [chunk.sequence, chunk]));
  const manifestBySequence = new Map(entries.map((entry) => [entry.sequence, entry]));

  // 2. File + manifest, DB hilang → adopsi timeline dari manifest.
  for (const entry of entries) {
    if (dbBySequence.has(entry.sequence)) continue;
    await repositories.audioChunks.add({
      id: createId(),
      meetingId,
      sequence: entry.sequence,
      localPath: entry.localPath,
      startTime: entry.startTime,
      endTime: entry.endTime,
      durationSeconds: Math.max(0, entry.endTime - entry.startTime),
      ...(entry.byteSize !== undefined ? { byteSize: entry.byteSize } : {}),
      mimeType: entry.mimeType,
      uploadStatus: 'PENDING',
      transcriptionStatus: 'PENDING',
      transcriptionAttempts: 0,
      createdAt: new Date().toISOString(),
    });
    report.adopted += 1;
  }

  // 3. File + DB, manifest hilang → bangun ulang manifest dari DB.
  let needsManifestWrite = manifest === null ? false : report.droppedMissingFile > 0;
  for (const chunk of survivingDb) {
    if (manifestBySequence.has(chunk.sequence)) continue;
    entries.push({
      sequence: chunk.sequence,
      localPath: chunk.localPath,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      ...(chunk.byteSize !== undefined ? { byteSize: chunk.byteSize } : {}),
      mimeType: chunk.mimeType,
    });
    report.repairedManifest += 1;
    needsManifestWrite = true;
  }

  // 4. File yatim (tanpa manifest & tanpa DB) → jangan diadopsi (timeline tidak
  //    diketahui), cukup dilaporkan agar pengguna tahu ada file aneh.
  for (const [sequence, path] of pathBySequence) {
    if (!manifestBySequence.has(sequence) && !dbBySequence.has(sequence)) {
      report.orphanFiles.push(path);
    }
  }

  // 5. Tulis manifest bila ada perubahan (manifest lama dibersihkan/dibangun).
  entries = entries.sort((a, b) => a.sequence - b.sequence);
  const manifestBecameEmpty = manifest !== null && entries.length === 0;
  if (needsManifestWrite || manifestBecameEmpty) {
    if (entries.length > 0) {
      const fallbackMime = survivingDb[0]?.mimeType ?? entries[0]?.mimeType ?? 'audio/webm';
      await writeManifest(storage, {
        version: AUDIO_MANIFEST_VERSION,
        meetingId,
        mimeType: manifest?.mimeType ?? fallbackMime,
        ...(manifest?.chunkDurationSeconds !== undefined
          ? { chunkDurationSeconds: manifest.chunkDurationSeconds }
          : {}),
        updatedAt: new Date().toISOString(),
        chunks: entries,
      });
    } else if (manifest !== null) {
      await storage.remove(audioManifestPath(meetingId));
    }
  }

  if (
    report.adopted > 0 ||
    report.droppedMissingFile > 0 ||
    report.removedMetadata > 0 ||
    report.repairedManifest > 0 ||
    report.orphanFiles.length > 0
  ) {
    log.info('Recovery selesai', { ...report });
  }
  return report;
}

/** Pulihkan semua rapat yang terdaftar di DB. Melempar bila storage tidak tersedia. */
export async function recoverAllMeetings(
  repositories: Repositories,
  storage: StorageProvider,
): Promise<RecoveryReport[]> {
  const meetings = await repositories.meetings.list({ limit: 1000 });
  const reports: RecoveryReport[] = [];
  for (const meeting of meetings) {
    reports.push(await recoverMeeting(meeting.id, repositories, storage));
  }
  return reports;
}
