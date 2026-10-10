/**
 * Entity model — sumber kebenaran data lokal (local-first).
 * Skema ini dipetakan ke IndexedDB (Batch 03) dan SQLite Android (Batch 14+).
 * Setiap perubahan struktur WAJIB disertai migration, bukan ad-hoc patch.
 */

/**
 * Status pipeline pemrosesan rapat (PRD: RECORDING → SAVING_AUDIO →
 * TRANSCRIPTION_PENDING → TRANSCRIBING → TRANSCRIPT_READY → SUMMARIZING →
 * GENERATING_MINUTES → COMPLETED, atau PROCESSING_ERROR bila gagal).
 *
 * `PROCESSING` dan `ERROR` adalah nama LAMA yang tetap ada agar data di
 * IndexedDB pengguna lama tetap terbaca; pipeline baru tidak lagi menulisnya.
 */
export type MeetingStatus =
  | 'DRAFT'
  | 'RECORDING'
  | 'SAVING_AUDIO'
  | 'TRANSCRIPTION_PENDING'
  | 'TRANSCRIBING'
  | 'TRANSCRIPT_READY'
  | 'SUMMARIZING'
  | 'GENERATING_MINUTES'
  | 'COMPLETED'
  | 'PROCESSING_ERROR'
  | 'PROCESSING'
  | 'ERROR'
  | 'ARCHIVED';

export type StorageMode = 'device' | 'device_cloud';

export type SyncStatus = 'PENDING' | 'UPLOADING' | 'SUCCESS' | 'FAILED' | 'RETRY';

/**
 * Status transkripsi SATU chunk (antrian offline Batch 06).
 * FAILED tetap bisa dicoba ulang selama `transcriptionAttempts` belum maksimal;
 * PROCESSING yang tertinggal (aplikasi crash di tengah) dipulihkan antrian berikutnya.
 */
export type TranscriptionStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export type ExportFormat = 'PDF' | 'DOCX' | 'TXT' | 'XLSX' | 'CSV';

export type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export type BookmarkKind = 'IMPORTANT' | 'DECISION' | 'ACTION' | 'QUESTION' | 'NOTE';

export interface User {
  id: string;
  name: string;
  email?: string;
  photo?: string;
  createdAt: string;
}

export interface Meeting {
  id: string;
  userId?: string;
  title: string;
  /** ISO date (yyyy-MM-dd) */
  date: string;
  /** ISO date-time mulai rapat */
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  participants: string[];
  language: string;
  minutesTemplateId?: string;
  durationSeconds: number;
  status: MeetingStatus;
  /**
   * Jumlah kegagalan BERTURUT-TURUT pipeline otomatis pada tahap yang sedang
   * berjalan. Disetel ulang setiap kali tahap berganti atau berhasil, sehingga
   * retry terbatas (batas di `modules/pipeline/pipelineStatus.ts`) dan pekerjaan
   * yang sudah sukses tidak diulang.
   */
  pipelineAttempts?: number;
  /** Pesan kegagalan pipeline terakhir (transkripsi / AI) untuk ditampilkan UI. */
  pipelineError?: string;
  storageMode: StorageMode;
  createdAt: string;
  updatedAt: string;
}

export interface AudioChunk {
  id: string;
  meetingId: string;
  /** Urutan mulai dari 1: 000001.m4a, 000002.m4a, ... */
  sequence: number;
  /** Path relatif di dalam folder rapat, contoh: Meetings/{id}/audio/000001.m4a */
  localPath: string;
  /** Posisi awal chunk pada timeline meeting (detik) */
  startTime: number;
  /** Posisi akhir chunk pada timeline meeting (detik) */
  endTime: number;
  durationSeconds: number;
  byteSize?: number;
  mimeType: string;
  uploadStatus: SyncStatus;
  /** Status antrian transkripsi chunk ini (Batch 06). */
  transcriptionStatus: TranscriptionStatus;
  /** Berapa kali percobaan transkripsi dijalankan (batas 3 di antrian). */
  transcriptionAttempts: number;
  /** Pesan kegagalan terakhir (bila `transcriptionStatus === 'FAILED'`). */
  transcriptionError?: string;
  /** ISO date-time transkripsi terakhir berhasil. */
  transcribedAt?: string;
  createdAt: string;
}

export interface Speaker {
  id: string;
  meetingId: string;
  /** Kode internal dari diarization, contoh: speaker_1 */
  code: string;
  /** Nama tampilan — default "Pembicara 1", dapat diedit pengguna */
  displayName: string;
  durationSeconds: number;
  segmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  id: string;
  meetingId: string;
  speakerId?: string;
  /** Posisi awal pada timeline meeting (detik) — BUKAN waktu request */
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  /** Urutan global segmen dalam rapat */
  sequence: number;
  editedAt?: string;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  meetingId: string;
  /** Posisi pada timeline meeting (detik) */
  timestamp: number;
  kind: BookmarkKind;
  note?: string;
  createdAt: string;
}

export interface Summary {
  id: string;
  meetingId: string;
  content: string;
  topics: string[];
  /** Hal yang belum diputuskan */
  undecided: string[];
  /** Segmen sumber agar hasil AI dapat ditelusuri (traceability) */
  sourceSegmentIds: string[];
  createdAt: string;
}

export interface Decision {
  id: string;
  meetingId: string;
  content: string;
  /** Timestamp sumber dalam rapat — wajib agar bisa diaudit ke audio */
  sourceTimestamp: number;
  sourceSegmentId?: string;
  createdAt: string;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  task: string;
  assignee?: string;
  deadline?: string;
  status: ActionItemStatus;
  sourceTimestamp?: number;
  sourceSegmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportFile {
  id: string;
  meetingId: string;
  format: ExportFormat;
  fileName: string;
  localPath: string;
  byteSize?: number;
  createdAt: string;
}

export type SyncEntityKind = 'meeting' | 'audio' | 'transcript' | 'summary' | 'export';

export interface SyncQueueItem {
  id: string;
  entityKind: SyncEntityKind;
  entityId: string;
  meetingId: string;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MinutesSection {
  key: string;
  title: string;
  lines: string[];
}

export interface Minutes {
  id: string;
  meetingId: string;
  templateId: string;
  sections: MinutesSection[];
  createdAt: string;
  updatedAt: string;
}
