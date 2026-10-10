/**
 * Sync engine (Batch 12) — antrean sinkronisasi cloud OPSIONAL PRD §10/§25.
 *
 * Alur wajib: SAVE LOCAL → VERIFY LOCAL → UPLOAD.
 * - `enqueueMeetingSync` mendaftar item HANYA bila data lokal benar ada
 *   (idempoten: PENDING/UPLOADING/RETRY untuk kunci yang sama tidak diduplikasi).
 * - `processQueue` memverifikasi ulang payload tepat sebelum upload; provider
 *   belum tersedia / offline → item tetap menunggu (PENDING), tidak ditandai
 *   sukses atau gagal palsu.
 * - Gagal upload → `markFailed` (attempts +1, lastError jujur); `retryFailedSync`
 *   mengembalikan ke RETRY lalu diproses lagi.
 */
import { AppError, friendlyMessage } from '../../core/errors/AppError';
import type { SyncEntityKind, SyncQueueItem } from '../../core/types/entities';
import type { StorageProvider, SyncPayload, SyncProvider } from '../../core/types/providers';
import type { Repositories } from '../../data/repositories';
import { audioChunkPath } from '../../core/utils/paths';
import { createId } from '../../core/utils/id';
import { nowIso } from '../../core/utils/time';

export interface SyncEngineDeps {
  repositories: Repositories;
  provider: SyncProvider;
  storage: StorageProvider;
  /** Default: `navigator.onLine` (jsdom/browser), test dapat meng-inject. */
  isOnline?: () => boolean;
}

export interface EnqueueResult {
  created: SyncQueueItem[];
  /** Kandidat yang dilewati (sudah antre / file tidak ada / kosong). */
  skipped: number;
}

export interface ProcessResult {
  uploaded: number;
  failed: number;
  /** Menunggu: provider belum siap / offline, atau tidak ada antrean. */
  skipped: number;
  reason?: 'provider_unavailable' | 'offline';
}

function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function isOnline(deps: SyncEngineDeps): boolean {
  return deps.isOnline ? deps.isOnline() : defaultIsOnline();
}

function entityKey(kind: SyncEntityKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

/** Kunci antrean yang masih menunggu/berjalan (FAILED ditangani `retryFailed`). */
function activeKeys(items: SyncQueueItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    if (item.status === 'PENDING' || item.status === 'UPLOADING' || item.status === 'RETRY') {
      keys.add(entityKey(item.entityKind, item.entityId));
    }
  }
  return keys;
}

function makeItem(meetingId: string, kind: SyncEntityKind, entityId: string): SyncQueueItem {
  const now = nowIso();
  return {
    id: createId(),
    entityKind: kind,
    entityId,
    meetingId,
    status: 'PENDING',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Daftarkan seluruh entitas rapat yang layak disinkronkan.
 * Verifikasi lokal dilakukan per entitas; yang tidak ada dilewati (bukan error).
 */
export async function enqueueMeetingSync(
  deps: SyncEngineDeps,
  meetingId: string,
): Promise<EnqueueResult> {
  const { repositories, storage } = deps;

  const meeting = await repositories.meetings.getById(meetingId);
  if (meeting === null) {
    throw new AppError('NOT_FOUND', 'Rapat tidak ditemukan di perangkat.');
  }

  const existing = await repositories.syncQueue.listByMeeting(meetingId);
  const active = activeKeys(existing);
  const created: SyncQueueItem[] = [];
  let skipped = 0;

  const add = (kind: SyncEntityKind, entityId: string): void => {
    if (active.has(entityKey(kind, entityId))) {
      skipped += 1;
      return;
    }
    active.add(entityKey(kind, entityId)); // jangan dobel dalam satu batch juga
    created.push(makeItem(meetingId, kind, entityId));
  };

  add('meeting', meeting.id);

  const segments = await repositories.transcript.listByMeeting(meetingId);
  if (segments.length > 0) add('transcript', meetingId);
  else skipped += 1;

  const summary = await repositories.summaries.get(meetingId);
  if (summary !== null) add('summary', meetingId);
  else skipped += 1;

  // Audio: hanya yang FILE-nya benar ada di storage (verify local).
  const chunks = await repositories.audioChunks.listByMeeting(meetingId);
  let storageReachable = chunks.length > 0;
  for (const chunk of chunks) {
    if (!storageReachable) {
      skipped += 1;
      continue;
    }
    try {
      const exists = await storage.exists(audioChunkPath(meetingId, chunk.sequence));
      if (exists) add('audio', chunk.id);
      else skipped += 1;
    } catch {
      // OPFS tidak tersedia → semua audio dilewati (jujur, bukan palsu).
      storageReachable = false;
      skipped += 1;
    }
  }

  // Export: hanya yang punya salinan lokal (localPath terisi).
  const exportFiles = await repositories.exports.listByMeeting(meetingId);
  for (const file of exportFiles) {
    if (file.localPath !== '') add('export', file.id);
    else skipped += 1;
  }

  for (const item of created) await repositories.syncQueue.enqueue(item);
  return { created, skipped };
}

/** Verifikasi data lokal & susun payload tepat sebelum upload. */
export async function buildPayload(
  deps: SyncEngineDeps,
  item: SyncQueueItem,
): Promise<SyncPayload> {
  const { repositories, storage } = deps;
  const notFound = (): AppError => new AppError('NOT_FOUND', 'Data tidak ditemukan di perangkat.');

  switch (item.entityKind) {
    case 'meeting': {
      const meeting = await repositories.meetings.getById(item.entityId);
      if (meeting === null) throw notFound();
      return { kind: 'meeting', meetingId: item.meetingId, entityId: item.entityId, data: meeting };
    }
    case 'transcript': {
      const segments = await repositories.transcript.listByMeeting(item.meetingId);
      if (segments.length === 0) throw notFound();
      return {
        kind: 'transcript',
        meetingId: item.meetingId,
        entityId: item.entityId,
        data: { segments },
      };
    }
    case 'summary': {
      const summary = await repositories.summaries.get(item.meetingId);
      if (summary === null) throw notFound();
      return {
        kind: 'summary',
        meetingId: item.meetingId,
        entityId: item.entityId,
        data: { summary },
      };
    }
    case 'audio': {
      const chunk = await repositories.audioChunks.getById(item.entityId);
      if (chunk === null) throw notFound();
      const path = audioChunkPath(item.meetingId, chunk.sequence);
      const blob = await storage.readBlob(path);
      const fileName = path.slice(path.lastIndexOf('/') + 1);
      return {
        kind: 'audio',
        meetingId: item.meetingId,
        entityId: item.entityId,
        data: { chunk, blob, fileName },
      };
    }
    case 'export': {
      const files = await repositories.exports.listByMeeting(item.meetingId);
      const file = files.find((candidate) => candidate.id === item.entityId);
      if (file === undefined) throw notFound();
      return {
        kind: 'export',
        meetingId: item.meetingId,
        entityId: item.entityId,
        data: { file },
      };
    }
  }
}

/** Proses antrean: verify ulang → upload → tandai hasil. Aman dipanggil berulang. */
export async function processQueue(deps: SyncEngineDeps, limit = 50): Promise<ProcessResult> {
  const pending = await deps.repositories.syncQueue.listPending(limit);
  if (pending.length === 0) return { uploaded: 0, failed: 0, skipped: 0 };

  if (!deps.provider.isAvailable()) {
    return { uploaded: 0, failed: 0, skipped: pending.length, reason: 'provider_unavailable' };
  }
  if (!isOnline(deps)) {
    return { uploaded: 0, failed: 0, skipped: pending.length, reason: 'offline' };
  }

  let uploaded = 0;
  let failed = 0;
  for (const item of pending) {
    await deps.repositories.syncQueue.markUploading(item.id);
    try {
      const payload = await buildPayload(deps, item);
      await deps.provider.upload(payload);
      await deps.repositories.syncQueue.markSuccess(item.id);
      uploaded += 1;
    } catch (error) {
      await deps.repositories.syncQueue.markFailed(item.id, friendlyMessage(error));
      failed += 1;
    }
  }
  return { uploaded, failed, skipped: 0 };
}

/** Kembalikan item FAILED ke RETRY lalu proses ulang. */
export async function retryFailedSync(deps: SyncEngineDeps): Promise<ProcessResult> {
  await deps.repositories.syncQueue.retryFailed();
  return processQueue(deps);
}

/**
 * Setelah rapat COMPLETED (transcriptionQueue): enqueue + proses otomatis
 * HANYA bila mode pengguna `device_cloud`. Default PRD = Hanya Perangkat → no-op.
 */
export async function syncMeetingIfEnabled(
  deps: SyncEngineDeps,
  meetingId: string,
  storageMode: 'device' | 'device_cloud',
): Promise<EnqueueResult | null> {
  if (storageMode !== 'device_cloud') return null;
  try {
    const result = await enqueueMeetingSync(deps, meetingId);
    await processQueue(deps);
    return result;
  } catch {
    // Sinkronisasi opsional: kegagalan enqueue tidak boleh merusak alur utama.
    return null;
  }
}

/** Pasang listener `online` → jalankan proses antrean. Kembalikan fungsi lepas. */
export function attachOnlineSync(onOnline: () => void): () => void {
  const handler = (): void => onOnline();
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
