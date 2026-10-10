/**
 * Protokol pesan provider ↔ worker Whisper (Batch 06).
 * File ini harus bebas side-effect (dipakai main thread DAN worker).
 *
 * Pipeline inferensi berjalan di Web Worker agar UI/recording tidak freeze —
 * transkripsi 1 chunk (5 menit) bisa memakan waktu menit di perangkat biasa.
 */

/** Model Whisper quantized (≈ 40 MB) diunduh sekali lalu di-cache browser. */
export const WHISPER_MODEL_ID = 'Xenova/whisper-tiny';

/** Sample rate yang diminta model Whisper. */
export const WHISPER_SAMPLE_RATE = 16000;

export interface WhisperJobRequest {
  requestId: number;
  /** Gelombang 16 kHz mono hasil decode di main thread. */
  audio: Float32Array;
  /** Kode bahasa ISO 639-1, contoh: 'id'. */
  language: string;
}

export interface WhisperTimestampChunk {
  /** Detik relatif terhadap AWAL audio chunk (belum termasuk timeline meeting). */
  start: number | null;
  end: number | null;
  text: string;
}

export type WhisperJobResponse =
  | { requestId: number; ok: true; text: string; chunks: WhisperTimestampChunk[] }
  | { requestId: number; ok: false; message: string };
