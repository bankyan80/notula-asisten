/**
 * Registry provider — dipilih berdasarkan konfigurasi (.env), bukan hardcode di UI.
 * Menambah provider nyata (Batch 06/08/09) = menambah case + implementasi baru.
 */
import { config } from '../core/config/env';
import type {
  AISummarizationProvider,
  ExportProvider,
  RecordingEngine,
  SpeakerDiarizationProvider,
  SpeechToTextProvider,
  StorageProvider,
  SyncProvider,
} from '../core/types/providers';
import { ExtractiveAISummarizationProvider } from './extractive/extractiveSummary';
import { LocalExportProvider } from './export/localExport';
import { HttpSyncProvider } from './http/sync';
import { LocalDevAISummarizationProvider } from './local-dev/aiSummary';
import { LocalDevSpeakerDiarizationProvider } from './local-dev/speakerDiarization';
import { LocalDevSpeechToTextProvider } from './local-dev/speechToText';
import { WebRecordingEngine } from './recording/webEngine';
import { OpfsStorageProvider } from './storage/opfsStorage';
import { VadSpeakerDiarizationProvider } from './vad/vadDiarization';
import { WhisperWebSpeechToTextProvider } from './whisper/whisperWeb';

export function getSpeechToTextProvider(
  overrideId: string = config.VITE_SPEECH_PROVIDER,
): SpeechToTextProvider {
  switch (overrideId) {
    case 'local-dev':
      return new LocalDevSpeechToTextProvider();
    // case 'server': return new ServerSpeechToTextProvider(); // Batch 12
    case 'whisper-web':
    default:
      // Default: STT nyata in-browser (Batch 06). Provider jujur — bila browser
      // tidak mendukung, `isAvailable()` false dan chunk tetap menunggu (PENDING).
      return new WhisperWebSpeechToTextProvider();
  }
}

export function getSpeakerDiarizationProvider(
  overrideId: string = config.VITE_DIARIZATION_PROVIDER,
): SpeakerDiarizationProvider {
  switch (overrideId) {
    case 'local-dev':
      return new LocalDevSpeakerDiarizationProvider();
    // case 'server': return new ServerSpeakerDiarizationProvider(); // Batch 12
    case 'vad-local':
    default:
      // Default: diarization akustik lokal (Batch 08) — VAD + fitur suara dari
      // file chunk. Jujur: hanya kode speaker_N; tanpa Web Audio → isAvailable false.
      return new VadSpeakerDiarizationProvider();
  }
}

export function getAISummarizationProvider(
  overrideId: string = config.VITE_AI_PROVIDER,
): AISummarizationProvider {
  switch (overrideId) {
    case 'local-dev':
      return new LocalDevAISummarizationProvider();
    // case 'server': return new ServerAISummarizationProvider(); // Batch 12
    case 'extractive':
    default:
      // Default: ekstraksi offline dari transkrip (Batch 09) — murni kutipan
      // kalimat + guard anti-hallucination; tanpa jaringan & tanpa API key.
      return new ExtractiveAISummarizationProvider();
  }
}

/**
 * Engine rekaman per platform — SINGLETON, karena lifecycle engine terpisah
 * dari UI: berpindah halaman tidak boleh menghentikan rekaman.
 * Web: MediaRecorder (Batch 04). Android native foreground service menyusul
 * di build Android (Batch 14) dengan `platform: 'android'`.
 */
let recordingEngine: RecordingEngine | null = null;

export function getRecordingEngine(): RecordingEngine {
  // Selalu WebRecordingEngine: `isSupported()`-nya jujur dan `start()` memberi
  // ALASAN spesifik (bukan secure context / API hilang). Menyimpan pilihan
  // "unsupported" di memori akan mengunci engine selamanya walaupun kondisi
  // berubah (mis. halaman dimuat ulang lewat HTTPS pada sesi yang sama).
  if (recordingEngine === null) {
    recordingEngine = new WebRecordingEngine();
  }
  return recordingEngine;
}

/**
 * Storage file lokal (Batch 03): OPFS di web, Filesystem Capacitor di Android
 * (Batch 14) — struktur path sama persis lewat `core/utils/paths.ts`.
 */
export function getStorageProvider(): StorageProvider {
  return new OpfsStorageProvider();
}

/**
 * Ekspor berkas (Batch 11): lokal penuh — PDF/DOCX/TXT/XLSX dibuat di
 * perangkat, lalu diunduh. Provider lain menyusul lewat backend (Batch 12).
 */
export function getExportProvider(): ExportProvider {
  return new LocalExportProvider();
}

/**
 * Sinkronisasi cloud opsional (Batch 12): HTTP ke backend bila
 * `VITE_API_BASE_URL` terisi; kalau kosong → `isAvailable() === false`
 * (antrean menunggu dengan jujur, tanpa menandai sukses palsu).
 */
export function getSyncProvider(): SyncProvider {
  return new HttpSyncProvider();
}
