/**
 * RecordingEngine web (Batch 04) — MediaRecorder dengan timeslice.
 *
 * - Satu `dataavailable` = satu chunk (`chunkDurationSeconds`, default 300 dtk).
 * - Timeline meeting dihitung tanpa jeda pause; `pause()`/`resume()` bekerja
 *   pada MediaRecorder dan timeline sekaligus.
 * - Engine TIDAK menulis file/DB: chunk dilewatkan lewat `onChunk` dan
 *   dipersist oleh aplikasi (`modules/recording/persistChunk`) — engine tetap
 *   bebas dependensi data dan lifecycle-nya terpisah dari UI.
 * - `isSupported()` jujur: false bila `getUserMedia`/`MediaRecorder` tidak ada
 *   (mis. jsdom/unit test), sehingga UI menampilkan kondisi sebenarnya.
 */
import { AppError } from '../../core/errors/AppError';
import { createLogger } from '../../core/logging/logger';
import {
  describeRecordingFailure,
  describeUnsupportedEngine,
  errorCodeForFailure,
} from '../../modules/recording/recordingDiagnostics';
import type {
  RecordingChunkEvent,
  RecordingEngine,
  RecordingStartOptions,
  RecordingState,
  RecordingStopResult,
} from '../../core/types/providers';

const log = createLogger('recording.web');

const DEFAULT_CHUNK_SECONDS = 300;

/** Pilih MIME audio yang didukung browser (diurutkan dari yang paling diinginkan). */
function pickMimeType(requested?: string): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    // Tanpa feature-detect: serahkan pilihan default ke browser.
    return undefined;
  }
  const candidates = [requested, 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

interface PendingStop {
  resolve: (result: RecordingStopResult) => void;
  reject: (error: unknown) => void;
}

export class WebRecordingEngine implements RecordingEngine {
  readonly platform = 'web' as const;

  #state: RecordingState = {
    meetingId: null,
    status: 'idle',
    elapsedSeconds: 0,
    currentSequence: 0,
  };
  #stateListeners = new Set<(state: RecordingState) => void>();
  #chunkListeners = new Set<(event: RecordingChunkEvent) => void>();

  #recorder: MediaRecorder | null = null;
  #stream: MediaStream | null = null;
  #meetingId: string | null = null;
  #chunkMimeType = 'audio/webm';

  #timelineOriginMs = 0;
  #pausedAccumMs = 0;
  #pauseStartedAtMs: number | null = null;
  #lastChunkEndSeconds = 0;
  #chunkCount = 0;
  #chunkDurationSeconds = DEFAULT_CHUNK_SECONDS;
  #tickTimer: ReturnType<typeof setInterval> | null = null;
  #pendingStop: PendingStop | null = null;

  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  async start(options: RecordingStartOptions): Promise<void> {
    if (!this.isSupported()) {
      // Penyebabnya bisa berbeda (bukan secure context / API hilang) — sebutkan
      // yang sebenarnya, jangan satu pesan generik untuk semua kasus.
      throw new AppError('PROVIDER_UNAVAILABLE', describeUnsupportedEngine(), {
        context: {
          platform: this.platform,
          secureContext: typeof window !== 'undefined' ? window.isSecureContext : undefined,
        },
      });
    }
    const busyStatuses: RecordingState['status'][] = [
      'requesting_permission',
      'recording',
      'paused',
      'stopping',
    ];
    if (busyStatuses.includes(this.#state.status)) {
      throw new AppError('RECORDING_FAILED', 'Sesi rekaman masih berjalan.');
    }

    this.#setState({
      meetingId: options.meetingId,
      status: 'requesting_permission',
      elapsedSeconds: 0,
      currentSequence: 1,
      errorCode: undefined,
      errorMessage: undefined,
    });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      // DOMException (izin ditolak) bukan selalu instanceof Error di semua runtime.
      const { name } = error as { name?: string };
      const message = describeRecordingFailure(error) ?? 'Gagal mengakses microphone. Coba lagi.';
      const code = errorCodeForFailure(error);
      this.#setState({
        status: 'error',
        errorCode: code,
        errorMessage: message,
      });
      log.warn('getUserMedia gagal', { name });
      throw new AppError(code, message, { cause: error });
    }

    const chunkSeconds = options.chunkDurationSeconds ?? DEFAULT_CHUNK_SECONDS;
    this.#chunkDurationSeconds = chunkSeconds;
    const mimeType = pickMimeType(options.mimeType);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      const message =
        describeRecordingFailure(error) ?? 'Gagal memulai perekaman audio di perangkat ini.';
      this.#setState({
        status: 'error',
        errorCode: 'RECORDING_FAILED',
        errorMessage: message,
      });
      throw new AppError('RECORDING_FAILED', message, { cause: error });
    }

    this.#stream = stream;
    this.#recorder = recorder;
    this.#meetingId = options.meetingId;
    this.#chunkMimeType = recorder.mimeType || mimeType || 'audio/webm';
    this.#timelineOriginMs = Date.now();
    this.#pausedAccumMs = 0;
    this.#pauseStartedAtMs = null;
    this.#lastChunkEndSeconds = 0;
    this.#chunkCount = 0;

    recorder.ondataavailable = (event) => this.#handleChunkData(event.data);
    recorder.onerror = (event) => {
      const raw = (event as Event & { error?: DOMException }).error;
      const message =
        describeRecordingFailure(raw) ??
        'Perekaman mengalami kesalahan. Audio yang sudah terekam tetap aman.';
      log.error('MediaRecorder error', new Error(message), { name: raw?.name });
      const pending = this.#pendingStop;
      this.#pendingStop = null;
      this.#cleanup();
      this.#setState({
        status: 'error',
        errorCode: 'RECORDING_FAILED',
        errorMessage: message,
      });
      pending?.reject(new AppError('RECORDING_FAILED', 'Perekaman mengalami kesalahan.'));
    };
    // `stop()` selalu memicu `dataavailable` terakhir SEBELUM event `stop`.
    recorder.onstop = () => this.#finalizeStop();
    // Timer & status "SEDANG MEREKAM" hanya dimulai setelah MediaRecorder
    // benar-benar aktif (event `start`) — bukan saat tombol ditekan.
    recorder.onstart = () => {
      if (this.#recorder !== recorder) return; // sesi sudah dibatalkan
      this.#setState({ status: 'recording', elapsedSeconds: 0, currentSequence: 1 });
      this.#startTick();
      log.info('Rekaman dimulai', { meetingId: options.meetingId, chunkSeconds });
    };

    try {
      recorder.start(chunkSeconds * 1000);
    } catch (error) {
      const message =
        describeRecordingFailure(error) ?? 'Gagal memulai perekaman audio di perangkat ini.';
      this.#cleanup();
      this.#setState({
        status: 'error',
        errorCode: 'RECORDING_FAILED',
        errorMessage: message,
      });
      throw new AppError('RECORDING_FAILED', message, { cause: error });
    }
  }

  async pause(): Promise<void> {
    if (this.#state.status !== 'recording' || !this.#recorder) {
      throw new AppError('RECORDING_FAILED', 'Tidak ada rekaman yang berjalan untuk dijeda.');
    }
    this.#recorder.pause();
    this.#pauseStartedAtMs = Date.now();
    this.#stopTick();
    this.#setState({ status: 'paused', elapsedSeconds: this.#elapsedSeconds() });
    log.info('Rekaman dijeda');
  }

  async resume(): Promise<void> {
    if (this.#state.status !== 'paused' || !this.#recorder) {
      throw new AppError('RECORDING_FAILED', 'Rekaman tidak dalam keadaan dijeda.');
    }
    if (this.#pauseStartedAtMs !== null) {
      this.#pausedAccumMs += Date.now() - this.#pauseStartedAtMs;
      this.#pauseStartedAtMs = null;
    }
    this.#recorder.resume();
    this.#setState({ status: 'recording', elapsedSeconds: this.#elapsedSeconds() });
    this.#startTick();
    log.info('Rekaman dilanjutkan');
  }

  async stop(): Promise<RecordingStopResult> {
    const recorder = this.#recorder;
    const meetingId = this.#meetingId;
    const status = this.#state.status;
    if (!recorder || !meetingId || (status !== 'recording' && status !== 'paused')) {
      throw new AppError('RECORDING_FAILED', 'Tidak ada rekaman yang sedang berjalan.');
    }

    this.#stopTick();
    if (this.#pauseStartedAtMs !== null) {
      this.#pausedAccumMs += Date.now() - this.#pauseStartedAtMs;
      this.#pauseStartedAtMs = null;
    }
    this.#setState({ status: 'stopping' });

    const result = await new Promise<RecordingStopResult>((resolve, reject) => {
      this.#pendingStop = { resolve, reject };
      try {
        recorder.stop();
      } catch (error) {
        this.#pendingStop = null;
        this.#setState({
          status: 'error',
          errorCode: 'RECORDING_FAILED',
          errorMessage: 'Gagal menghentikan perekaman.',
        });
        reject(new AppError('RECORDING_FAILED', 'Gagal menghentikan perekaman.', { cause: error }));
      }
    });
    log.info('Rekaman selesai', {
      chunkCount: result.chunkCount,
      totalDurationSeconds: result.totalDurationSeconds,
    });
    return result;
  }

  getState(): RecordingState {
    return { ...this.#state };
  }

  onChunk(listener: (event: RecordingChunkEvent) => void): () => void {
    this.#chunkListeners.add(listener);
    return () => {
      this.#chunkListeners.delete(listener);
    };
  }

  onStateChange(listener: (state: RecordingState) => void): () => void {
    this.#stateListeners.add(listener);
    return () => {
      this.#stateListeners.delete(listener);
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Internal                                                               */
  /* ---------------------------------------------------------------------- */

  #setState(patch: Partial<RecordingState>): void {
    this.#state = { ...this.#state, ...patch };
    const snapshot = { ...this.#state };
    for (const listener of this.#stateListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        log.error('Listener onStateChange gagal', error);
      }
    }
  }

  /** Durasi rekaman aktif (detik) — jeda pause tidak dihitung. */
  #elapsedSeconds(): number {
    if (
      this.#state.status !== 'recording' &&
      this.#state.status !== 'paused' &&
      this.#state.status !== 'stopping'
    ) {
      return this.#state.elapsedSeconds;
    }
    const now = Date.now();
    const activePauseMs = this.#pauseStartedAtMs !== null ? now - this.#pauseStartedAtMs : 0;
    const totalMs = Math.max(0, now - this.#timelineOriginMs - this.#pausedAccumMs - activePauseMs);
    return Math.floor(totalMs / 1000);
  }

  #handleChunkData(blob: Blob): void {
    const meetingId = this.#meetingId;
    if (!meetingId || blob.size === 0) return;

    const endSeconds = this.#elapsedSeconds();
    const sequence = this.#chunkCount + 1;
    const event: RecordingChunkEvent = {
      meetingId,
      sequence,
      startTime: this.#lastChunkEndSeconds,
      endTime: endSeconds,
      blob,
      mimeType: blob.type || this.#chunkMimeType,
      chunkDurationSeconds: this.#chunkDurationSeconds,
    };
    this.#lastChunkEndSeconds = endSeconds;
    this.#chunkCount = sequence;

    if (this.#state.status === 'recording' || this.#state.status === 'stopping') {
      this.#setState({ currentSequence: sequence + 1 });
    }
    for (const listener of this.#chunkListeners) {
      try {
        listener(event);
      } catch (error) {
        log.error('Listener onChunk gagal', error, { sequence });
      }
    }
  }

  #finalizeStop(): void {
    const totalDurationSeconds = this.#elapsedSeconds();
    const chunkCount = this.#chunkCount;
    const meetingId = this.#meetingId;
    const pending = this.#pendingStop;
    this.#pendingStop = null;

    this.#cleanup();
    this.#setState({
      status: 'stopped',
      elapsedSeconds: totalDurationSeconds,
      currentSequence: chunkCount + 1,
    });

    if (meetingId) {
      pending?.resolve({ meetingId, chunkCount, totalDurationSeconds });
    } else {
      pending?.reject(new AppError('RECORDING_FAILED', 'Sesi rekaman tidak dikenal.'));
    }
  }

  #cleanup(): void {
    this.#stopTick();
    if (this.#stream) {
      this.#stream.getTracks().forEach((track) => track.stop());
    }
    if (this.#recorder) {
      this.#recorder.ondataavailable = null;
      this.#recorder.onstart = null;
      this.#recorder.onstop = null;
      this.#recorder.onerror = null;
    }
    this.#recorder = null;
    this.#stream = null;
    this.#meetingId = null;
    this.#pauseStartedAtMs = null;
  }

  #startTick(): void {
    this.#stopTick();
    this.#tickTimer = setInterval(() => {
      this.#setState({ elapsedSeconds: this.#elapsedSeconds() });
    }, 1000);
  }

  #stopTick(): void {
    if (this.#tickTimer !== null) {
      clearInterval(this.#tickTimer);
      this.#tickTimer = null;
    }
  }
}
