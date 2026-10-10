/**
 * Kontrak provider — SEMUA integrasi eksternal melewati interface ini.
 * Implementasi dapat ditukar (local-dev / native / server) tanpa menyentuh UI.
 *
 * Aturan main:
 * - Tidak boleh ada mock data palsu. Provider yang belum tersedia harus
 *   gagal dengan AppError yang jujur, bukan mengarang hasil.
 * - Semua output AI wajib punya jejak ke transkrip (sourceTimestamp).
 */
import type {
  AudioChunk,
  ExportFormat,
  Meeting,
  Speaker,
  SyncEntityKind,
  TranscriptSegment,
} from './entities';

/* -------------------------------------------------------------------------- */
/* Recording                                                                  */
/* -------------------------------------------------------------------------- */

export type RecordingStatus =
  'idle' | 'requesting_permission' | 'recording' | 'paused' | 'stopping' | 'stopped' | 'error';

export interface RecordingStartOptions {
  meetingId: string;
  /** Bahasa transkripsi, contoh: 'id' */
  language: string;
  /** Durasi satu chunk dalam detik (default 300 = 5 menit) */
  chunkDurationSeconds?: number;
  /** MIME type audio yang diminta, contoh: 'audio/mp4' */
  mimeType?: string;
}

export interface RecordingState {
  meetingId: string | null;
  status: RecordingStatus;
  /** Durasi rekaman aktif pada timeline meeting (detik) */
  elapsedSeconds: number;
  /** Sequence chunk yang sedang direkam */
  currentSequence: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface RecordingChunkEvent {
  meetingId: string;
  sequence: number;
  /** Timeline meeting */
  startTime: number;
  endTime: number;
  blob: Blob;
  mimeType: string;
  /** Durasi per chunk yang dipilih saat start (info manifest/recovery) */
  chunkDurationSeconds: number;
}

export interface RecordingStopResult {
  meetingId: string;
  /** Jumlah chunk yang berhasil ditulis */
  chunkCount: number;
  totalDurationSeconds: number;
}

/**
 * Engine rekaman per platform.
 * - Web: MediaRecorder + timeslice (Batch 04)
 * - Android: native foreground service (Batch 14)
 * Lifecycle engine TERPISAH dari lifecycle UI.
 */
export interface RecordingEngine {
  readonly platform: 'web' | 'android' | 'unknown';
  isSupported(): boolean;
  start(options: RecordingStartOptions): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<RecordingStopResult>;
  getState(): RecordingState;
  /** Subscribe ke chunk yang sudah selesai ditulis. Returns unsubscribe. */
  onChunk(listener: (event: RecordingChunkEvent) => void): () => void;
  onStateChange(listener: (state: RecordingState) => void): () => void;
}

/* -------------------------------------------------------------------------- */
/* Speech to text                                                             */
/* -------------------------------------------------------------------------- */

export interface TranscribeRequest {
  chunk: AudioChunk;
  /** Pembaca blob — provider tidak boleh mengasumsikan path file tertentu */
  readAudio(): Promise<Blob>;
  language: string;
  /** Kamus istilah khusus (TKA, NISN, Dapodik, ...) untuk meningkatkan akurasi */
  dictionary?: string[];
  /**
   * Sequence global pertama untuk segmen hasil chunk ini (Batch 06, additive):
   * provider tidak mengakses repository, sehingga antrian memberi tahu angka
   * awal; provider mengisi `sequence = sequenceOffset + index`.
   */
  sequenceOffset?: number;
}

/**
 * Kontrak transkripsi.
 * Catatan: signature memakai TranscribeRequest (bukan hanya AudioChunk)
 * karena provider memerlukan byte audio + metadata bahasa/kamus.
 * Timestamp hasil dihitung RELATIF TERHADAP TIMELINE MEETING, bukan waktu request.
 */
export interface SpeechToTextProvider {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  transcribeChunk(request: TranscribeRequest): Promise<TranscriptSegment[]>;
}

/* -------------------------------------------------------------------------- */
/* Speaker diarization                                                        */
/* -------------------------------------------------------------------------- */

export interface SpeakerSegment {
  startTime: number;
  endTime: number;
  /** Kode pembicara (speaker_1, speaker_2, ...) — BUKAN identitas orang */
  speakerCode: string;
  confidence?: number;
}

export interface DiarizationRequest {
  chunk: AudioChunk;
  readAudio(): Promise<Blob>;
  language: string;
}

/**
 * Sistem TIDAK boleh mengklaim identitas seseorang hanya dari suara.
 * Output hanyalah pemisahan segmen; penamaan dilakukan manual oleh pengguna.
 */
export interface SpeakerDiarizationProvider {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  identifySegments(request: DiarizationRequest): Promise<SpeakerSegment[]>;
}

/* -------------------------------------------------------------------------- */
/* AI summarization                                                           */
/* -------------------------------------------------------------------------- */

export interface TraceableItem {
  content: string;
  /** Posisi sumber pada timeline rapat (detik) — wajib untuk audit */
  sourceTimestamp: number;
  sourceSegmentId?: string;
}

export interface ActionItemDraft {
  task: string;
  assignee?: string;
  deadline?: string;
  sourceTimestamp?: number;
  sourceSegmentId?: string;
}

export interface SummaryInput {
  meeting: Meeting;
  segments: TranscriptSegment[];
  speakers: Speaker[];
  language: string;
}

export interface AISummaryResult {
  summary: string;
  topics: string[];
  decisions: TraceableItem[];
  actionItems: ActionItemDraft[];
  questions: TraceableItem[];
  /** Hal yang belum diputuskan — jika tidak ada, diisi "Tidak disebutkan dalam rapat." */
  undecided: string[];
}

/**
 * Provider ringkasan AI.
 * Guard anti-hallucination: setiap keluaran penting wajib punya sourceTimestamp
 * yang ada di dalam transkrip. Jika informasi tidak ada → "Tidak disebutkan dalam rapat."
 */
export interface AISummarizationProvider {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  summarize(input: SummaryInput): Promise<AISummaryResult>;
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

export interface ExportRequest {
  meeting: Meeting;
  format: ExportFormat;
  content: string;
  /** Struktur tabular opsional (mis. daftar tugas untuk XLSX/CSV) */
  tables?: Array<{ name: string; rows: string[][] }>;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export interface ExportProvider {
  readonly id: string;
  supports(format: ExportFormat): boolean;
  export(request: ExportRequest): Promise<ExportResult>;
}

/* -------------------------------------------------------------------------- */
/* Cloud sync (opsional — PRD §10, §25)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Payload hasil VERIFIKASI data lokal (sudah dicek ada sebelum masuk antrean
 * & dicek ulang tepat sebelum upload — SAVE LOCAL → VERIFY → UPLOAD).
 */
export interface SyncPayload {
  kind: SyncEntityKind;
  meetingId: string;
  entityId: string;
  /** Data lokal yang sudah diverifikasi; bentuknya per `kind`. */
  data: unknown;
}

/** Bentuk payload `kind: 'audio'` — metadata chunk + blob file lokal. */
export interface AudioSyncData {
  chunk: AudioChunk;
  blob: Blob;
  /** Nama file unggahan, mis. `000001.m4a` */
  fileName: string;
}

/**
 * Upload satu item antrean. Provider yang belum dikonfigurasi wajib jujur
 * (`isAvailable() === false` / lempar `PROVIDER_UNAVAILABLE`) — tidak boleh
 * menandai sukses tanpa benar-benar mengunggah.
 */
export interface SyncProvider {
  readonly id: string;
  isAvailable(): boolean;
  upload(payload: SyncPayload): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Local file storage                                                         */
/* -------------------------------------------------------------------------- */

export interface StorageEstimateInfo {
  freeBytes?: number;
  usedBytes?: number;
  quotaBytes?: number;
  /** true bila nilai berasal dari estimasi, bukan pengukuran pasti */
  isEstimated: boolean;
}

/**
 * Akses file lokal rapat (audio, transkrip, export).
 * Urutan selalu: SAVE LOCAL → VERIFY LOCAL → UPLOAD CLOUD (opsional).
 */
export interface StorageProvider {
  readonly id: string;
  writeBlob(relativePath: string, data: Blob): Promise<string>;
  writeText(relativePath: string, text: string): Promise<string>;
  readBlob(relativePath: string): Promise<Blob>;
  readText(relativePath: string): Promise<string>;
  exists(relativePath: string): Promise<boolean>;
  remove(relativePath: string): Promise<void>;
  removeMeeting(meetingId: string): Promise<void>;
  /** Daftar SEMUA path file (relatif) rekursif di bawah direktori; [] bila tidak ada. */
  list(directoryPath: string): Promise<string[]>;
  estimate(): Promise<StorageEstimateInfo>;
}
