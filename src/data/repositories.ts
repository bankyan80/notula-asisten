/**
 * Repository abstraction — UI/module tidak pernah menyentuh storage langsung.
 * Implementasi: IndexedDB/Dexie (Batch 03), SQLite Android (Batch 14+),
 * opsional cloud mirror (Batch 12).
 */
import type {
  ActionItem,
  AudioChunk,
  Bookmark,
  Decision,
  ExportFile,
  Meeting,
  MeetingStatus,
  Minutes,
  Speaker,
  StorageMode,
  Summary,
  SyncQueueItem,
  TranscriptSegment,
} from '../core/types/entities';

export interface ListOptions {
  limit?: number;
  status?: MeetingStatus;
}

export interface CreateMeetingInput {
  title: string;
  date: string;
  location?: string;
  description?: string;
  participants?: string[];
  language?: string;
  minutesTemplateId?: string;
  storageMode?: StorageMode;
}

export interface MeetingRepository {
  create(input: CreateMeetingInput): Promise<Meeting>;
  getById(id: string): Promise<Meeting | null>;
  list(options?: ListOptions): Promise<Meeting[]>;
  update(id: string, patch: Partial<Meeting>): Promise<Meeting>;
  /** Menghapus meeting beserta data turunannya (audio, transkrip, AI, export). */
  delete(id: string): Promise<void>;
}

export interface AudioChunkRepository {
  add(chunk: AudioChunk): Promise<AudioChunk>;
  getById(id: string): Promise<AudioChunk | null>;
  listByMeeting(meetingId: string): Promise<AudioChunk[]>;
  /**
   * Chunk yang BELUM selesai ditranskripsi (PENDING/FAILED/PROCESSING basi),
   * diurutkan kronologis — dipakai antrian transkripsi offline (Batch 06).
   */
  listPendingTranscription(): Promise<AudioChunk[]>;
  update(id: string, patch: Partial<AudioChunk>): Promise<AudioChunk>;
  /** Hapus SATU chunk (dipakai recovery saat file-nya hilang). */
  delete(id: string): Promise<void>;
  deleteByMeeting(meetingId: string): Promise<void>;
}

export interface SpeakerRepository {
  add(speaker: Speaker): Promise<Speaker>;
  listByMeeting(meetingId: string): Promise<Speaker[]>;
  rename(speakerId: string, displayName: string): Promise<Speaker>;
  upsertMany(speakers: Speaker[]): Promise<Speaker[]>;
  deleteByMeeting(meetingId: string): Promise<void>;
}

export interface TranscriptRepository {
  addSegments(segments: TranscriptSegment[]): Promise<TranscriptSegment[]>;
  listByMeeting(meetingId: string): Promise<TranscriptSegment[]>;
  updateSegment(
    segmentId: string,
    patch: Partial<Pick<TranscriptSegment, 'text' | 'speakerId' | 'startTime' | 'endTime'>>,
  ): Promise<TranscriptSegment>;
  deleteSegment(segmentId: string): Promise<void>;
  deleteByMeeting(meetingId: string): Promise<void>;
}

export interface BookmarkRepository {
  add(bookmark: Bookmark): Promise<Bookmark>;
  listByMeeting(meetingId: string): Promise<Bookmark[]>;
  remove(bookmarkId: string): Promise<void>;
  deleteByMeeting(meetingId: string): Promise<void>;
}

export interface SummaryRepository {
  get(meetingId: string): Promise<Summary | null>;
  save(summary: Summary): Promise<Summary>;
  delete(meetingId: string): Promise<void>;
}

export interface DecisionRepository {
  listByMeeting(meetingId: string): Promise<Decision[]>;
  replaceForMeeting(meetingId: string, decisions: Decision[]): Promise<Decision[]>;
  deleteByMeeting(meetingId: string): Promise<void>;
}

export interface ActionItemRepository {
  listByMeeting(meetingId: string): Promise<ActionItem[]>;
  replaceForMeeting(meetingId: string, items: ActionItem[]): Promise<ActionItem[]>;
  updateStatus(itemId: string, status: ActionItem['status']): Promise<ActionItem>;
  deleteByMeeting(meetingId: string): Promise<void>;
}

export interface MinutesRepository {
  get(meetingId: string): Promise<Minutes | null>;
  save(minutes: Minutes): Promise<Minutes>;
  delete(meetingId: string): Promise<void>;
}

export interface ExportRepository {
  add(file: ExportFile): Promise<ExportFile>;
  listByMeeting(meetingId: string): Promise<ExportFile[]>;
  remove(fileId: string): Promise<void>;
  deleteByMeeting(meetingId: string): Promise<void>;
}

/**
 * Antrean sinkronisasi cloud (opsional).
 * Retry harus idempotent: mengulang item yang sudah SUCCESS tidak boleh menggandakan data.
 */
export interface SyncQueueRepository {
  enqueue(item: SyncQueueItem): Promise<SyncQueueItem>;
  /** SEMUA item antrean (untuk statistik & layar status sinkronisasi). */
  listAll(): Promise<SyncQueueItem[]>;
  listByMeeting(meetingId: string): Promise<SyncQueueItem[]>;
  listPending(limit?: number): Promise<SyncQueueItem[]>;
  markUploading(itemId: string): Promise<SyncQueueItem>;
  markSuccess(itemId: string): Promise<SyncQueueItem>;
  markFailed(itemId: string, error: string): Promise<SyncQueueItem>;
  retryFailed(meetingId?: string): Promise<SyncQueueItem[]>;
  clearMeeting(meetingId: string): Promise<void>;
}

/** Tempat seluruh repository di-register — dipakai oleh dependency graph aplikasi. */
export interface Repositories {
  meetings: MeetingRepository;
  audioChunks: AudioChunkRepository;
  speakers: SpeakerRepository;
  transcript: TranscriptRepository;
  bookmarks: BookmarkRepository;
  summaries: SummaryRepository;
  decisions: DecisionRepository;
  actionItems: ActionItemRepository;
  minutes: MinutesRepository;
  exports: ExportRepository;
  syncQueue: SyncQueueRepository;
}
