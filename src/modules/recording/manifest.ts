/**
 * Manifest chunk audio — `Meetings/{id}/audio/manifest.json` (Batch 05).
 *
 * Urutan persistensi per chunk: **manifest → file → metadata DB**.
 * Dengan urutan ini setiap kondisi crash bisa dipulihkan dengan timeline yang
 * diketahui (lihat `recovery.ts`):
 * - manifest ada, file tidak  → entri dibuang (chunk memang belum utuh);
 * - manifest + file, DB tidak → metadata diadopsi dari manifest;
 * - file + DB, manifest tidak → manifest dibangun ulang dari DB.
 */
import { z } from 'zod';
import { createLogger } from '../../core/logging/logger';
import type { StorageProvider } from '../../core/types/providers';
import { audioManifestPath } from '../../core/utils/paths';

const log = createLogger('recording.manifest');

export const AUDIO_MANIFEST_VERSION = 1;

const manifestChunkSchema = z.object({
  sequence: z.number().int().positive(),
  localPath: z.string().min(1),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  byteSize: z.number().int().min(0).optional(),
  mimeType: z.string().min(1),
});

const manifestSchema = z.object({
  version: z.number().int().positive(),
  meetingId: z.string().min(1),
  mimeType: z.string().min(1),
  chunkDurationSeconds: z.number().int().positive().optional(),
  updatedAt: z.string().min(1),
  chunks: z.array(manifestChunkSchema),
});

export type ManifestChunkEntry = z.infer<typeof manifestChunkSchema>;
export type AudioManifest = z.infer<typeof manifestSchema>;

/** Baca manifest; `null` bila belum ada / korup / versi tidak dikenal (jujur). */
export async function readManifest(
  storage: StorageProvider,
  meetingId: string,
): Promise<AudioManifest | null> {
  const path = audioManifestPath(meetingId);
  if (!(await storage.exists(path))) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(await storage.readText(path));
  } catch {
    log.warn('Manifest tidak terbaca (diabaikan untuk recovery)', { meetingId, path });
    return null;
  }

  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('Manifest tidak valid (diabaikan untuk recovery)', { meetingId, path });
    return null;
  }
  if (parsed.data.version > AUDIO_MANIFEST_VERSION) {
    log.warn('Manifest berasal dari versi aplikasi lebih baru', {
      meetingId,
      version: parsed.data.version,
    });
    return null;
  }
  if (parsed.data.meetingId !== meetingId) {
    log.warn('Manifest milik rapat lain (diabaikan)', { meetingId });
    return null;
  }
  return parsed.data;
}

export async function writeManifest(
  storage: StorageProvider,
  manifest: AudioManifest,
): Promise<void> {
  await storage.writeText(audioManifestPath(manifest.meetingId), JSON.stringify(manifest, null, 2));
}

export interface RecordChunkMeta {
  meetingId: string;
  mimeType: string;
  chunkDurationSeconds: number;
}

/** Tambah/ganti entri chunk (upsert per sequence) lalu tulis manifest. */
export async function recordChunkInManifest(
  storage: StorageProvider,
  entry: ManifestChunkEntry,
  meta: RecordChunkMeta,
): Promise<AudioManifest> {
  const current = await readManifest(storage, meta.meetingId);
  const chunks = [
    ...(current?.chunks ?? []).filter((chunk) => chunk.sequence !== entry.sequence),
    entry,
  ].sort((a, b) => a.sequence - b.sequence);

  const manifest: AudioManifest = {
    version: AUDIO_MANIFEST_VERSION,
    meetingId: meta.meetingId,
    mimeType: meta.mimeType,
    chunkDurationSeconds: current?.chunkDurationSeconds ?? meta.chunkDurationSeconds,
    updatedAt: new Date().toISOString(),
    chunks,
  };
  await writeManifest(storage, manifest);
  return manifest;
}
