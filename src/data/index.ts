/**
 * Registry repository — satu titik untuk memilih backend penyimpanan.
 *
 * Batch 03: IndexedDB/Dexie (survive reload, skema berversi).
 * Batch 14+: SQLite Android opsional — cukup ganti implementasi DI SINI,
 *            UI dan modul tidak perlu berubah sama sekali.
 */
import { getStorageProvider } from '../providers';
import { NotulaDatabase } from './dexie/db';
import { createDexieRepositories } from './dexie/repositories';
import type { Repositories } from './repositories';

let database: NotulaDatabase | null = null;
let repositories: Repositories | null = null;

export function getRepositories(): Repositories {
  if (!repositories) {
    database = new NotulaDatabase();
    repositories = createDexieRepositories(database);
  }
  return repositories;
}

/** Test-only: reset repository singleton (menutup koneksi DB). */
export function resetRepositories(): void {
  repositories = null;
  if (database) {
    database.close();
    database = null;
  }
}

/**
 * Hapus SELURUH data lokal: file rapat (OPFS, best effort) + seluruh tabel DB.
 * Dipakai tombol "Hapus semua data lokal" di Pengaturan.
 */
export async function clearAllLocalData(): Promise<void> {
  const repo = getRepositories();
  const storage = getStorageProvider();

  const meetings = await repo.meetings.list();
  for (const meeting of meetings) {
    try {
      await storage.removeMeeting(meeting.id);
    } catch {
      // OPFS tidak tersedia → memang tidak ada file yang perlu dihapus.
    }
  }

  if (!database) return;
  const db = database;
  await db.transaction('rw', db.allTables(), async () => {
    await Promise.all(db.allTables().map((table) => table.clear()));
  });
}

export type { Repositories };
export type { CreateMeetingInput, ListOptions } from './repositories';
