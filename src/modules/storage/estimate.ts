/**
 * Estimasi storage perangkat — memakai API nyata `navigator.storage.estimate()`.
 * Bila tidak tersedia, hasil dikembalikan `null` (jujur, bukan angka karangan).
 */
import { DEFAULT_AUDIO_BITRATE_KBPS, bytesPerSecond, formatBytes } from '../../core/utils/chunk';

export interface DeviceStorageInfo {
  /** byte yang tersedia untuk origin ini, null bila API tidak tersedia */
  availableBytes: number | null;
  /** quota/usage browser selalu bersifat perkiraan */
  isEstimated: boolean;
}

export async function getDeviceStorage(): Promise<DeviceStorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { availableBytes: null, isEstimated: true };
  }
  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.quota === undefined) return { availableBytes: null, isEstimated: true };
    const usage = estimate.usage ?? 0;
    return { availableBytes: Math.max(0, estimate.quota - usage), isEstimated: true };
  } catch {
    return { availableBytes: null, isEstimated: true };
  }
}

/** Kebutuhan storage untuk durasi rekaman tertentu. */
export function requiredBytesFor(durationSeconds: number): number {
  return Math.ceil(bytesPerSecond(DEFAULT_AUDIO_BITRATE_KBPS) * durationSeconds);
}

export type StorageLevel = 'unknown' | 'enough' | 'warning' | 'insufficient';

const WARNING_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB

export function evaluateStorage(info: DeviceStorageInfo, requiredBytes: number): StorageLevel {
  if (info.availableBytes === null) return 'unknown';
  if (info.availableBytes < requiredBytes) return 'insufficient';
  if (info.availableBytes < WARNING_THRESHOLD_BYTES) return 'warning';
  return 'enough';
}

export const STORAGE_LEVEL_LABEL: Record<StorageLevel, string> = {
  unknown: 'Estimasi tidak tersedia',
  enough: 'AMAN',
  warning: 'PERINGATAN',
  insufficient: 'TIDAK CUKUP',
};

export { formatBytes };
