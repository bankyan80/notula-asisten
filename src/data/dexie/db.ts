/**
 * Skema IndexedDB via Dexie — Batch 03.
 *
 * Skema memakai VERSI (migration), bukan patch ad-hoc: setiap perubahan struktur
 * tabel menambah `this.version(n).stores({...})` sehingga data lama tetap terbaca.
 *
 * Nama tabel = nama entity di `core/types/entities.ts`.
 */
import Dexie, { type EntityTable } from 'dexie';
import type {
  ActionItem,
  AudioChunk,
  Bookmark,
  Decision,
  ExportFile,
  Meeting,
  Minutes,
  Speaker,
  Summary,
  SyncQueueItem,
  TranscriptSegment,
} from '../../core/types/entities';

export const DATABASE_NAME = 'notula';

export class NotulaDatabase extends Dexie {
  meetings!: EntityTable<Meeting, 'id'>;
  audioChunks!: EntityTable<AudioChunk, 'id'>;
  speakers!: EntityTable<Speaker, 'id'>;
  transcriptSegments!: EntityTable<TranscriptSegment, 'id'>;
  bookmarks!: EntityTable<Bookmark, 'id'>;
  summaries!: EntityTable<Summary, 'id'>;
  decisions!: EntityTable<Decision, 'id'>;
  actionItems!: EntityTable<ActionItem, 'id'>;
  minutes!: EntityTable<Minutes, 'id'>;
  exports!: EntityTable<ExportFile, 'id'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;

  constructor(name: string = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      meetings: 'id, date, status, createdAt, updatedAt',
      audioChunks: 'id, meetingId, sequence, [meetingId+sequence], createdAt',
      speakers: 'id, meetingId, [meetingId+code], createdAt',
      transcriptSegments: 'id, meetingId, sequence, [meetingId+sequence], startTime',
      bookmarks: 'id, meetingId, timestamp, [meetingId+timestamp]',
      summaries: 'id, meetingId, createdAt',
      decisions: 'id, meetingId, sourceTimestamp, [meetingId+sourceTimestamp]',
      actionItems: 'id, meetingId, status, createdAt',
      minutes: 'id, meetingId, createdAt',
      exports: 'id, meetingId, createdAt',
      syncQueue: 'id, meetingId, status, attempts, createdAt',
    });

    // Batch 06: kolom antrian transkripsi per chunk. Skema indeks tidak berubah;
    // baris lama di-backfill agar statusnya jujur (PENDING, belum pernah dicoba).
    this.version(2)
      .stores({
        meetings: 'id, date, status, createdAt, updatedAt',
        audioChunks: 'id, meetingId, sequence, [meetingId+sequence], createdAt',
        speakers: 'id, meetingId, [meetingId+code], createdAt',
        transcriptSegments: 'id, meetingId, sequence, [meetingId+sequence], startTime',
        bookmarks: 'id, meetingId, timestamp, [meetingId+timestamp]',
        summaries: 'id, meetingId, createdAt',
        decisions: 'id, meetingId, sourceTimestamp, [meetingId+sourceTimestamp]',
        actionItems: 'id, meetingId, status, createdAt',
        minutes: 'id, meetingId, createdAt',
        exports: 'id, meetingId, createdAt',
        syncQueue: 'id, meetingId, status, attempts, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('audioChunks')
          .toCollection()
          .modify((chunk: Partial<AudioChunk>) => {
            chunk.transcriptionStatus ??= 'PENDING';
            chunk.transcriptionAttempts ??= 0;
          });
      });
  }

  /** Seluruh tabel (untuk clearAll/migrasi). */
  allTables(): Array<Dexie.Table<unknown, string>> {
    return [
      this.meetings,
      this.audioChunks,
      this.speakers,
      this.transcriptSegments,
      this.bookmarks,
      this.summaries,
      this.decisions,
      this.actionItems,
      this.minutes,
      this.exports,
      this.syncQueue,
    ];
  }
}
