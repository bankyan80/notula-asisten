/**
 * Provider STT nyata untuk web: Whisper (Xenova/whisper-tiny, quantized)
 * dijalankan in-browser lewat `@huggingface/transformers` (WASM) — TANPA server,
 * TANPA API key (PRD §6 local-first).
 *
 * - `isAvailable()` jujur: butuh AudioContext + WebAssembly + Worker
 *   (false di jsdom/lingkungan tanpa decoder audio).
 * - Decode audio di main thread; inferensi di Web Worker (UI tidak freeze).
 * - Unduhan model pertama butuh internet; sesudahnya di-cache browser (offline).
 * - `TranscribeRequest.dictionary` diterima tetapi belum memengaruhi whisper-tiny
 *   (transformers.js v4 belum mengekspos prompt biasing) — TIDAK diklaim dipakai.
 *
 * Deviasi terdokumentasi: lihat docs/ARCHITECTURE.md §"Catatan deviation".
 */
import { AppError } from '../../core/errors/AppError';
import type { TranscriptSegment } from '../../core/types/entities';
import type { SpeechToTextProvider, TranscribeRequest } from '../../core/types/providers';
import { decodeAudioToPcm16k } from './decodeAudio';
import { mapWhisperChunksToSegments } from './mapSegments';
import { splitPcmForTranscription } from './segmentAudio';
import type {
  WhisperJobRequest,
  WhisperJobResponse,
  WhisperTimestampChunk,
} from './whisperProtocol';
import { WHISPER_SAMPLE_RATE } from './whisperProtocol';

interface PendingJob {
  resolve: (response: WhisperJobResponse) => void;
  reject: (error: unknown) => void;
}

export function isWhisperSupportedEnvironment(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof OfflineAudioContext !== 'undefined'
  );
}

/**
 * Pesan kegagalan model → kalimat Indonesia yang bisa dibaca pengguna.
 * Detail asli tetap disimpan di `AppError.context.providerMessage` dan dicatat
 * ke konsol oleh worker — layar tidak pernah menampilkan log teknis.
 */
function friendlyWhisperFailure(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('load')) {
    return 'Model transkripsi gagal diunduh — periksa koneksi internet. Unduhan hanya sekali, sesudahnya offline.';
  }
  if (lower.includes('timestamp')) {
    return 'Transkripsi tidak menghasilkan teks yang valid untuk audio ini. Coba lagi atau periksa mikrofon.';
  }
  if (lower.includes('memory') || lower.includes('allocat')) {
    return 'Kurang memori untuk transkripsi — tutup beberapa tab lalu coba lagi.';
  }
  return 'Transkripsi gagal diproses di perangkat. Audio tetap aman dan bisa dicoba lagi.';
}

export class WhisperWebSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = 'whisper-web';

  #worker: Worker | null = null;
  #requestId = 0;
  #pending = new Map<number, PendingJob>();
  /** Satu job pada satu waktu — model & memori worker dipakai bergiliran. */
  #queue: Promise<unknown> = Promise.resolve();

  async isAvailable(): Promise<boolean> {
    return isWhisperSupportedEnvironment();
  }

  transcribeChunk(request: TranscribeRequest): Promise<TranscriptSegment[]> {
    const run = (): Promise<TranscriptSegment[]> => this.#run(request);
    const result = this.#queue.then(run, run);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Lepas worker (opsional; dipakai bila aplikasi ingin membebaskan memori). */
  dispose(): void {
    this.#failPending(new AppError('PROVIDER_UNAVAILABLE', 'Worker transkripsi dihentikan.'));
    if (this.#worker !== null) {
      this.#worker.terminate();
      this.#worker = null;
    }
  }

  async #run(request: TranscribeRequest): Promise<TranscriptSegment[]> {
    if (!isWhisperSupportedEnvironment()) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        'Transkripsi butuh browser dengan dukungan audio penuh (AudioContext + WebAssembly).',
        { retryable: true },
      );
    }

    const blob = await request.readAudio();
    const audio = await decodeAudioToPcm16k(blob);

    // Audio panjang dipotong ≤ 2 menit; tiap potongan ditandai offset-nya
    // sehingga hasil digabung ke satu timeline rapat.
    const parts = splitPcmForTranscription(audio, { sampleRate: WHISPER_SAMPLE_RATE });
    const merged: WhisperTimestampChunk[] = [];

    for (const part of parts) {
      const response = await this.#dispatch(part.audio, request.language);
      if (!response.ok) {
        throw new AppError('TRANSCRIPTION_FAILED', friendlyWhisperFailure(response.message), {
          retryable: true,
          context: {
            meetingId: request.chunk.meetingId,
            chunkSequence: request.chunk.sequence,
            // Detail teknis model — untuk log, bukan untuk layar pengguna.
            providerMessage: response.message,
          },
        });
      }
      for (const chunk of response.chunks) {
        merged.push({
          ...chunk,
          start: chunk.start === null ? null : chunk.start + part.offsetSeconds,
          end: chunk.end === null ? null : chunk.end + part.offsetSeconds,
        });
      }
    }

    return mapWhisperChunksToSegments(merged, {
      meetingId: request.chunk.meetingId,
      chunkStartTime: request.chunk.startTime,
      chunkEndTime: request.chunk.endTime,
      sequenceOffset: request.sequenceOffset ?? 0,
      now: new Date().toISOString(),
    });
  }

  #ensureWorker(): Worker {
    if (this.#worker !== null) return this.#worker;

    const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<WhisperJobResponse>): void => {
      const pending = this.#pending.get(event.data.requestId);
      if (pending === undefined) return;
      this.#pending.delete(event.data.requestId);
      pending.resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent): void => {
      // Skrip worker gagal dimuat / crash (mis. WASM gagal) — buang supaya
      // percobaan berikutnya membuat worker baru.
      const message = event.message !== '' ? event.message : 'Worker transkripsi gagal.';
      this.#worker = null;
      worker.terminate();
      this.#failPending(new AppError('TRANSCRIPTION_FAILED', message, { retryable: true }));
    };
    this.#worker = worker;
    return worker;
  }

  #dispatch(audio: Float32Array, language: string): Promise<WhisperJobResponse> {
    const requestId = this.#requestId + 1;
    this.#requestId = requestId;

    const message: WhisperJobRequest = { requestId, audio, language };
    return new Promise<WhisperJobResponse>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      try {
        this.#ensureWorker().postMessage(message, [audio.buffer as ArrayBuffer]);
      } catch (error) {
        this.#pending.delete(requestId);
        reject(
          new AppError('PROVIDER_UNAVAILABLE', 'Gagal menjalankan worker transkripsi.', {
            cause: error,
            retryable: true,
          }),
        );
      }
    });
  }

  #failPending(error: AppError): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}
