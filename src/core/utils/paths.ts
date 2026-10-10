/**
 * Utilitas path file rapat — struktur folder WAJIB sama di semua platform:
 *
 *   Meetings/{meetingId}/audio/000001.m4a
 *   Meetings/{meetingId}/transcript/segments.json
 *   Meetings/{meetingId}/exports/notulen.pdf
 *
 * Dipakai oleh StorageProvider (OPFS di web, Filesystem Capacitor di Android).
 * ID rapat yang mengandung "/" atau ".." ditolak agar tidak bisa keluar folder.
 */
import { AppError } from '../errors/AppError';

export const MEETINGS_ROOT = 'Meetings';

export type MeetingFileKind = 'audio' | 'transcript' | 'exports';

const KIND_FOLDER: Record<MeetingFileKind, string> = {
  audio: 'audio',
  transcript: 'transcript',
  exports: 'exports',
};

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_FILE_NAME = /^[A-Za-z0-9._-]+$/;

function assertSafeMeetingId(meetingId: string): void {
  if (!SAFE_ID.test(meetingId)) {
    throw new AppError('VALIDATION_ERROR', `ID rapat tidak valid: ${meetingId}`);
  }
}

/** `Meetings/{meetingId}` — root seluruh file satu rapat. */
export function meetingRoot(meetingId: string): string {
  assertSafeMeetingId(meetingId);
  return `${MEETINGS_ROOT}/${meetingId}`;
}

/** `Meetings/{meetingId}/{kind}/{fileName}` */
export function meetingFilePath(
  meetingId: string,
  kind: MeetingFileKind,
  fileName: string,
): string {
  assertSafeMeetingId(meetingId);
  if (!SAFE_FILE_NAME.test(fileName)) {
    throw new AppError('VALIDATION_ERROR', `Nama file tidak valid: ${fileName}`);
  }
  return `${meetingRoot(meetingId)}/${KIND_FOLDER[kind]}/${fileName}`;
}

/** Chunk audio bernomor: `Meetings/{id}/audio/000001.m4a` (urutan mulai 1). */
export function audioChunkPath(meetingId: string, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new AppError('VALIDATION_ERROR', `Urutan chunk tidak valid: ${sequence}`);
  }
  const padded = String(sequence).padStart(6, '0');
  return meetingFilePath(meetingId, 'audio', `${padded}.m4a`);
}

/** Nama file manifest chunk audio. */
export const AUDIO_MANIFEST_FILE_NAME = 'manifest.json';

/** `Meetings/{meetingId}/{kind}` — path direktori (untuk list & recovery). */
export function meetingFolderPath(meetingId: string, kind: MeetingFileKind): string {
  assertSafeMeetingId(meetingId);
  return `${meetingRoot(meetingId)}/${KIND_FOLDER[kind]}`;
}

/** Manifest chunk audio: `Meetings/{id}/audio/manifest.json`. */
export function audioManifestPath(meetingId: string): string {
  return meetingFilePath(meetingId, 'audio', AUDIO_MANIFEST_FILE_NAME);
}

export interface ParsedMeetingPath {
  meetingId: string;
  kind: MeetingFileKind;
  fileName: string;
}

/** Kebalikan dari meetingFilePath; `null` bila bukan path file rapat. */
export function parseMeetingPath(path: string): ParsedMeetingPath | null {
  const parts = path.split('/');
  if (parts.length !== 4 || parts[0] !== MEETINGS_ROOT || !parts[1] || !parts[3]) return null;

  const kindEntry = Object.entries(KIND_FOLDER).find(([, folder]) => folder === parts[2]);
  if (!kindEntry) return null;
  const [kind] = kindEntry;

  if (!SAFE_ID.test(parts[1]) || !SAFE_FILE_NAME.test(parts[3])) return null;

  return { meetingId: parts[1], kind: kind as MeetingFileKind, fileName: parts[3] };
}
