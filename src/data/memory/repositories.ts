/**
 * Implementasi repository IN-MEMORY (Batch 02) — kini menjadi REFERENSI PERILAKU
 * dan backend test ringan; produksi memakai Dexie (`src/data/dexie/`) yang
 * dipilih di `src/data/index.ts` tanpa mengubah UI sama sekali.
 */
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
  SyncStatus,
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

function requireFound<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} tidak ditemukan`);
  return value;
}

function createMeetingRepository(
  store: Map<string, Meeting>,
  onDeleted: (meetingId: string) => void,
  creationOrder: Map<string, number>,
): MeetingRepository {
  let sequence = 0;
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
      store.set(meeting.id, meeting);
      creationOrder.set(meeting.id, sequence++);
      return meeting;
    },
    async getById(id) {
      return store.get(id) ?? null;
    },
    async list(options: ListOptions = {}) {
      // Terbaru dulu; createdAt sama (milidetik sama) → urutan pembuatan menang.
      let meetings = [...store.values()].sort((a, b) => {
        const byCreatedAt = b.createdAt.localeCompare(a.createdAt);
        if (byCreatedAt !== 0) return byCreatedAt;
        return (creationOrder.get(b.id) ?? 0) - (creationOrder.get(a.id) ?? 0);
      });
      if (options.status) meetings = meetings.filter((m) => m.status === options.status);
      if (options.limit !== undefined) meetings = meetings.slice(0, options.limit);
      return meetings;
    },
    async update(id, patch) {
      const existing = requireFound(store.get(id), `Meeting ${id}`);
      const updated: Meeting = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      };
      store.set(id, updated);
      return updated;
    },
    async delete(id) {
      store.delete(id);
      // Cascade: hapus seluruh data turunan rapat (Batch 03 juga menghapus file lokal).
      onDeleted(id);
    },
  };
}

function createAudioChunkRepository(store: Map<string, AudioChunk>): AudioChunkRepository {
  return {
    async add(chunk) {
      store.set(chunk.id, chunk);
      return chunk;
    },
    async getById(id) {
      return store.get(id) ?? null;
    },
    async listByMeeting(meetingId) {
      return [...store.values()]
        .filter((chunk) => chunk.meetingId === meetingId)
        .sort((a, b) => a.sequence - b.sequence);
    },
    async listPendingTranscription() {
      return [...store.values()]
        .filter((chunk) => chunk.transcriptionStatus !== 'DONE')
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) ||
            a.meetingId.localeCompare(b.meetingId) ||
            a.sequence - b.sequence,
        );
    },
    async update(id, patch) {
      const existing = requireFound(store.get(id), `Audio chunk ${id}`);
      const updated = { ...existing, ...patch, id: existing.id };
      store.set(id, updated);
      return updated;
    },
    async delete(id) {
      if (!store.delete(id)) throw new Error(`Audio chunk ${id} tidak ditemukan`);
    },
    async deleteByMeeting(meetingId) {
      for (const [id, chunk] of store) {
        if (chunk.meetingId === meetingId) store.delete(id);
      }
    },
  };
}

function createSpeakerRepository(store: Map<string, Speaker>): SpeakerRepository {
  return {
    async add(speaker) {
      store.set(speaker.id, speaker);
      return speaker;
    },
    async listByMeeting(meetingId) {
      return [...store.values()]
        .filter((speaker) => speaker.meetingId === meetingId)
        .sort((a, b) => a.code.localeCompare(b.code));
    },
    async rename(speakerId, displayName) {
      const existing = requireFound(store.get(speakerId), `Speaker ${speakerId}`);
      const updated: Speaker = { ...existing, displayName, updatedAt: nowIso() };
      store.set(speakerId, updated);
      return updated;
    },
    async upsertMany(speakers) {
      for (const speaker of speakers) store.set(speaker.id, speaker);
      return speakers;
    },
    async deleteByMeeting(meetingId) {
      for (const [id, speaker] of store) {
        if (speaker.meetingId === meetingId) store.delete(id);
      }
    },
  };
}

function createTranscriptRepository(store: Map<string, TranscriptSegment>): TranscriptRepository {
  return {
    async addSegments(segments) {
      for (const segment of segments) store.set(segment.id, segment);
      return segments;
    },
    async listByMeeting(meetingId) {
      return [...store.values()]
        .filter((segment) => segment.meetingId === meetingId)
        .sort((a, b) => a.sequence - b.sequence || a.startTime - b.startTime);
    },
    async updateSegment(segmentId, patch) {
      const existing = requireFound(store.get(segmentId), `Segmen ${segmentId}`);
      const updated: TranscriptSegment = { ...existing, ...patch, editedAt: nowIso() };
      store.set(segmentId, updated);
      return updated;
    },
    async deleteSegment(segmentId) {
      if (!store.delete(segmentId)) throw new Error(`Segmen ${segmentId} tidak ditemukan`);
    },
    async deleteByMeeting(meetingId) {
      for (const [id, segment] of store) {
        if (segment.meetingId === meetingId) store.delete(id);
      }
    },
  };
}

function createBookmarkRepository(store: Map<string, Bookmark>): BookmarkRepository {
  return {
    async add(bookmark) {
      store.set(bookmark.id, bookmark);
      return bookmark;
    },
    async listByMeeting(meetingId) {
      return [...store.values()]
        .filter((bookmark) => bookmark.meetingId === meetingId)
        .sort((a, b) => a.timestamp - b.timestamp);
    },
    async remove(bookmarkId) {
      store.delete(bookmarkId);
    },
    async deleteByMeeting(meetingId) {
      for (const [id, bookmark] of store) {
        if (bookmark.meetingId === meetingId) store.delete(id);
      }
    },
  };
}

function createSummaryRepository(store: Map<string, Summary>): SummaryRepository {
  return {
    async get(meetingId) {
      return store.get(meetingId) ?? null;
    },
    async save(summary) {
      store.set(summary.meetingId, summary);
      return summary;
    },
    async delete(meetingId) {
      store.delete(meetingId);
    },
  };
}

function createDecisionRepository(store: Map<string, Decision>): DecisionRepository {
  return {
    async listByMeeting(meetingId) {
      return [...store.values()]
        .filter((decision) => decision.meetingId === meetingId)
        .sort((a, b) => a.sourceTimestamp - b.sourceTimestamp);
    },
    async replaceForMeeting(meetingId, decisions) {
      for (const [id, decision] of store) {
        if (decision.meetingId === meetingId) store.delete(id);
      }
      for (const decision of decisions) store.set(decision.id, decision);
      return decisions;
    },
    async deleteByMeeting(meetingId) {
      for (const [id, decision] of store) {
        if (decision.meetingId === meetingId) store.delete(id);
      }
    },
  };
}

function createActionItemRepository(store: Map<string, ActionItem>): ActionItemRepository {
  return {
    async listByMeeting(meetingId) {
      return [...store.values()]
        .filter((item) => item.meetingId === meetingId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async replaceForMeeting(meetingId, items) {
      for (const [id, item] of store) {
        if (item.meetingId === meetingId) store.delete(id);
      }
      for (const item of items) store.set(item.id, item);
      return items;
    },
    async updateStatus(itemId, status) {
      const existing = requireFound(store.get(itemId), `Action item ${itemId}`);
      const updated: ActionItem = { ...existing, status, updatedAt: nowIso() };
      store.set(itemId, updated);
      return updated;
    },
    async deleteByMeeting(meetingId) {
      for (const [id, item] of store) {
        if (item.meetingId === meetingId) store.delete(id);
      }
    },
  };
}

function createMinutesRepository(store: Map<string, Minutes>): MinutesRepository {
  return {
    async get(meetingId) {
      return store.get(meetingId) ?? null;
    },
    async save(minutes) {
      store.set(minutes.meetingId, minutes);
      return minutes;
    },
    async delete(meetingId) {
      store.delete(meetingId);
    },
  };
}

function createExportRepository(store: Map<string, ExportFile>): ExportRepository {
  return {
    async add(file) {
      store.set(file.id, file);
      return file;
    },
    async listByMeeting(meetingId) {
      return [...store.values()]
        .filter((file) => file.meetingId === meetingId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async remove(fileId) {
      store.delete(fileId);
    },
    async deleteByMeeting(meetingId) {
      for (const [id, file] of store) {
        if (file.meetingId === meetingId) store.delete(id);
      }
    },
  };
}

/**
 * Status siklus: PENDING → UPLOADING → SUCCESS
 *                          ↘ FAILED → (retryFailed) → RETRY → UPLOADING → ...
 * `listPending` mengambil PENDING dan RETRY agar retry idempotent.
 */
function createSyncQueueRepository(store: Map<string, SyncQueueItem>): SyncQueueRepository {
  const update = (item: SyncQueueItem, patch: Partial<SyncQueueItem>): SyncQueueItem => {
    const updated: SyncQueueItem = { ...item, ...patch, id: item.id, updatedAt: nowIso() };
    store.set(updated.id, updated);
    return updated;
  };

  return {
    async enqueue(item) {
      store.set(item.id, item);
      return item;
    },
    async listAll() {
      return [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async listByMeeting(meetingId) {
      return [...store.values()]
        .filter((item) => item.meetingId === meetingId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async listPending(limit = 50) {
      return [...store.values()]
        .filter((item) => item.status === 'PENDING' || item.status === 'RETRY')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit);
    },
    async markUploading(itemId) {
      return update(requireFound(store.get(itemId), `Sync item ${itemId}`), {
        status: 'UPLOADING',
      });
    },
    async markSuccess(itemId) {
      return update(requireFound(store.get(itemId), `Sync item ${itemId}`), {
        status: 'SUCCESS',
        lastError: undefined,
      });
    },
    async markFailed(itemId, error) {
      const existing = requireFound(store.get(itemId), `Sync item ${itemId}`);
      return update(existing, {
        status: 'FAILED',
        attempts: existing.attempts + 1,
        lastError: error,
      });
    },
    async retryFailed(meetingId) {
      const failed = [...store.values()].filter(
        (item) => item.status === 'FAILED' && (!meetingId || item.meetingId === meetingId),
      );
      return failed.map((item) => update(item, { status: 'RETRY' satisfies SyncStatus }));
    },
    async clearMeeting(meetingId) {
      for (const [id, item] of store) {
        if (item.meetingId === meetingId) store.delete(id);
      }
    },
  };
}

export interface MemoryDatabase {
  repositories: Repositories;
  /** Kosongkan seluruh data (untuk test). */
  clear(): void;
}

export function createMemoryRepositories(): MemoryDatabase {
  const stores = {
    meetings: new Map<string, Meeting>(),
    audioChunks: new Map<string, AudioChunk>(),
    speakers: new Map<string, Speaker>(),
    segments: new Map<string, TranscriptSegment>(),
    bookmarks: new Map<string, Bookmark>(),
    summaries: new Map<string, Summary>(),
    decisions: new Map<string, Decision>(),
    actionItems: new Map<string, ActionItem>(),
    minutes: new Map<string, Minutes>(),
    exports: new Map<string, ExportFile>(),
    syncQueue: new Map<string, SyncQueueItem>(),
  };

  const creationOrder = new Map<string, number>();

  const cascadeDelete = (meetingId: string): void => {
    const removeChildren = <T extends { meetingId: string }>(map: Map<string, T>): void => {
      for (const [id, item] of map) {
        if (item.meetingId === meetingId) map.delete(id);
      }
    };
    removeChildren(stores.audioChunks);
    removeChildren(stores.speakers);
    removeChildren(stores.segments);
    removeChildren(stores.bookmarks);
    removeChildren(stores.decisions);
    removeChildren(stores.actionItems);
    removeChildren(stores.exports);
    removeChildren(stores.syncQueue);
    stores.summaries.delete(meetingId);
    stores.minutes.delete(meetingId);
    creationOrder.delete(meetingId);
  };

  const repositories: Repositories = {
    meetings: createMeetingRepository(stores.meetings, cascadeDelete, creationOrder),
    audioChunks: createAudioChunkRepository(stores.audioChunks),
    speakers: createSpeakerRepository(stores.speakers),
    transcript: createTranscriptRepository(stores.segments),
    bookmarks: createBookmarkRepository(stores.bookmarks),
    summaries: createSummaryRepository(stores.summaries),
    decisions: createDecisionRepository(stores.decisions),
    actionItems: createActionItemRepository(stores.actionItems),
    minutes: createMinutesRepository(stores.minutes),
    exports: createExportRepository(stores.exports),
    syncQueue: createSyncQueueRepository(stores.syncQueue),
  };

  return {
    repositories,
    clear() {
      for (const store of Object.values(stores)) store.clear();
      creationOrder.clear();
    },
  };
}
