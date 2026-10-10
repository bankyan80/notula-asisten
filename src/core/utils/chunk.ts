/**
 * Utilitas audio chunk & estimasi storage.
 * Default: 5 menit per chunk (PRD §9.1).
 */

export const DEFAULT_CHUNK_DURATION_SECONDS = 300;

/** Default 128 kbps ≈ 960 MB / 2 jam (perkiraan konservatif format m4a). */
export const DEFAULT_AUDIO_BITRATE_KBPS = 128;

export interface ChunkPlanItem {
  sequence: number;
  startTime: number;
  endTime: number;
}

/** Membagi durasi total menjadi rencana chunk (sequence mulai dari 1). */
export function planChunks(
  totalDurationSeconds: number,
  chunkDurationSeconds: number = DEFAULT_CHUNK_DURATION_SECONDS,
): ChunkPlanItem[] {
  if (totalDurationSeconds <= 0) return [];
  if (chunkDurationSeconds <= 0) {
    throw new RangeError('chunkDurationSeconds harus lebih besar dari 0');
  }
  const items: ChunkPlanItem[] = [];
  let start = 0;
  let sequence = 1;
  while (start < totalDurationSeconds) {
    const end = Math.min(start + chunkDurationSeconds, totalDurationSeconds);
    items.push({ sequence, startTime: start, endTime: end });
    start = end;
    sequence += 1;
  }
  return items;
}

/** Sequence → nama file: 1 → "000001.m4a". */
export function chunkFileName(sequence: number, extension = 'm4a'): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError('sequence harus bilangan bulat positif');
  }
  return `${String(sequence).padStart(6, '0')}.${extension}`;
}

/** Struktur folder rapat (PRD §13). */
export function meetingFolderPath(meetingId: string): string {
  return `Meetings/${meetingId}`;
}

export function chunkRelativePath(meetingId: string, sequence: number, extension = 'm4a'): string {
  return `${meetingFolderPath(meetingId)}/audio/${chunkFileName(sequence, extension)}`;
}

export interface MeetingFolders {
  root: string;
  audio: string;
  transcript: string;
  speakers: string;
  summary: string;
  export: string;
  metadata: string;
}

export function meetingFolders(meetingId: string): MeetingFolders {
  const root = meetingFolderPath(meetingId);
  return {
    root,
    audio: `${root}/audio`,
    transcript: `${root}/transcript`,
    speakers: `${root}/speakers`,
    summary: `${root}/summary`,
    export: `${root}/export`,
    metadata: `${root}/metadata`,
  };
}

export function bytesPerSecond(bitrateKbps: number = DEFAULT_AUDIO_BITRATE_KBPS): number {
  if (bitrateKbps <= 0) throw new RangeError('bitrateKbps harus lebih besar dari 0');
  return (bitrateKbps * 1000) / 8;
}

export interface StorageEstimate {
  requiredBytes: number;
  freeBytes: number;
  isEnough: boolean;
  /** Sisa ruang setelah rekaman (bisa negatif bila tidak cukup) */
  remainingBytes: number;
}

/** Estimasi kebutuhan storage untuk durasi tertentu. */
export function estimateStorage(
  durationSeconds: number,
  freeBytes: number,
  bitrateKbps: number = DEFAULT_AUDIO_BITRATE_KBPS,
): StorageEstimate {
  const duration = Math.max(0, durationSeconds);
  const requiredBytes = Math.ceil(bytesPerSecond(bitrateKbps) * duration);
  const remainingBytes = freeBytes - requiredBytes;
  return {
    requiredBytes,
    freeBytes,
    isEnough: remainingBytes >= 0,
    remainingBytes,
  };
}

/** "1.2 GB", "450 MB", "12 KB" — untuk ditampilkan ke pengguna. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 100 || unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}
