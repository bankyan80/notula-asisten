/**
 * Worker inferensi Whisper (Batch 06).
 *
 * Kenapa worker: transkripsi Whisper (WASM) memblokir selama menit-an per chunk —
 * di main thread UI freeze dan chunk berikutnya bisa terlambat tersimpan.
 * Decode audio tetap di main thread (AudioContext); hanya inferensi di sini.
 *
 * Model (~40 MB, quantized) diunduh sekali dari Hugging Face lalu di-cache
 * oleh Cache API — sesudahnya transkripsi jalan offline.
 */
import type {
  WhisperJobRequest,
  WhisperJobResponse,
  WhisperTimestampChunk,
} from './whisperProtocol';
import { WHISPER_MODEL_ID } from './whisperProtocol';

interface AsrOutputChunk {
  timestamp?: [number | null, number | null] | null;
  text?: string;
}

interface AsrOutput {
  text?: string;
  chunks?: AsrOutputChunk[];
}

type AsrCall = (audio: Float32Array, options: Record<string, unknown>) => Promise<AsrOutput>;

interface LoadedTranscriber {
  transcriber: AsrCall | null;
  loading: Promise<AsrCall> | null;
}

const state: LoadedTranscriber = { transcriber: null, loading: null };

async function getTranscriber(): Promise<AsrCall> {
  if (state.transcriber !== null) return state.transcriber;
  if (state.loading === null) {
    state.loading = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const loaded = await pipeline('automatic-speech-recognition', WHISPER_MODEL_ID, {
        dtype: 'q8',
      });
      // Kontrak internal kita sempit; tipe penuh pipeline terlalu luas untuk dipakai langsung.
      return loaded as unknown as AsrCall;
    })().catch((error: unknown) => {
      state.loading = null;
      throw error;
    });
  }
  return state.loading;
}

function normalizeChunks(raw: AsrOutputChunk[] | undefined): WhisperTimestampChunk[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((chunk) => ({
      start: typeof chunk.timestamp?.[0] === 'number' ? chunk.timestamp[0] : null,
      end: typeof chunk.timestamp?.[1] === 'number' ? chunk.timestamp[1] : null,
      text: typeof chunk.text === 'string' ? chunk.text : '',
    }))
    .filter((chunk) => chunk.text.trim() !== '');
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WhisperJobRequest>) => void) | null;
  postMessage(message: WhisperJobResponse): void;
};

let chain: Promise<void> = Promise.resolve();

workerScope.onmessage = (event: MessageEvent<WhisperJobRequest>): void => {
  const job = event.data;
  chain = chain.then(async () => {
    try {
      const transcriber = await getTranscriber();
      const output = await transcriber(job.audio, {
        // Timeline relatif audio chunk — pemetaan ke timeline meeting di main thread.
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        // HARUS false (default pipeline): true membuat tokenisator melempar
        // "Whisper did not predict an ending timestamp" bila potongan terakhir
        // berhenti di tengah kata — transkripsi gagal total tanpa alasan nyata.
        force_full_sequences: false,
        language: job.language,
        task: 'transcribe',
      });
      workerScope.postMessage({
        requestId: job.requestId,
        ok: true,
        text: typeof output.text === 'string' ? output.text : '',
        chunks: normalizeChunks(output.chunks),
      });
    } catch (error) {
      // Detail teknis tetap terlihat di DevTools; pengguna hanya menerima
      // pesan ramah (dipetakan di whisperWeb.ts).
      console.warn('[whisper] inferensi gagal', error);
      workerScope.postMessage({
        requestId: job.requestId,
        ok: false,
        message: toMessage(error),
      });
    }
  });
};
