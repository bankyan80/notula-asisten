/**
 * Implementasi repository di atas IndexedDB/Dexie — backend PRODUKSI Batch 03.
 *
 * Meniru kontrak & perilaku `memory/repositories.ts` (termasuk pesan error)
 * sehingga UI tidak membedakan backend. Data survive reload; penulisan per
 * operasi memakai transaksi saat menyentuh lebih dari satu tabel.
 */
import type {
  ActionItem,
  Meeting,
  Speaker,
  SyncQueueItem,
  TranscriptSegment,
} from '../../core/types/entities';
import { createId } from '../../core/utils/id';
import { nowIso } from '../../core/utils/time';
import type {
  ActionItemRepository,
  AudioChunkRepository,
  BookmarkRepository,
  DecisionRepository,
  ExportRepository,
  ListOptions,
  MeetingRepository,
  MinutesRepository,
  Repositories,
  SpeakerRepository,
  SummaryRepository,
  SyncQueueRepository,
  TranscriptRepository,
} from '../repositories';
import type { NotulaDatabase } from './db';

function requireFound<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} tidak ditemukan`);
  return value;
}

/** Rapat terbaru dulu; createdAt sama (milidetik sama) → urutan indeks (id) menang. */
function byCreatedAtDesc<T extends { createdAt: string; id: string }>(items: T[]): T[] {
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function createMeetingRepository(db: NotulaDatabase): MeetingRepository {
  return {
    async create(input) {
      const timestamp = nowIso();
      const meeting: Meeting = {
        id: createId(),
        title: input.title,
        date: input.date,
        ...(input.location ? { location: input.location } : {}),
        ...(input.description ? { description: input.description } : {}),
        participants: input.participants ?? [],
        language: input.language ?? 'id',
        ...(input.minutesTemplateId ? { minutesTemplateId: input.minutesTemplateId } : {}),
        durationSeconds: 0,
        status: 'DRAFT',
        storageMode: input.storageMode ?? 'device',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.meetings.put(meeting);
      return meeting;
    },
    async getById(id) {
      return (await db.meetings.get(id)) ?? null;
    },
    async list(options: ListOptions = {}) {
      let meetings = byCreatedAtDesc(await db.meetings.orderBy('createdAt').reverse().toArray());
      if (options.status) meetings = meetings.filter((m) => m.status === options.status);
      if (options.limit !== undefined) meetings = meetings.slice(0, options.limit);
      return meetings;
    },
    async update(id, patch) {
      const existing = requireFound(await db.meetings.get(id), `Meeting ${id}`);
      const updated: Meeting = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      };
      await db.meetings.put(updated);
      return updated;
    },
    async delete(id) {
      await db.transaction(
        'rw',
        [
          db.meetings,
          db.audioChunks,
          db.speakers,
          db.transcriptSegments,
          db.bookmarks,
          db.summaries,
          db.decisions,
          db.actionItems,
          db.minutes,
          db.exports,
          db.syncQueue,
        ],
        async () => {
          await db.meetings.delete(id);
          await db.audioChunks.where('meetingId').equals(id).delete();
          await db.speakers.where('meetingId').equals(id).delete();
          await db.transcriptSegments.where('meetingId').equals(id).delete();
          await db.bookmarks.where('meetingId').equals(id).delete();
          await db.summaries.where('meetingId').equals(id).delete();
          await db.decisions.where('meetingId').equals(id).delete();
          await db.actionItems.where('meetingId').equals(id).delete();
          await db.minutes.where('meetingId').equals(id).delete();
          await db.exports.where('meetingId').equals(id).delete();
          await db.syncQueue.where('meetingId').equals(id).delete();
        },
      );
    },
  };
}

function createAudioChunkRepository(db: NotulaDatabase): AudioChunkRepository {
  return {
    async add(chunk) {
      await db.audioChunks.put(chunk);
      return chunk;
    },
    async getById(id) {
      return (await db.audioChunks.get(id)) ?? null;
    },
    async listByMeeting(meetingId) {
      const chunks = await db.audioChunks.where('meetingId').equals(meetingId).toArray();
      return chunks.sort((a, b) => a.sequence - b.sequence);
    },
    async listPendingTranscription() {
      // Tanpa indeks: filter penuh aman untuk skala rapat lokal (± ratusan chunk).
      const chunks = await db.audioChunks
        .filter((chunk) => chunk.transcriptionStatus !== 'DONE')
        .toArray();
      return chunks.sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.meetingId.localeCompare(b.meetingId) ||
          a.sequence - b.sequence,
      );
    },
    async update(id, patch) {
      const existing = requireFound(await db.audioChunks.get(id), `Audio chunk ${id}`);
      const updated = { ...existing, ...patch, id: existing.id };
      await db.audioChunks.put(updated);
      return updated;
    },
    async delete(id) {
      const existing = await db.audioChunks.get(id);
      if (!existing) throw new Error(`Audio chunk ${id} tidak ditemukan`);
      await db.audioChunks.delete(id);
    },
    async deleteByMeeting(meetingId) {
      await db.audioChunks.where('meetingId').equals(meetingId).delete();
    },
  };
}

function createSpeakerRepository(db: NotulaDatabase): SpeakerRepository {
  return {
    async add(speaker) {
      await db.speakers.put(speaker);
      return speaker;
    },
    async listByMeeting(meetingId) {
      const speakers = await db.speakers.where('meetingId').equals(meetingId).toArray();
      return speakers.sort((a, b) => a.code.localeCompare(b.code));
    },
    async rename(speakerId, displayName) {
      const existing = requireFound(await db.speakers.get(speakerId), `Speaker ${speakerId}`);
      const updated: Speaker = { ...existing, displayName, updatedAt: nowIso() };
      await db.speakers.put(updated);
      return updated;
    },
    async upsertMany(speakers) {
      await db.speakers.bulkPut(speakers);
      return speakers;
    },
    async deleteByMeeting(meetingId) {
      await db.speakers.where('meetingId').equals(meetingId).delete();
    },
  };
}

function createTranscriptRepository(db: NotulaDatabase): TranscriptRepository {
  return {
    async addSegments(segments) {
      await db.transcriptSegments.bulkPut(segments);
      return segments;
    },
    async listByMeeting(meetingId) {
      const segments = await db.transcriptSegments.where('meetingId').equals(meetingId).toArray();
      return segments.sort((a, b) => a.sequence - b.sequence || a.startTime - b.startTime);
    },
    async updateSegment(segmentId, patch) {
      const existing = requireFound(
        await db.transcriptSegments.get(segmentId),
        `Segmen ${segmentId}`,
      );
      const updated: TranscriptSegment = { ...existing, ...patch, editedAt: nowIso() };
      await db.transcriptSegments.put(updated);
      return updated;
    },
    async deleteSegment(segmentId) {
      const existing = await db.transcriptSegments.get(segmentId);
      if (existing === undefined) {
        throw new Error(`Segmen ${segmentId} tidak ditemukan`);
      }
      await db.transcriptSegments.delete(segmentId);
    },
    async deleteByMeeting(meetingId) {
      await db.transcriptSegments.where('meetingId').equals(meetingId).delete();
    },
  };
}

function createBookmarkRepository(db: NotulaDatabase): BookmarkRepository {
  return {
    async add(bookmark) {
      await db.bookmarks.put(bookmark);
      return bookmark;
    },
    async listByMeeting(meetingId) {
      const bookmarks = await db.bookmarks.where('meetingId').equals(meetingId).toArray();
      return bookmarks.sort((a, b) => a.timestamp - b.timestamp);
    },
    async remove(bookmarkId) {
      await db.bookmarks.delete(bookmarkId);
    },
    async deleteByMeeting(meetingId) {
      await db.bookmarks.where('meetingId').equals(meetingId).delete();
    },
  };
}

/** Summary & Minutes disimpan SATU per rapat (key ikut meetingId). */
function createSummaryRepository(db: NotulaDatabase): SummaryRepository {
  return {
    async get(meetingId) {
      return (await db.summaries.where('meetingId').equals(meetingId).first()) ?? null;
    },
    async save(summary) {
      await db.transaction('rw', db.summaries, async () => {
        const existing = await db.summaries.where('meetingId').equals(summary.meetingId).first();
        if (existing && existing.id !== summary.id) await db.summaries.delete(existing.id);
        await db.summaries.put(summary);
      });
      return summary;
    },
    async delete(meetingId) {
      await db.summaries.where('meetingId').equals(meetingId).delete();
    },
  };
}

function createDecisionRepository(db: NotulaDatabase): DecisionRepository {
  return {
    async listByMeeting(meetingId) {
      const decisions = await db.decisions.where('meetingId').equals(meetingId).toArray();
      return decisions.sort((a, b) => a.sourceTimestamp - b.sourceTimestamp);
    },
    async replaceForMeeting(meetingId, decisions) {
      await db.transaction('rw', db.decisions, async () => {
        await db.decisions.where('meetingId').equals(meetingId).delete();
        await db.decisions.bulkPut(decisions);
      });
      return decisions;
    },
    async deleteByMeeting(meetingId) {
      await db.decisions.where('meetingId').equals(meetingId).delete();
    },
  };
}

function createActionItemRepository(db: NotulaDatabase): ActionItemRepository {
  return {
    async listByMeeting(meetingId) {
      const items = await db.actionItems.where('meetingId').equals(meetingId).toArray();
      return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async replaceForMeeting(meetingId, items) {
      await db.transaction('rw', db.actionItems, async () => {
        await db.actionItems.where('meetingId').equals(meetingId).delete();
        await db.actionItems.bulkPut(items);
      });
      return items;
    },
    async updateStatus(itemId, status) {
      const existing = requireFound(await db.actionItems.get(itemId), `Action item ${itemId}`);
      const updated: ActionItem = { ...existing, status, updatedAt: nowIso() };
      await db.actionItems.put(updated);
      return updated;
    },
    async deleteByMeeting(meetingId) {
      await db.actionItems.where('meetingId').equals(meetingId).delete();
    },
  };
}

function createMinutesRepository(db: NotulaDatabase): MinutesRepository {
  return {
    async get(meetingId) {
      return (await db.minutes.where('meetingId').equals(meetingId).first()) ?? null;
    },
    async save(minutes) {
      await db.transaction('rw', db.minutes, async () => {
        const existing = await db.minutes.where('meetingId').equals(minutes.meetingId).first();
        if (existing && existing.id !== minutes.id) await db.minutes.delete(existing.id);
        await db.minutes.put(minutes);
      });
      return minutes;
    },
    async delete(meetingId) {
      await db.minutes.where('meetingId').equals(meetingId).delete();
    },
  };
}

function createExportRepository(db: NotulaDatabase): ExportRepository {
  return {
    async add(file) {
      await db.exports.put(file);
      return file;
    },
    async listByMeeting(meetingId) {
      const files = await db.exports.where('meetingId').equals(meetingId).toArray();
      return byCreatedAtDesc(files);
    },
    async remove(fileId) {
      await db.exports.delete(fileId);
    },
    async deleteByMeeting(meetingId) {
      await db.exports.where('meetingId').equals(meetingId).delete();
    },
  };
}

/**
 * Status siklus: PENDING → UPLOADING → SUCCESS
 *                          ↘ FAILED → (retryFailed) → RETRY → UPLOADING → ...
 * `listPending` mengambil PENDING dan RETRY agar retry idempotent.
 */
function createSyncQueueRepository(db: NotulaDatabase): SyncQueueRepository {
  const update = async (
    itemId: string,
    patch: Partial<SyncQueueItem>,
    label: string,
  ): Promise<SyncQueueItem> => {
    const existing = requireFound(await db.syncQueue.get(itemId), label);
    const updated: SyncQueueItem = { ...existing, ...patch, id: existing.id, updatedAt: nowIso() };
    await db.syncQueue.put(updated);
    return updated;
  };

  return {
    async enqueue(item) {
      await db.syncQueue.put(item);
      return item;
    },
    async listAll() {
      const items = await db.syncQueue.toArray();
      return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async listByMeeting(meetingId) {
      const items = await db.syncQueue.where('meetingId').equals(meetingId).toArray();
      return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async listPending(limit = 50) {
      const items = await db.syncQueue
        .filter((item) => item.status === 'PENDING' || item.status === 'RETRY')
        .toArray();
      return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, limit);
    },
    async markUploading(itemId) {
      return update(itemId, { status: 'UPLOADING' }, `Sync item ${itemId}`);
    },
    async markSuccess(itemId) {
      return update(itemId, { status: 'SUCCESS', lastError: undefined }, `Sync item ${itemId}`);
    },
    async markFailed(itemId, error) {
      const existing = requireFound(await db.syncQueue.get(itemId), `Sync item ${itemId}`);
      return update(
        itemId,
        { status: 'FAILED', attempts: existing.attempts + 1, lastError: error },
        `Sync item ${itemId}`,
      );
    },
    async retryFailed(meetingId) {
      const failed = await db.syncQueue
        .filter(
          (item) =>
            item.status === 'FAILED' && (meetingId === undefined || item.meetingId === meetingId),
        )
        .toArray();
      const results: SyncQueueItem[] = [];
      for (const item of failed) {
        results.push(await update(item.id, { status: 'RETRY' }, `Sync item ${item.id}`));
      }
      return results;
    },
    async clearMeeting(meetingId) {
      await db.syncQueue.where('meetingId').equals(meetingId).delete();
    },
  };
}

export function createDexieRepositories(db: NotulaDatabase): Repositories {
  return {
    meetings: createMeetingRepository(db),
    audioChunks: createAudioChunkRepository(db),
    speakers: createSpeakerRepository(db),
    transcript: createTranscriptRepository(db),
    bookmarks: createBookmarkRepository(db),
    summaries: createSummaryRepository(db),
    decisions: createDecisionRepository(db),
    actionItems: createActionItemRepository(db),
    minutes: createMinutesRepository(db),
    exports: createExportRepository(db),
    syncQueue: createSyncQueueRepository(db),
  };
}
