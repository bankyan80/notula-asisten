# ARCHITECTURE — NOTULA ASSISTENT

Dokumen ini menjelaskan keputusan arsitektur. Sumber kebenaran fitur tetap
`docs/PRD-Notula-Assistent-Final.md`; rencana kerja ada di
`docs/IMPLEMENTATION-PLAN.md`.

## 1. Prinsip

1. **Local-first.** Penyimpanan perangkat adalah sumber data utama. Cloud opsional
   dan tidak pernah menjadi satu-satunya tempat rekaman.
2. **Urutan sinkronisasi selalu:** `SAVE LOCAL → VERIFY LOCAL → UPLOAD CLOUD`.
3. **Audio adalah sumber utama.** Transkrip hanyalah representasi audio.
4. **Transkrip adalah sumber utama AI.** AI tidak boleh mengarang fakta.
5. **Timestamp wajib telusur.** Setiap hasil AI penting menyimpan `sourceTimestamp`
   yang mengacu ke timeline rapat (bukan waktu request).
6. **Gagal itu aman.** Kegagalan jaringan/AI/STT tidak boleh menghapus rekaman.

## 2. Lapisan

```text
UI (src/app, src/ui, src/modules/*)
        │  hanya memanggil
        ▼
Repository (src/data/repositories.ts)  ──  Provider (src/core/types/providers.ts)
        │                                      │
        ▼                                      ▼
Local storage: IndexedDB/Dexie (Batch 03 ✅) SpeechToText / Diarization / AI /
+ file OPFS `Meetings/{id}/…` (Batch 03 ✅)  Export / StorageProvider
+ rekaman web (Batch 04 ✅) + Android native (Batch 14)
        │
        └──(opsional, Batch 12)──> SyncQueue ──> Cloud
```

Aturan: **UI tidak boleh mengimplementasikan storage atau memanggil API eksternal
langsung.** Semua lewat repository/provider interface agar implementasi bisa
ditukar tanpa menyentuh UI.

## 3. Kontrak utama (Batch 01)

| Kontrak    | File                          | Catatan                                                                                                                     |
| ---------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Entity     | `src/core/types/entities.ts`  | Meeting, AudioChunk, Speaker, TranscriptSegment, Bookmark, Summary, Decision, ActionItem, ExportFile, SyncQueue, Minutes    |
| Provider   | `src/core/types/providers.ts` | RecordingEngine, SpeechToTextProvider, SpeakerDiarizationProvider, AISummarizationProvider, ExportProvider, StorageProvider |
| Repository | `src/data/repositories.ts`    | 11 repository + `Repositories` aggregator                                                                                   |
| Error      | `src/core/errors/AppError.ts` | kode error + pesan ramah Bahasa Indonesia                                                                                   |
| Logging    | `src/core/logging/logger.ts`  | log terstruktur per scope                                                                                                   |
| Config     | `src/core/config/env.ts`      | validasi `.env` dengan Zod                                                                                                  |

### Catatan deviation (disengaja, terdokumentasi)

- `SpeechToTextProvider.transcribeChunk(request: TranscribeRequest)` — PRD
  menyebut `transcribeChunk(audio: AudioChunk)`. Implementasi nyata memerlukan
  byte audio (`readAudio()`), bahasa, dan kamus istilah, sehingga parameter
  diperluas menjadi `TranscribeRequest` yang memuat `chunk: AudioChunk`.
- Estimasi storage dihitung dari bitrate aktual (default 128 kbps ≈ 110 MB / 2 jam),
  bukan angka statis 1.2 GB / 2 jam pada PRD, agar angka yang ditampilkan jujur.

## 4. Pipeline rekaman → transkripsi → ringkasan → notulen (Batch 04–07 ✅ + BUGFIX auto-pipeline)

```text
Microphone
   ↓
RecordingEngine (foreground service Android / MediaRecorder web)
   ↓ event chunk (5 menit) — diserialisasi lewat chunkWriteChain
StorageProvider.writeBlob → Meetings/{id}/audio/000001.m4a
   ↓
AudioChunkRepository.add (manifest chunk)
   ↓ ■ SELESAI / auto-stop storage penuh / aplikasi dibuka / interval 15 dtk / online
stopRecordingSafely: engine.stop → TUNGGU antrean tulis → verifikasi file > 0
   ↓
meeting SAVING_AUDIO → TRANSCRIPTION_PENDING → TRANSCRIBING
   ↓ executePipeline (modules/pipeline/runPipeline.ts, single-flight)
SpeechToTextProvider (whisper-web: decode 16 kHz → potong ≤ 2 menit → worker
   ↓             WASM → digabung ke satu timeline; retry 3x; unavailable = skip jujur)
TranscriptSegment → meeting TRANSCRIPT_READY
   ↓
ExtractiveAISummarizationProvider → Summary + Keputusan + Tindak Lanjut
   ↓             (meeting SUMMARIZING)
generateMinutes → Notulen (meeting GENERATING_MINUTES)
   ↓
meeting COMPLETED (pipelineAttempts & pipelineError direset)
```

Kegagalan tidak pernah menghapus audio:

- transkripsi gagal → `PROCESSING_ERROR` + `pipelineError` (banner "Coba Lagi");
- ringkasan/notulen gagal → transkrip TETAP terbaca, status `TRANSCRIPT_READY`
  - `pipelineError`, percobaan otomatis berhenti di `MAX_PIPELINE_ATTEMPTS` (5)
    lalu menunggu tombol coba lagi;
- provider/jaringan belum siap → dilewati TANPA menambah hitungan percobaan;
- transkripsi sukses tetapi TIDAK menghasilkan teks (rekaman sunyi/bising) →
  `PROCESSING_ERROR` + "Tidak ada teks yang terbaca dari rekaman ini." dengan
  percobaan otomatis dimatikan (audio sama = hasil sama); tombol coba lagi
  me-reset chunk sehingga transkripsi benar-benar diulang;
- pesan kegagalan provider yang kosong → selalu diganti `orFallback()` dengan
  kalimat Indonesia (`pipelineStatus.ts`) — layar tidak pernah kosong;
- audio, transkrip, ringkasan, dan notulen semuanya disimpan lebih dulu ke DB
  lokal sehingga bisa dilanjutkan setelah aplikasi ditutup/buka lagi.

Syarat microphone (penyebab #1 kegagalan rekaman di perangkat nyata):

- `getUserMedia` hanya ada di **secure context** (`https://` atau
  `localhost`). Di `http://<ip-lan>` → `navigator.mediaDevices` =
  `undefined` padahal `MediaRecorder` tetap ada, sehingga kesannya "mikrofon
  tidak didukung". Pengujian dari HP karena itu wajib lewat HTTPS:
  `npm run certs` + `npm run preview:https`, pemasangan CA di HP dijelaskan di
  `docs/DEV-HTTPS.md`;
- penyebab kegagalan dijelaskan apa adanya oleh
  `src/modules/recording/recordingDiagnostics.ts` (bukan secure context /
  API microphone hilang / `MediaRecorder` hilang, atau `NotAllowedError` /
  `NotFoundError` / `NotReadableError` / `OverconstrainedError` /
  `SecurityError` / `NotSupportedError` / `AbortError` termasuk lewat
  `error.cause`) dan dipakai `webEngine.ts` + `RecordingPage.tsx` — tidak ada
  satu pesan generik untuk semua kasus;
- status `recording` + timer dimulai pada event `recorder.onstart` (bukan saat
  tombol ditekan), `engine.stop()` baru resolve setelah `dataavailable`
  terakhir dan seluruh track mikrofon dilepas (`#cleanup()`), serta engine
  tidak lagi di-downgrade permanen ke `UnavailableRecordingEngine`;
- chunk `0` saat berhenti → `PROCESSING_ERROR` + `AppError('RECORDING_FAILED')`
  dengan pesan jujur, sehingga status `SAVING_AUDIO` tidak pernah nyangkut.

Chunk membuat risiko kehilangan data kecil: crash hanya mengorupsi chunk aktif,
chunk sebelumnya sudah utuh dan bisa dipulihkan (Batch 05).

Detail STT (Batch 06): model `Xenova/whisper-tiny` diunduh 1x lalu di-cache
(Cache API); WASM onnxruntime di-cache terpisah (CacheFirst) setelah unduhan
pertama. **Tanpa API key & tanpa server** — unduhan pertama butuh internet,
sesudahnya penuh offline. Audio > 120 s dipotong di titik paling tenang
(`providers/whisper/segmentAudio.ts`) lalu offset tiap potongan ditambahkan
sebelum digabung kembali ke satu timeline. Pemicu pipeline: `stopRecordingSafely`,
`usePipelineScheduler` (interval 15 dtk + event `online`), pemulihan saat aplikasi
dibuka, dan tombol "Coba Lagi" di tab Transkrip; percobaan gagal tidak
memusnahkan audio (kontrak PRD §11: sumber kebenaran = file lokal).

Audio-text sync (Batch 07): `playerStore` (zustand) = satu state untuk bar
player & transkrip — klik kalimat/hasil cari → `playFrom(startTime)` (chunk
mana yang dibaca dihitung dari timeline chunk); `timeupdate` → segmen `aria-current`

- auto-scroll; `ended` → lanjut file chunk berikutnya. Elemen `HTMLAudioElement`
  singleton di luar React; kegagalan load → pesan ramah, tanpa pura-pura jalan.

Speaker diarization (Batch 08): setelah transkripsi, `runDiarization` memproses
rapat `COMPLETED` yang belum ter-assign (sekali jalan, dilewati bila sudah lengkap
— hemat decode ulang). Provider `vad-local`: VAD energi RMS → giliran bicara →
fitur ZCR + spectral centroid (FFT) → clustering single-linkage → kode
`speaker_1..N` urut waktu — **pemisahan suara, bukan identifikasi orang**
(PRD §13). Pembicara upsert by code; `displayName` lama TIDAK PERNAH ditimpa
(rename manual pengguna permanen); durasi/% dihitung ulang dari transkrip.
Provider tak tersedia / audio hilang / sedang rekam → dilewati jujur (tanpa
mengarang pembicara).

AI summary (Batch 09): provider default `extractive` — ekstraksi offline murni
dari transkrip (skor salience → paragraf; frasa → pokok pembahasan; pola kalimat
ID → keputusan / tindak lanjut / pertanyaan / belum diputuskan; PIC = nama
pembicara disebut literal; deadline = pola tanggal/hari). Guard
`validateSummaryResult` membuang setiap item yang `sourceTimestamp`-nya tidak
berada di rentang segmen transkrip (anti-hallucination, PRD §15) — keluaran
selalu berupa kalimat asli transkrip + jejak `sourceSegmentId`, bukan kalimat
karangan; tanpa jaringan & tanpa API key (LLM server opsional → Batch 12).

Notulen otomatis (Batch 10): `MinutesGenerator` menyusun 7 section urut PRD §17
(AGENDA dari deskripsi rapat, PEMBAHASAN dari pokok ringkasan, KEPUTUSAN +
TINDAK LANJUT dengan jejak jam sumber, PENANGGUNG JAWAB = PIC bila disebut,
DEADLINE dari pola tanggal, CATATAN = hal yang belum diputuskan) — semua isi
dari data yang sudah ada, section kosong → "Tidak disebutkan dalam rapat."
8 template PRD §18 mengatur judul section; pilihan tersimpan di
`meeting.minutesTemplateId`; regenerate = upsert by `meetingId`.

Ekspor (Batch 11): `ExportTab` → `buildExportRequest` (per format: PDF/DOCX =
dokumen §19.1 ikut notulen bila ada, TXT = transkrip §19.3, XLSX = tabel
tindak lanjut/keputusan/pembicara) → `getExportProvider()` (`LocalExportProvider`)
→ unduhan nyata lewat `URL.createObjectURL` + anchor, salinan best-effort ke
OPFS `Meetings/{id}/exports/`, entri riwayat `exports.add` + toast. Seluruh
berkas ditulis sendiri tanpa dependensi baru: ZIP STORE + CRC-32 (`format/zip.ts`
— dasar DOCX/XLSX), PDF 1.4 Latin-1 (`format/pdf.ts`), OOXML DOCX/XLSX
(`format/docx.ts`, `format/xlsx.ts`); CSV didukung kontrak tetapi tidak
ditawarkan (`supports('CSV')` → `PROVIDER_UNAVAILABLE`).

Sinkronisasi cloud opsional (Batch 12): `SyncQueue` (PENDING → UPLOADING →
SUCCESS | FAILED | RETRY, idempoten per `kind:entityId`) dengan alur wajib
SAVE LOCAL → VERIFY LOCAL → UPLOAD. `enqueueMeetingSync` mendaftar hanya
entitas yang benar ada lokal (file audio & `localPath` export dicek ke storage);
`processQueue` memverifikasi ulang payload tepat sebelum upload — provider belum
dikonfigurasi (`VITE_API_BASE_URL` kosong) atau offline → item tetap menunggu,
tanpa sukses/gagal palsu; gagal → `markFailed` + attempts +1, `retryFailedSync`
mengembalikan ke RETRY. `HttpSyncProvider` (`providers/http/sync.ts`) memakai
endpoint PRD §39 (JSON; audio via `FormData`), `NETWORK_ERROR` retryable.
Perangkai: `maybeSyncCompletedMeeting` dari `transcriptionQueue` saat rapat
COMPLETED (no-op pada default "Hanya Perangkat", PRD §25), `useAutoSync`
listener `online` di `AppShell`, dan kartu "Sinkronisasi Cloud" di Settings
(statistik antrean + Sinkronkan/Coba Lagi dengan status jujur).

Keamanan & testing (Batch 13): consent notice §27 kini juga menjaga
`RecordingPage` (tombol MULAI terkunci sampai disetujui); hapus data terpisah
§26 lewat `deleteMeetingDataKind` (audio/transkrip/hasil AI — file dulu,
metadata hanya bila storage sukses) dari Zona Berbahaya `ExportTab`; koreksi
transkrip §43 per baris di `TranscriptTab` (edit teks, ganti pembicara,
timestamp, hapus/gabung/pecah segmen, penanda `✎ diedit`); audit log lokal §48
(`modules/security/auditLog.ts`, localStorage maks 500 entri) tercatat pada
aksi destruktif/ekspor dan tampil di kartu "Riwayat Keamanan" Settings.
Suite `src/app/acceptance.test.tsx` memetakan seluruh acceptance criteria
PRD §52 (20 test) ke perilaku nyata; keamanan server (auth/HTTPS/signed URL)
ditunda sampai ada backend.

Build produksi & Android (Batch 14): Capacitor 8 menjadi shell Android
(`capacitor.config.ts`, `webDir: dist`, `cap sync` menyalin aset PWA ke
`android/app/src/main/assets/public`). Izin §28 (`RECORD_AUDIO`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`)
dideklarasikan di `AndroidManifest.xml` bersama `RecordingForegroundService`
(notifikasi kanal rendah, `START_STICKY`, `FOREGROUND_SERVICE_TYPE_MICROPHONE`
API 30+) — layanan dijalankan lewat plugin `RecordingService`
(`RecordingServicePlugin` terdaftar di `MainActivity` sebelum bridge dibangun)
yang dipanggil `RecordingPage` via `startNativeRecordingService()` /
`stopNativeRecordingService()` (`modules/recording/nativeService.ts`). Di
browser hal yang sama menjadi **no-op jujur** (`isNativePlatform` +
`isPluginAvailable` → false) — rekaman web tetap berjalan selama tab aktif
sesuai batasan PRD §5.2. Selain izin §28, manifest menambahkan
`MODIFY_AUDIO_SETTINGS` (normal-time) — tanpanya Chrome/WebView menolak
`getUserMedia` (`cr_media: Requires MODIFY_AUDIO_SETTINGS and RECORD_AUDIO`).
Sudah teruji di emulator API 36 (AVD `notula-avd`, KVM): build debug, rekam
berjalan dengan notifikasi foreground id 8520, tetap merekam saat app
di-background, service + notifikasi berhenti bersih setelah "Berhenti".

## 5. Offline & error handling

| Kondisi              | Perilaku                                                           |
| -------------------- | ------------------------------------------------------------------ |
| Internet putus       | Rekaman lanjut ke lokal; item masuk `SyncQueue` (Batch 12)         |
| STT gagal            | Chunk aman; status transkripsi `PENDING`; pesan "Audio tetap aman" |
| AI gagal             | Transkrip tetap tersedia; tombol "Coba Ringkas Lagi"               |
| Cloud gagal          | Data tetap di perangkat; retry idempotent                          |
| Storage hampir penuh | Peringatan sebelum rekam; stop aman setelah chunk aktif            |

## 6. Keamanan

- Tidak ada secret/API key di frontend (hanya `VITE_*` publik di `.env.example`).
- Cloud (Batch 12): HTTPS, signed URL, tanpa URL audio publik.
- Pengguna dapat menghapus rapat, audio, transkrip, dan hasil AI (Batch 13).
- Consent notice wajib sebelum rekaman (PRD §27).
- Android (Batch 14): izin diminta seperlunya, rekaman dijaga foreground
  service + notifikasi (PRD §28).

## 7. Keputusan stack

| Pilihan                      | Alasan                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Vite + React + TS strict     | Build cepat, type safety, ekosistem matang                                      |
| Tailwind v4                  | Utilitas UI Android-style biru sesuai PRD §32                                   |
| vite-plugin-pwa              | Offline shell + installable, tanpa backend                                      |
| Capacitor (Batch 14)         | Foreground service Android dengan satu codebase web                             |
| Dexie/IndexedDB (Batch 03)   | Local-first di web; tipe aman; migration                                        |
| Zod                          | Validasi form + parsing konfigurasi                                             |
| Vitest                       | Satu tool unit + component test                                                 |
| Pin `@vitejs/plugin-react@5` | v6 (rolldown/babel 8) konflik peer dengan `vite-plugin-pwa` → workbox (babel 7) |
