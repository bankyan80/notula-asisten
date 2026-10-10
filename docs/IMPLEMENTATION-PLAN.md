# IMPLEMENTATION PLAN — NOTULA ASSISTENT

**Produk:** Notula Assistent — _Rekam. Transkrip. Rangkum._
**Sumber kebenaran:** `docs/PRD-Notula-Assistent-Final.md`
**Status:** Batch 14 SELESAI (batch terakhir — production build: PWA + Capacitor Android + foreground service) — **proyek 14/14 SELESAI**.
**Aturan:** local-first, cloud optional, tanpa mock palsu, tanpa migrasi provider tanpa alasan.

## Status Batch

| Batch | Status           | Catatan                                                                         |
| ----- | ---------------- | ------------------------------------------------------------------------------- |
| 01    | ✅ Selesai       | lint/typecheck/test/build hijau — 7 file test, 35 test lulus                    |
| 02    | ✅ Selesai       | lint/typecheck/test/build hijau — 14 file test, 66 test lulus                   |
| 03    | ✅ Selesai       | lint/typecheck/test/build hijau — 17 file test, 82 test lulus                   |
| 04    | ✅ Selesai (web) | lint/typecheck/test/build hijau — 20 file test, 93 test lulus                   |
| 05    | ✅ Selesai       | lint/typecheck/test/build hijau — 23 file test, 114 test lulus                  |
| 06    | ✅ Selesai       | lint/typecheck/test/build hijau — 28 file test, 143 test lulus                  |
| 07    | ✅ Selesai       | lint/typecheck/test/build hijau — 32 file test, 178 test lulus                  |
| 08    | ✅ Selesai       | lint/typecheck/test/build hijau — 37 file test, 207 test lulus                  |
| 09    | ✅ Selesai       | lint/typecheck/test/build hijau — 42 file test, 237 test lulus                  |
| 10    | ✅ Selesai       | lint/typecheck/test/build hijau — 44 file test, 253 test lulus                  |
| 11    | ✅ Selesai       | lint/typecheck/test/build hijau — 51 file test, 292 test lulus                  |
| 12    | ✅ Selesai       | lint/typecheck/test/build hijau — 55 file test, 323 test lulus                  |
| 13    | ✅ Selesai       | lint/typecheck/test/build hijau — 58 file test, 366 test lulus                  |
| 14    | ✅ Selesai       | lint/typecheck/test/build hijau — 59 file test, 369 test lulus (batch terakhir) |

### Ringkasan eksekusi Batch 01

- Repo diaudit: hanya PRD + prototype HTML → dipindah ke `docs/` dan `prototype/` (tanpa menghapus).
- Scaffold: Vite 8 + React 19 + TypeScript strict + Tailwind 4 + `vite-plugin-pwa` + ESLint 10 (flat config) + Prettier + Vitest 5.
- Pin `@vitejs/plugin-react@5` (v6/rolldown/babel 8 konflik peer dengan workbox/babel 7 milik `vite-plugin-pwa`).
- Dibuat: entity types, kontrak provider (RecordingEngine, SpeechToText, Diarization, AI, Export, Storage), 11 repository interface, `AppError` + pesan ramah Bahasa Indonesia, logger terstruktur, config Zod, util waktu/chunk/estimasi storage, provider local-dev yang jujur (melempar `PROVIDER_UNAVAILABLE`, tidak mengarang hasil), error boundary.
- Sengaja BELUM dikerjakan: UI lengkap, database, recording engine — itu Batch 02–05.

### Ringkasan eksekusi Batch 02

- Deps baru: `react-router-dom` (routing per URL — semua layar bisa dibuka langsung), `zustand` (toast + pengaturan, localStorage persist).
- Navigasi: `App` dirombak jadi router (route plan sesuai bagian 6), `TabLayout` + `BottomNav` (4 tab), `OfflineBanner`, `ToastHost`, halaman 404.
- Layar: Home, Daftar Rapat, Buat Rapat (validasi Zod + gate storage/consent), Rekam (UI state jujur: engine belum aktif → tombol nonaktif + keterangan), detail rapat dengan tab Transkrip (pencarian + highlight), Pembicara (rename + % durasi), Ringkasan (provider AI, hasil disimpan lengkap dengan keputusan/tindak lanjut traceable), Notulen, Ekspor (jujur: belum aktif), Notulen (daftar), Pengaturan (mode penyimpanan, bahasa, kamus, hapus semua data), Akun.
- Data: 11 repository in-memory (nyata, volatile, cascade delete) + `clearAllLocalData()`; UI hanya mengenal `useRepositories()` sehingga Batch 03 cukup mengganti backend di `src/data/index.ts`.
- Hook baru: `useAsync` (key-based loading, tanpa `setState` sinkron di effect), `useOnlineStatus`.
- Test +11 file / +31 test (UI components, halaman buat rapat, search, settings, repository). Semua screen navigable, mobile-first `max-w-480px`.
- Deviation: tombol "Buat Notulen" dan format ekspor menampilkan pesan jujur "belum aktif di build ini" sampai Batch 10/11 (keduanya kini sudah aktif — lihat Ringkasan Batch 10 & 11).

### Ringkasan eksekusi Batch 03

- Deps baru: `dexie` (IndexedDB bertipe + migration berversi), `fake-indexeddb` (dev — IndexedDB untuk test jsdom, didaftarkan di `tests/setup.ts`).
- `src/data/dexie/db.ts`: skema **versi 1** untuk 11 tabel + indeks (meetingId, sequence, compound `[meetingId+sequence]`); perubahan struktur ke depan WAJIB menambah `version(n)`, bukan patch.
- `src/data/dexie/repositories.ts`: 11 repository produksi — perilaku identik dengan implementasi memory (pesan error sama, sort sama), transaksi untuk cascade delete & upsert summary/minutes.
- `src/data/index.ts` kini memakai Dexie; `clearAllLocalData()` menghapus file OPFS per rapat (best effort) lalu seluruh tabel.
- Struktur file: `src/core/utils/paths.ts` (`Meetings/{id}/audio/000001.m4a`, `transcript/`, `exports/`, penolakan path traversal) + `OpfsStorageProvider` (write/read/exists/remove/removeMeeting/estimate; jujur melempar `PROVIDER_UNAVAILABLE` bila OPFS tidak ada) + `getStorageProvider()` registry.
- Penghapusan rapat kini membersihkan dua sisi: metadata (DB) + file (OPFS) lewat `removeMeetingFiles()` dari layar Ekspor.
- Storage monitor: `navigator.storage.estimate()` dipakai di `modules/storage/estimate.ts` (tampil di Buat Rapat, Rekam, Akun).
- Test +3 file / +16 test: Dexie repository (CRUD, cascade, **persistensi setelah DB ditutup/dibuka ulang**, upsert summary, retry sync idempotent), path helper, OPFS jujur di lingkungan tanpa OPFS.
- Deviasi: `chunkSizeWarningLimit` dinaikkan ke 600 kB (bundle 503 kB min / 154 kB gzip, single-chunk PWA); code-splitting route menjadi pekerjaan Batch 14 bila diperlukan.

### Ringkasan eksekusi Batch 04

- `src/providers/recording/webEngine.ts` — `WebRecordingEngine` (MediaRecorder + timeslice, default 5 menit/chunk sesuai PRD §9.1): state machine penuh (`idle → requesting_permission → recording → paused → stopping → stopped | error`), pause membekukan timeline meeting, flush chunk terakhir saat stop, track mikrofon selalu dimatikan, `isSupported()` jujur (false di lingkungan tanpa `getUserMedia`/`MediaRecorder`).
- Izin: `NotAllowedError`/`SecurityError` → `AppError('PERMISSION_DENIED')` dengan pesan persis PRD §29; gagal lain → `RECORDING_FAILED`. State `error` membawa `errorCode`/`errorMessage`.
- Registry `getRecordingEngine()` kini **singleton** yang selalu mengembalikan `WebRecordingEngine` — alih-alih menyimpan keputusan "tidak didukung" di memori (yang mengunci engine selamanya walau halaman dimuat ulang lewat HTTPS), engine jujur mengembalikan `isSupported()` dan `start()` melempar ALASAN spesifik dari `recordingDiagnostics.ts`.
- Penulisan chunk dua sisi lewat `modules/recording/persistChunk()`: file `Meetings/{id}/audio/000001.m4a` (OPFS) → metadata `AudioChunk` (DB). Dilangganan sekali di App (`useChunkPersistence`) sehingga tetap tersimpan walau pengguna meninggalkan layar Rekam; gagal tulis → toast (tidak diam-diam).
- RecordingPage: mulai → status meeting `RECORDING` + `startTime`; berhenti → `PROCESSING` + `durationSeconds` + toast jumlah chunk & durasi.
- Test +3 file / +11 test: engine (timeslice, pause/resume timeline, izin ditolak, guard aksi, track dimatikan, jujur tanpa MediaRecorder), persistChunk (path, urutan, error menyebar), RecordingPage (status siap, kondisi jujur di jsdom).
- **Deviasi (disepakati):** sisi Android Batch 04 — Capacitor scaffold, `ForegroundService`, notifikasi, permission native — **DITUNDA ke Batch 14** karena mesin pengembangan tidak punya Java/Android SDK (tidak bisa diverifikasi). DoD Batch 04 dipenuhi sebagai "rekam nyata di web".

### Ringkasan eksekusi Batch 05

- **Manifest chunk** (`Meetings/{id}/audio/manifest.json`, `modules/recording/manifest.ts`): skema Zod ber-versi, upsert per sequence, JSON korup/versi asing/rapat salah → `null` (jujur, tidak melempar).
- **Urutan persist aman-crash**: manifest → file → metadata DB (`persistChunk.ts`). Semua kondisi crash bisa dipulihkan tanpa menebak timeline; kontrak baru: `StorageProvider.list(dir)` (rekursif, `[]` bila direktori belum ada), `AudioChunkRepository.delete(id)`, `RecordingChunkEvent.chunkDurationSeconds`.
- **Recovery** (`recovery.ts`, dipanggil sekali saat aplikasi dibuka lewat `useRecoverMeetings`, tidak memblokir UI, dilewati bila storage tak tersedia/ada rekaman aktif): file = sumber kebenaran — entri manifest tanpa file dibuang; metadata DB tanpa file dihapus; file+manifest tanpa DB → diadopsi; file+DB tanpa manifest → manifest dibangun ulang; file tanpa jejak → **dibiarkan utuh + dilaporkan** (tidak mengarang timeline). Idempoten (diuji panggil dua kali).
- **Storage penuh → stop aman**: `QuotaExceededError` dipetakan ke `AppError('STORAGE_FULL')` (di OPFS provider & persistChunk); `useChunkPersistence` menghentikan rekaman lewat **`stopRecordingSafely`** (jalur yang sama dengan tombol Berhenti; idempoten, meeting → `PROCESSING` + durasi); tombol Mulai menolak saat `evaluateStorage = insufficient`. Antrean promise menyerialisasi persist antar chunk.
- Test +3 file / +21 test: recovery (8 kasus crash/orm/idempoten/orphan/korup), manifest (roundtrip/upsert), `stopRecordingSafely`, persistChunk diperluas (crash window manifest↔file↔DB + mapping kuota), `StorageProvider.list` jujur di jsdom, delete 1 chunk di Dexie.

### Ringkasan eksekusi Batch 06

- **Keputusan mesin STT (user):** Whisper in-browser via `@huggingface/transformers` (WASM + onnxruntime), model `Xenova/whisper-tiny` (~40 MB q8, diunduh sekali lewat jaringan lalu di-cache oleh Cache API). Web Speech API ditolak karena tidak bisa membaca file. `VITE_SPEECH_PROVIDER` default `whisper-web` (Whisper = provider default).
- **Kontrak transkripsi additive** (semua tambahan non-breaking): `TranscribeRequest.sequenceOffset?` (sequence dilanjutkan dari transkrip yang sudah ada); `AudioChunk.transcriptionStatus/transcriptionAttempts/transcriptionError?/transcribedAt?`; `AudioChunkRepository.listPendingTranscription()`; status meeting `TRANSCRIBING` (Batch 02 sudah ada) kini benar-benar dipakai.
- **Antrean offline** (`modules/transcription/`): `processPendingTranscription` — kelompok per meeting, urut sequence; transkripsi HANYA saat tidak sedang merekam; run tunggal via lock; retryable → chunk kembali `PENDING` tanpa menambah `transcriptionAttempts`; non-retryable (codec) → `FAILED` lalu lanjut chunk berikutnya; maksimum 3 percobaan; `PROCESSING` basi (crash) dipulihkan; akhir: sisa non-DONE → meeting `PROCESSING_ERROR`, selain itu `TRANSCRIPT_READY` (lanjut ke tahap ringkasan/notulen di `pipeline/runPipeline.ts`). `PROVIDER_UNAVAILABLE` / rekam aktif / tidak ada antrian → skip tanpa mengubah data & tanpa menambah percobaan.
- **Pemicu:** `stopRecordingSafely` (tombol Berhenti & auto-stop storage penuh) memicu `runPipeline` fire-and-forget; `usePipelineScheduler` menjalankan interval 15 dtk + event `online` + pemicu setelah `recoveryGate`. (Sebelum BUGFIX: `runTranscription` + `useTranscriptionQueue` — hanya 2 pemicu, tanpa retry.)
- **Whisper provider** (`providers/whisper/`): worker ES (`worker.format: 'es'`) untuk inferensi; decode audio di main thread (`decodeAudioToPcm16k`: AudioContext + resample `OfflineAudioContext` ke 16 kHz mono; decode gagal → `TRANSCRIPTION_FAILED` retryable:false); payload `Float32Array` di-transfer (zero-copy); antrean serial dalam satu worker; mapping segmen murni & teruji (`mapWhisperChunksToSegments` — offset timeline meeting, clamp tepi window, sequence kontigu).
- **Jujur di lingkungan tak didukung:** `isAvailable()`/`transcribeChunk` → `PROVIDER_UNAVAILABLE` sebelum menyentuh storage (jsdom tanpa AudioContext → false, diuji).
- **PWA:** WASM onnxruntime (~26 MB) TIDAK di-precache — diunduh saat transkripsi pertama lalu disimpan di Cache Storage (`runtimeCaching` CacheFirst `notula-wasm`); bundle `transformers.web` (545 kB) masuk precache karena dibutuhkan transkripsi offline.
- **UI:** `TranscriptTab` banner status (`role="status"`) dari `PIPELINE_MESSAGES` (persis PRD): "Menyimpan audio…", "Menyiapkan transkripsi…", "Sedang mengubah suara menjadi teks…", "Transkrip selesai. Membuat ringkasan AI…", "Menyiapkan notulen…" + reload berkala 2,5 dtk selama `shouldPollMeeting`; `PROCESSING_ERROR` → pesan gagal + tombol **↻ Coba Lagi**; legacy `PROCESSING` tanpa segmen → "menunggu diproses".
- **Migrasi Dexie v2:** kolom transkripsi per chunk dengan `.upgrade()` backfill (`PENDING`, attempts 0) — data lama tidak berubah (diuji membuka DB v1 buatan test dengan skema aplikasi).
- **Deviasi / batasan Batch 06 (jujur):**
  1. Butuh internet **1x** untuk unduh model (~40 MB) + WASM (~26 MB); setelah itu transkripsi penuh offline (cache browser/Cache Storage).
  2. Latensi **batch** (antrean saat idle), bukan teks live 5–10 detik seperti PRD §11 — live transcription jadi pertimbangan batch terpisah bila diminta.
  3. `TranscribeRequest.dictionary` diteruskan ke provider tetapi **whisper-tiny tidak memakainya** (tanpa prompt tokenisasi) — jangan mengklaim kamus memengaruhi hasil Whisper.
  4. Akurasi `whisper-tiny` ~40 juta parameter: cukup untuk bukti jalur, model lebih besar bisa ditukar lewat `VITE_WHISPER_MODEL_ID` bila nanti didukung (nama file model belum diekspor ke env — lihat `whisperProtocol.ts`).
- Test +5 file / +29 test: `transcriptionQueue` (12: sukses, idempoten, rekam aktif, provider unavailable, retryable, gagal permanen, cap attempts, PROCESSING basi, sequence lanjut, DRAFT disentuh, healing), `mapSegments` (6), `whisperWeb` jujur (4), migrasi Dexie v1→v2 (2), `TranscriptTab` banner (5).

### Ringkasan eksekusi Batch 07

- **Satu state player** (`modules/audio/playerStore.ts`, zustand): `currentTime/playing/loading/duration/error` + aksi `attach/detach/playFrom/toggle/seek/pause` — bar player, baris transkrip, dan hasil pencarian membaca state yang sama (PRD §12). `HTMLAudioElement` singleton di luar React; event `timeupdate/play/pause/ended/error` memperbarui store via `setState` store (bukan setState React — aman aturan hooks).
- **Timeline lintas-chunk** (`modules/audio/timeline.ts`, murni): rapat = banyak file 5 menit; `buildChunkTimeline` urut sequence; `resolveChunkAt` tahan gap antar file (end N < start N+1) & posisi tepat di akhir rekaman; `findNextChunk` → `ended` file otomatis lanjut chunk berikutnya (rekaman utuh); `findActiveSegment` (start ≤ t < end) untuk sorotan. Seek: detik timeline → chunk yang membawahi → `readBlob` → offset di dalam file chunk (`el.currentTime = t − span.start`), ganti chunk → `revokeObjectURL` lama; token anti-race untuk klik cepat-ganda; semua kegagalan → pesan ramah §29 (jujur, tidak pura-pura jalan).
- **UI**: `AudioPlayerBar` (tombol Putar/Jeda, waktu `sekarang / total`, slider seek, keterangan "Memuat…", `role="alert"` utk error) dirender `MeetingDetailLayout` di ATAS `<Outlet/>` → bar tampil di semua tab rapat; layout juga `attach` timeline (chunks dari DB) + `detach` saat pindah rapat/unmount.
- **Transkrip ↔ audio**: baris segmen jadi `<button>` (klik kalimat → `playFrom(startTime)` — PRD §12.1); sorotan `aria-current` + lencana "● sedang berjalan" dari `currentTime` (PRD §12.2) + auto-scroll `scrollIntoView` saat sedang bermain; klik hasil pencarian = baris yang sama → lompat timestamp (PRD §12.3). Footer diselaraskan: "Ketuk kalimat untuk melompat ke posisi audio".
- **Test-only hook**: `setAudioElementFactoryForTests` + `resetPlayerForTests` (jsdom tidak memutar audio; fake element di `tests/helpers/fakeAudioElement.ts` meniru play/pause/ended/timeupdate) + stub `URL.createObjectURL`.
- **Deviasi / catatan Batch 07:**
  1. Slider seek bila sedang dijeda hanya memajukan posisi STATE; file chunk diganti saat berikutnya diputar (tidak preload diam-diam) — hemat I/O.
  2. Auto-scroll hanya saat audio berjalan (bukan saat pause/seek) agar papan skor tidak "lompat" tanpa suara.
  3. Gap antar file chunk (beberapa ms antar timeslice) tetap ada — `resolveChunkAt` memilih chunk berikutnya; kehalusan gap jadi urusan merging file (bila perlu, batch export/buffer).
- Test +4 file / +35 test: `timeline` (8), `playerStore` (13: play/ganti-chunk/ended-lanjut/ended-akhir/error jujur/timeline kosong/seek-jeda/seek-ganti-chunk/toggle/timeupdate/detach/pindah-rapat), `AudioPlayerBar` (6: sembunyi tanpa audio, waktu, putar-jeda, slider, error, loading), `TranscriptTab` +4 (klik segmen, sorotan aria-current, di luar segmen, klik hasil cari), `MeetingDetailLayout` (2: attach+bar, tanpa audio).

### Ringkasan eksekusi Batch 08

- **Provider diarization `vad-local`** (`src/providers/vad/`, default `VITE_DIARIZATION_PROVIDER`): VAD energi RMS adaptif (persentil dasar dibatasi `peak×0.6` agar suara konstan tanpa jeda tetap lolos) → giliran bicara (jeda ≤ 300 ms disatukan, giliran < 150 ms dibuang sebagai noise) → fitur akustik per giliran (ZCR + spectral centroid via FFT radix-2 Hann) → single-linkage clustering (jarak ZCR/0.15 + selisih oktaf/1.5, di atas 8 cluster dipaksa merge pasangan terdekat) → kode `speaker_1..N` **urut kemunculan pertama**. `isAvailable()` butuh Web Audio (jsdom → `false` jujur).
- **Pipeline `modules/speakers/runDiarization.ts`**: scan rapat `COMPLETED`; dilewati bila semua segmen sudah ter-assign (tanpa decode ulang audio), provider tak tersedia, tanpa transkrip, audio tak terbaca (`NO_AUDIO`), atau sedang merekam (`RECORDING`). Per-chunk `identifySegments` → offset timeline (`toTimelineTurns`) → upsert pembicara **by code mempertahankan `displayName` lama** (rename pengguna permanen, PRD §13), baru → `Pembicara {N}`; assign `segment.speakerId` dengan overlap maksimum (seri → mulai lebih dulu; tanpa overlap → `null`, tidak menebak); `durationSeconds`/`segmentCount` SELALU dihitung ulang dari transkrip. Diringkas dari `runTranscription` (fire-and-forget, satu run berkat lock, tanpa toast agar tidak menumpuk).
- **UI `SpeakersTab` (PRD §13–14)**: banner edukasi "dipisahkan berdasarkan suara, bukan identitas otomatis"; rename inline (input `aria-label` "Nama pembicara baru", nama kosong diabaikan); baris `Durasi mm:ss • N% • M segmen` (persentase relatif total durasi pembicara); tombol "+ Tambah Pembicara"; keadaan kosong jujur ("Daftar … muncul setelah transkripsi dan diarization selesai").
- **Deviasi / batasan Batch 08 (jujur):**
  1. Diarization = heuristik AKUSTIK lokal (VAD + spektrum), **bukan model ML** — pemisahan kualitatif & bervariasi per rekaman; **tidak pernah mengklaim identitas orang** (PRD §13) — nama hanya manual pengguna.
  2. Tanpa operasi merge/split manual di UI (rename saja, sesuai scope DoD) — cluster salah pisah hanya bisa diperbaiki dengan rename bila isinya sudah benar; kalau perlu, fitur merge jadi kandidat batch lanjutan.
  3. Dijsdom Web Audio tak ada → provider `isAvailable() false` → skip jujur; decode audio diuji lewat fake provider (bukti jalur `readAudio`), bukan decode nyata.
  4. Pembicara default memakai **kode** `speaker_N` (urut kemunculan), nama tampilan `Pembicara {N}` berdasar jumlah entri — kode tidak di-renumber ulang saat ada rename/penghapusan.
- Test +5 file / +29 test: `detectSpeakers` (6: bisu→[], satu suara, dua frekuensi bergantian→2 kode urut, jeda pendek→gabung, giliran sesaat dibuang, sinyal < frame), `assignSpeakers` (7: offset turn, overlap maks/seri/null, statistik, urut kode), `runDiarization` (9: assignment penuh, idempoten tanpa decode, rename selamat saat run ulang, provider unavailable, sedang rekam, tanpa segmen, audio hilang, rapat belum COMPLETED), `SpeakersTab` (5: kosong, rename persist + toast, durasi/"/%"/segmen, tambah, nama kosong diabaikan), `vadDiarization` (2: `isAvailable false` di jsdom, id stabil).

### Ringkasan eksekusi Batch 09

- **Provider `extractive`** (`src/providers/extractive/`, default `VITE_AI_PROVIDER`): ringkasan AI **ekstraktif lokal offline** mengikuti pipeline PRD §15 — kalimat transkrip → skor salience (frekuensi kata bermakna × IDF ÷ akar panjang kalimat) → paragraf ringkasan (top 1–4 kalimat, urut timeline); frasa dua kata bermakna → Pokok Pembahasan; pola kalimat ID → Keputusan / Tindak Lanjut / Pertanyaan / Hal yang Belum Diputuskan; **PIC** = nama pembicara yang disebut literal di kalimat tugas; **Deadline** = pola tanggal/hari ID (`besok`, `Jumat`, `10 Oktober`, `10/10`, `2026-10-10`, dst). Tanpa jaringan, tanpa API key, deterministik.
- **Anti-hallucination guard** (`guard.ts`, kontrak `AISummarizationProvider`): `validateSummaryResult` memverifikasi setiap `sourceTimestamp` keputusan/pertanyaan terhadap rentang segmen transkrip (toleransi 0,5 dtk) — item dengan sumber di luar transkrip **dibuang** (log warning), action item tanpa sumber sah kehilangan timestamp-nya; `undecided` kosong → "Tidak disebutkan dalam rapat.".
- **Traceability**: setiap keputusan & tindak lanjut menyimpan `sourceTimestamp` + `sourceSegmentId` (diaudit ke audio, PRD §12); `SummaryTab` kini juga mengisi `sourceSegmentIds` pada entity Summary (sebelumnya kosong) dan me-reload keputusan/tindak lanjut setelah ringkasan dibuat (bug: hasil tersimpan tapi tidak tampil tanpa refresh).
- **Registry & konfigurasi**: `getAISummarizationProvider` default → `ExtractiveAISummarizationProvider` (`case 'extractive'`); `local-dev` tetap jujur (`isAvailable false`); `server` reserved Batch 12. `.env.example` menjelaskan pilihan & batasan.
- **Deviasi / batasan Batch 09 (jujur):**
  1. **Ekstraktif, bukan LLM generatif**: ringkasan = kalimat asli terpilih, bukan parafrase; keputusan/tugas hanya kalimat yang cocok pola Indonesia (false positive/negative mungkin terjadi — hasil SELALU dapat ditelusuri ke transkrip & bisa dikoreksi manual).
  2. PIC hanya terdeteksi bila **nama pembicara disebut literal** di kalimat; deadline hanya pola tanggal/hari umum ID — jika tidak ada → `undefined` → UI "Tidak disebutkan dalam rapat." (PRD §52.15 "jika disebutkan").
  3. Pertanyaan dihitung dari `?` / kata tanya ID, tetapi **tidak disimpan** ke repository (entity Summary tidak punya wadahnya) — dipakai nanti oleh notulen Batch 10.
  4. Transkrip murni tandaputus/tanpa pola → daftar keputusan/tugas kosong (tidak dipaksakan), placeholder jujur.
- Test +5 file / +30 test: `text` (7: split kalimat, stopword, contentWords, countBy, tidy), `extractSummary` (10: traceability keputusan, PIC+deadline, pertanyaan, undecided ≠ keputusan, ringkasan & topik dari transkrip, kosong→placeholder, tanpa pola→kosong, deterministik, urutan sequence), `guard` (6: buang sumber di luar transkrip, lepas timestamp, toleransi batas, tanpa segmen, placeholder, tanpa yang dibuang), `extractiveSummary` (4: offline available, registry default, semua sumber dalam rentang, deterministik), `SummaryTab` (3: tanpa transkrip→tombol mati, simpan+keputusan bertimestamp, tampil PIC/deadline di layar).

### Ringkasan eksekusi Batch 10

- **`MinutesGenerator`** (`modules/minutes/generator.ts`, murni): `generateMinutes({meeting, summary, decisions, actionItems, templateId})` → 7 section persis urutan PRD §17 — AGENDA (deskripsi rapat, tanpa deskripsi → kosong/jujur), PEMBAHASAN (pokok ringkasan; fallback paragraf), KEPUTUSAN (konten + `(sumber: jam)`), TINDAK LANJUT (tugas + sumber), PENANGGUNG JAWAB (`PIC — tugas`, hanya yang punya PIC), DEADLINE (`tanggal — tugas`, hanya yang punya deadline), CATATAN (hal yang belum diputuskan). Section kosong → `lines: []` → UI "Tidak disebutkan dalam rapat.".
- **8 template PRD §18** (`templates.ts`): Umum, Dinas, Sekolah, Rapat Guru, Evaluasi, Koordinasi, Proyek, Custom — template mengatur **judul section** (mis. Proyek → "PROGRES & PEMBAHASAN", "RISIKO & CATATAN"; Evaluasi → "TEMUAN & KEPUTUSAN"); template tak dikenal → fallback Notulen Umum.
- **UI `MinutesTab`**: dropdown "Template notulen" (8 opsi, pilihan tersimpan ke `meeting.minutesTemplateId`), tombol "✨ Buat Notulen" (aktif bila ada transkrip/ringkasan) → simpan via `minutes.save` (upsert) + toast sukses; setelah ada → tombol "↻ Buat Ulang Notulen" (regenerate dengan template terpilih — memungkinkan ganti template). Pilihan template sebelumnya sudah dapat dipilih lebih awal.
- **Action items**: memakai hasil ekstraksi Batch 09 (`actionItems` repo, PIC & deadline terdeteksi dari transkrip) — bagian PENANGGUNG JAWAB/DEADLINE notulen membaca langsung dari situ (PRD §52.15).
- **Deviasi / catatan Batch 10:**
  1. PRD §18 tidak merinci perbedaan isi antar template → implementasi: template = variasi judul section; **isi selalu sama & murni dari data rapat** (tidak mengarang).
  2. "Template Custom" = judul standar (penyuntingan judul/kustomisasi lanjutan belum ada — kandidat Batch 13 bila perlu).
  3. Regenerate menimpa notulen lama (upsert by `meetingId`) — versi lama tidak disimpan (tidak ada riwayat versi di PRD).
- Test +2 file / +16 test: `generator` (12: urutan §17, judul umum, agenda multi-baris, pembahasan topik, keputusan berjam, tindak lanjut/PIC/deadline terpisah, catatan=undecided, tanpa bahan→kosong, tanpa deskripsi→agenda kosong, template proyek, fallback template, 8 label PRD §18), `MinutesTab` (4: tanpa bahan→tombol mati + 8 template, buat→tersimpan 7 section + keputusan berjam + heading, pilih proyek→judul + `minutesTemplateId` rapat, buat ulang→template berubah & section lama terganti).

### Ringkasan eksekusi Batch 11

- **Tanpa dependensi baru** — semua penulis berkas ditulis sendiri di `modules/export/format/`:
  - `zip.ts`: arsip ZIP mode STORE + CRC-32 standar (vektor "123456789" = `0xCBF43926`) — dasar DOCX & XLSX.
  - `pdf.ts`: PDF 1.4 murni (Catalog/Pages/Page, content stream per halaman, Helvetica + Helvetica-Bold WinAnsi, word-wrap, paginasi A4, escape `()\<>`, teks disaring Latin-1 sehingga offset xref akurat).
  - `docx.ts`: `[Content_Types].xml` + `_rels/.rels` + `word/document.xml` (1 baris = 1 paragraf, XML escape) → dapat diedit di Word/LibreOffice (§19.2).
  - `xlsx.ts`: workbook + N worksheet `inlineStr` (sheet name dibersihkan ≤31 char), fallback satu sheet "Data" bila tak ada tabel.
- **`contentBuilder.ts`** (PRD §19): PDF/DOCX → dokumen §19.1 (identitas, peserta, ringkasan, 7 section notulen — ikut `minutes` bila sudah ada, kalau belum disusun ulang via `generateMinutes`); TXT → transkrip sederhana §19.3 (`HH:MM:SS — Nama`, urut sequence); XLSX → tabel Tindak Lanjut (Tugas/PIC/Deadline/Status/Sumber) + Keputusan + Pembicara (% durasi).
- **`LocalExportProvider`** (`providers/export/localExport.ts`, id `local-export`, via `getExportProvider()`): `supports` PDF/DOCX/TXT/XLSX benar, CSV → `AppError('PROVIDER_UNAVAILABLE')`; mime & nama file per format (`Judul YYYY-MM-DD.ext`, karakter berbahaya dibersihkan).
- **UI `ExportTab` aktif**: klik format → load data paralel → `buildExportRequest` → `provider.export` → unduhan nyata via `URL.createObjectURL` + anchor (`triggerDownload`) → salinan ke OPFS `Meetings/{id}/exports/` → entri riwayat (`exports.add` dengan `byteSize`) → toast sukses; tombol terkunci selama proses; kegagalan → `friendlyMessage`.
- **Deviasi / catatan Batch 11:**
  1. Penulis PDF/ZIP/OOXML dibuat manual (bukan library `pdfkit`/`jszip`/`exceljs`) demi nol dependensi baru — keterbatasan: teks Latin-1 (non-Latin → `?`), ZIP tanpa kompresi (ukuran ~sedikit lebih besar), tanpa gambar/gaya lanjutan.
  2. CSV ada di kontrak `ExportFormat` tetapi **tidak ditawarkan** di UI (PRD §19 hanya mewajibkan PDF/DOCX/TXT + XLSX sebagai tambahan) → `supports('CSV')` jujur `false`.
  3. Salinan ke OPFS bersifat **best-effort**: unduhan browser adalah sumber utama; bila OPFS tak tersedia, file tetap terunduh dan entri riwayat tercatat dengan `localPath: ''` (jujur, bukan path palsu).
  4. TXT = transkrip teks (§19.3), bukan salinan notulen; PDF/DOCX = dokumen notulen lengkap (§19.1); XLSX multi-sheet.
- Test +7 file / +39 test: `zip` (6: CRC vektor, magic PK local/central/EOCD, metode STORE, CRC konsisten, konten utuh), `pdf` (5: header/xref/trailer akurat, wrap, multi-halaman `/Count`, sanitasi Latin-1, escape kurung), `docx` (4: magic+mime, paragraf per baris, rels lengkap, XML escape), `xlsx` (6: mime, workbook sheet, inlineStr, escape, fallback, nama berbahaya), `contentBuilder` (9: §19.1 lengkap, tempat/peserta jujur, ikut notulen, TXT timestamp+urut, tabel tugas/PIC, keputusan+pembicara, mapping format, nama file), `localExport` (5: supports/CSV menolak, mime+ekstensi 4 format, blob ZIP/PDF nyata, TXT utuh, `PROVIDER_UNAVAILABLE`), `ExportTab` (4: tanpa bahan→mati, PDF sukses+riwayat, XLSX sukses, kunci tombol saat proses).
- Perbaikan stabilisasi: test `MinutesTab` "buat ulang" memakai `findByRole` (sebelumnya `getByRole` sempat flaky menunggu reload).

### Ringkasan eksekusi Batch 12

- **Kontrak `SyncProvider` + `SyncPayload`** (`core/types/providers.ts`): `isAvailable()` jujur, `upload(payload)`; payload dibuat dari VERIFIKASI data lokal — selaras docstring `StorageProvider`: SAVE LOCAL → VERIFY LOCAL → UPLOAD (PRD §10, §25).
- **`SyncQueueRepository.listAll()`** ditambahkan (interface + memory + dexie) untuk statistik & layar status.
- **`HttpSyncProvider`** (`providers/http/sync.ts`): pemetaan endpoint PRD §39 (`/api/meetings`, `audio-chunks`, `transcript`, `summarize`, `export`); JSON utk metadata/teks/AI, `FormData` utk audio (metadata chunk + file); non-2xx / fetch gagal → `NETWORK_ERROR` `retryable`; tanpa `VITE_API_BASE_URL` → `isAvailable() === false` + `PROVIDER_UNAVAILABLE` (bukan sukses palsu).
- **`syncEngine`** (`modules/sync/syncEngine.ts`, murni, deps di-inject):
  - `enqueueMeetingSync` — idempoten (kunci `kind:entityId` status PENDING/UPLOADING/RETRY tidak diduplikasi; SUCCESS boleh masuk ulang utk data terbaru; FAILED ditangani `retryFailed`) dan **verifikasi lokal per entitas**: meeting wajib ada; transcript butuh segmen; summary harus ada; audio wajib file-nya ada di storage (OPFS tak tersedia → semua audio dilewati, jujur); export wajib `localPath` terisi; rapat tak ada → `NOT_FOUND`.
  - `buildPayload` — **verify ulang tepat sebelum upload** (data dibaca segar dari repository/storage; entitas hilang → `NOT_FOUND`, bukan payload kosong).
  - `processQueue` — provider belum siap / offline → semua tetap `PENDING` + `reason` (`provider_unavailable`/`offline`), tanpa membakar attempts; sukses → `SUCCESS`; gagal → `markFailed` (attempts+1, `lastError` = pesan ramah).
  - `retryFailedSync` (FAILED → RETRY → proses ulang), `syncMeetingIfEnabled` (hanya `device_cloud`), `attachOnlineSync` (listener `online` → proses antrean).
- **Perangkai aplikasi** (`modules/sync/autoSync.ts`): `maybeSyncCompletedMeeting` dipanggil `transcriptionQueue` di dua titik status `COMPLETED` (proses normal + `healStuckMeetings`) — no-op pada default "Hanya Perangkat"; `useAutoSync()` didaftarkan di `AppShell` (event `online` → `runPendingSync`).
- **UI `SettingsPage`**: kartu "Sinkronisasi Cloud" — teks jujur mode aktif + ketersediaan backend (`VITE_API_BASE_URL`) + status online, statistik antrean (Menunggu/Berhasil/Gagal), tombol "Sinkronkan Sekarang" (hanya aktif bila Perangkat + Cloud ∧ backend siap ∧ online) yang mendaftarkan semua rapat lalu memproses antrean, dan "Coba Lagi (n)" utk item gagal. Default tetap **Hanya Perangkat** (PRD §25); mode lewat settings store.
- **Deviasi / catatan Batch 12:**
  1. Lingkungan ini tidak punya backend → DoD "upload" diuji lewat kontrak HTTP nyata + stub `fetch` (URL/method/body/status), bukan e2e ke server sungguhan; tanpa `VITE_API_BASE_URL` antrean **menunggu dengan jujur** (bukan gagal/gagal palsu).
  2. Upload `export` = **metadata dokumen saja** (blob file ekspor tidak ikut — belum ada endpoint unduhan di PRD §39; salinan lokal tetap di OPFS).
  3. Provider `server` (AI/STT/diarization) **tetap ditahan** — butuh backend LLM/STT nyata; tetap reserved.
  4. "Hapus data cloud" tidak ada di PRD §26 (yang wajib: hapus rapat/audio/transkrip/AI dari perangkat — sudah ada) → tidak dibuat antarmuka hapus remote.
- Test +4 file / +31 test: `syncEngine` (16: enqueue idempoten & verifikasi, audio ada/tanpa file, OPFS mati, NOT_FOUND, payload segar, provider unavailable/offline tetap PENDING, sukses, gagal+retry, ifEnabled device/device_cloud, attach online), `http/sync` (8: endpoint §39, isAvailable, tolak tanpa base, URL/method/body, FormData audio, 500 retryable, fetch gagal), `autoSync` (4: no-op mode device, antrean jujur bila cloud, runPendingSync reason, deps default), `SettingsPage` (3: kartu+statistik+jujur, mode cloud tak mengaktifkan tombol tanpa backend, Coba Lagi → toast jujur + item RETRY).

### Ringkasan eksekusi Batch 13

- **Consent notice (PRD §27, AC §52 #2):** `RecordingPage` menampilkan pemberitahuan persetujuan rekaman (teks persis PRD §27) ketika `consentAccepted` masih `false` — mis. pengguna membuka halaman rekam langsung via URL — dan menonaktifkan tombol "MULAI REKAM" sampai dicentang. (Sudah ada di `CreateMeetingPage` Batch 02; kini berlaku di semua jalur.)
- **Hapus data terpisah (PRD §26, AC §52 #19):** `deleteMeetingDataKind()` (`modules/storage/manageMeetingData.ts`) — `audio` (file folder `audio/` + baris chunk; OPFS tak tersedia = memang tidak ada file), `transcript` (segmen), `ai` (ringkasan + keputusan + tindak lanjut + notulen + pembicara). File dulu → gagal storage = metadata tidak disentuh. UI: tiga tombol di "Zona Berbahaya" `ExportTab` (konfirmasi + toast jujur `Tidak ada … yang tersimpan` bila 0).
- **Koreksi transkrip (PRD §43, AC §52 #16):** `TranscriptRepository.deleteSegment()` baru (interface + memory + dexie); `TranscriptTab` panel edit per baris (✏️): teks (textarea), pembicara (select), timestamp mulai/akhir (detik), Simpan/Batal, **Hapus** segmen, **Gabung** dengan segmen berikutnya, **Pecah** di kursor (fallback spasi terdekat dari tengah; batas waktu proporsional, `sequence + 0.5`); penanda `✎ diedit` via `editedAt` yang sudah diset repo.
- **Audit log lokal (PRD §26/§48):** `modules/security/auditLog.ts` — localStorage, maks 500 entri, field `action/meeting/timestamp/device` (format §48), JSON korup → mulai kosong tanpa crash. Dicatat: ekspor per format, hapus rapat, hapus per-jenis, hapus semua data, bersihkan riwayat. Tampil di SettingsPage kartu **"Riwayat Keamanan"** (8 entri terbaru + Bersihkan).
- **Suite acceptance `src/app/acceptance.test.tsx` — 20 test, satu per kriteria PRD §52** (repo + komponen, tanpa mock backend): buat rapat; halaman rekam siap; pemulihan manifes chunk pasca-crash; chunk per urutan; lokal tanpa panggilan `fetch` (offline); timestamp segmen; klik → putar; highlight timeline; cari kata; pemisahan pembicara (`pickSpeakerCodeForSegment`); rename pembicara; ringkasan; keputusan bertimestamp; tindak lanjut; PIC+deadline; koreksi tersimpan (`editedAt`); notulen terbentuk; ekspor 4 format nyata; hapus data rapat; kegagalan AI (mock `summarize` reject) → transkrip & chunk utuh + summary tetap `null`.
- **Deviasi / catatan Batch 13:**
  1. AC §52 #3 (audio tetap direkam saat layar Android dikunci) diuji di web lewat mekanisme setaranya — chunk bertahan di manifes + `recoverMeeting` mengadopsinya; **foreground service Android = Batch 14**.
  2. AC §52 #2 dipastikan kesiapannya di jsdom (state `● SIAP MEREKAM`, tombol terkunci); `engine.start()` sungguhan membutuhkan MediaRecorder/mikrofon → uji perangkat.
  3. Keamanan server §26 (authentication, authorization, HTTPS, signed URL, encrypted storage, secure API, access control, session security) **ditunda ke backend** — aplikasi kini local-first tanpa backend; proteksi file lokal tetap: validasi path anti-traversal (`core/utils/paths`, Batch 04/05) + penghapusan berbasis repository.
  4. Audit log §48 disebut PRD "untuk versi organisasi" → implementasi **lokal** dulu (localStorage, `device` = platform perangkat, bukan IP); log terpusat menyusul bersama backend.
- Test +3 file / +43 test: `auditLog` (4), `manageMeetingData` (4), `TranscriptTab` +6 (edit/hapus/gabung/pecah/validasi/timestamp+speaker → 27), `RecordingPage` +3 (3 consent), `ExportTab` +4 (hapus per-jenis ×2, batal konfirmasi, hapus rapat + audit → 38), `SettingsPage` +2 (kartu audit → 9), **`acceptance.test.tsx` 20** — total **58 file / 366 test**.

### Ringkasan eksekusi Batch 14

- **Capacitor Android (warisan Batch 04):** `@capacitor/core@8.5.3` (dependencies) + `@capacitor/cli`/`@capacitor/android` (devDependencies); `capacitor.config.ts` (`appId: id.notula.assistent`, `webDir: dist`, latar `#F8FBFF`); `npx cap add android` + `npx cap sync android` sukses **tanpa Java** (copy template + web assets); scripts `android:sync` & `android:apk` (yang kedua butuh JDK/SDK).
- **Izin PRD §28 di `AndroidManifest.xml`:** `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS` + deklarasi service `foregroundServiceType="microphone"`.
- **Foreground service (PRD §7/§28):** `RecordingForegroundService.java` (notifikasi kanal rendah "Sedang merekam rapat — layar boleh dikunci.", `START_STICKY`, `FOREGROUND_SERVICE_TYPE_MICROPHONE` pada API 30+) + `RecordingServicePlugin.java` (`@CapacitorPlugin(name="RecordingService")`, metode `start`/`stop`) + `MainActivity.registerPlugin()` sebelum `super.onCreate()` (builder bridge).
- **Jembatan web:** `src/modules/recording/nativeService.ts` — `startNativeRecordingService()`/`stopNativeRecordingService()`; di browser/jsdom **no-op jujur** (`Capacitor.isNativePlatform() && isPluginAvailable` → `false`); dipanggil `RecordingPage` setelah `engine.start()` dan setelah `stopRecordingSafely()`. PWA (manifest + service worker + precache) sudah lengkap sejak Batch 01 — diverifikasi ulang lewat preview: `/`, `/manifest.webmanifest`, `/sw.js`, `/pengaturan` → 200.
- **Deviasi / catatan Batch 14:**
  1. ~~Kode native belum dikompilasi/diuji~~ → **SELESAI diverifikasi** (lanjutan Batch 14): JDK 21 (Capacitor 8/AGP 8.13 wajib JDK 21) + Android SDK 36 dipasang portable di `~/tools/jdk21` & `~/android-sdk` (tanpa sudo); `./gradlew assembleDebug` **BUILD SUCCESSFUL** (APK debug 12,7 MB, class `RecordingForegroundService`/`RecordingServicePlugin`/`MainActivity` ter-DEX); AVD **`notula-avd`** (API 36, google_apis x86_64, KVM) boot headless; APK diinstal & diuji end-to-end via WebView CDP: buat rapat → MULAI REKAM → **SEDANG MEREKAM berjalan**, HOME (background) 11 dtk → timer terus naik, notifikasi foreground `notula_recording`/id 8520 `ONGOING|FOREGROUND_SERVICE` aktif → "Berhenti" → notifikasi & service hilang. Build akhir: `npm run android:apk` (JDK 21 + `ANDROID_HOME`/`local.properties`).
  2. **Fix manifest Android**: WebView/Chrome menolak `getUserMedia` (`NotAllowedError`, log `cr_media: Requires MODIFY_AUDIO_SETTINGS and RECORD_AUDIO`) karena `MODIFY_AUDIO_SETTINGS` tidak ada di manifest — ditambahkan (normal-time permission, tanpa dialog); tanpa ini rekaman mikrofon tidak jalan sama sekali di build Android.
  3. Ditemukan & diperbaiki **race test** (bukan bug aplikasi): tombol Zona Berbahaya `disabled={!meeting}` dan "Buat Ringkasan" `disabled={!canSummarize}` — test mengklik sebelum data selesai dimuat sehingga klik jadi no-op dan toast tidak pernah muncul (flaky, sempat diduga overload). Perbaikan: `waitFor(() => expect(button).toBeEnabled())` sebelum `fireEvent.click` pada `ExportTab.test.tsx` (4 test) dan `acceptance.test.tsx` #20 — bukan sekadar menaikkan timeout.
  4. `.gitignore` & ESLint ignores ditambah `android/` (kode native di luar scope lint JS/TS; aset hasil `cap sync` = generated).
- Test +1 file / +3 test: `nativeService` (no-op web: tidak tersedia, start=false, stop=false) — total **59 file / 369 test**.

---

### Ringkasan eksekusi — BUGFIX Auto Transcription Pipeline

**Gejala:** setelah ■ SELESAI, audio terkunci di status `PROCESSING` tanpa
transkrip; pengguna harus membuka tab Transkrip dan kadang menekan tombol
manual; kegagalan diam-diam.

**Akar penyebab (audit):**

1. **Race:** `stopRecordingSafely` memanggil transkripsi sebelum `persistChunk()`
   final selesai → `listPendingTranscription()` = 0 → `NO_PENDING` → tidak ada
   yang dikerjakan.
2. `healStuckMeetings` hanya memulihkan `TRANSCRIBING`; meeting `PROCESSING`
   jadi dead-end selamanya.
3. Hanya ada 2 pemicu (saat buka aplikasi + saat berhenti), tanpa interval &
   tanpa retry.
4. Lock `activeRun` di `runTranscription` mengembalikan promise LAMA → pemicu
   baru terbuang.
5. Ringkasan & notulen **manual-only** — tidak pernah ditarik setelah transkrip.
6. Tidak ada navigasi setelah stop; kegagalan ditelan `void …catch(() => undefined)`.
7. `TranscriptTab` hanya polling selama `TRANSCRIBING`.

**Model status baru** (`core/types/entities.ts`, legacy `PROCESSING`/`ERROR`
tetap dibaca untuk data lama tetapi tidak lagi ditulis):
`RECORDING → SAVING_AUDIO → TRANSCRIPTION_PENDING → TRANSCRIBING →
TRANSCRIPT_READY → SUMMARIZING → GENERATING_MINUTES → COMPLETED`, gagal →
`PROCESSING_ERROR` (transkripsi) atau `TRANSCRIPT_READY` + `pipelineError`
(ringkasan/notulen — transkrip tetap terbaca).

**Implementasi:**

- `modules/recording/chunkWriteChain.ts` (baru): antrean tulis chunk global
  (`enqueueChunkWrite` / `waitForChunkWrites` / `withChunkWriteWaitSkipped` /
  `drainChunkWrites`) — menutup race chunk terakhir **tanpa deadlock** saat
  handler storage-penuh berjalan di dalam rantai.
- `modules/recording/verifySavedAudio.ts` (baru): wajib lolos sebelum masuk
  antrean — ≥ 1 chunk, setiap file ada & `byteSize > 0` (tidak dibandingkan
  `chunkCount` supaya storage-partial tetap diproses). Gagal → `PROCESSING_ERROR`
  dengan pesan jujur, bukan "menunggu transkripsi" selamanya.
- `modules/recording/stopRecording.ts` (rewrite): `SAVING_AUDIO` → `engine.stop()`
  → tunggu antrean tulis → verifikasi → `TRANSCRIPTION_PENDING` (+ reset
  `pipelineAttempts`) → `runPipeline()` non-blocking.
- `modules/pipeline/pipelineStatus.ts` (baru): `MAX_PIPELINE_ATTEMPTS = 5`,
  `PIPELINE_INTERVAL_MS = 15_000`, `isActivePipelineStatus`,
  `shouldPollMeeting`, `PIPELINE_MESSAGES` (pesan persis PRD) & `failureMessage`.
- `modules/pipeline/runPipeline.ts` (baru): `executePipeline()` (dependency
  bisa disuntik untuk test) + `runPipeline()` single-flight + `retryPipeline()`
  - `resetPendingAttempts()`. Urutan: drain tulis → (lewati bila sedang rekam)
    → transkripsi → ringkasan → notulen → `COMPLETED` (+ `maybeSyncCompletedMeeting`)
    → diarization fire-and-forget.
- `modules/pipeline/usePipelineScheduler.ts` (baru, menggantikan
  `useTranscriptionQueue`): interval 15 dtk + event `online` (reset percobaan
  lalu jalankan) + pemicu setelah pemulihan chunk.
- `modules/summary/generateSummary.ts` & `modules/minutes/generateForMeeting.ts`
  (baru): SATU jalur dipakai tab manual DAN pipeline (tidak ada duplikasi).
- `modules/transcript/TranscriptTab.tsx`: polling pakai `shouldPollMeeting`,
  banner dari `PIPELINE_MESSAGES`, banner error + tombol **↻ Coba Lagi**
  (`retryPipeline`), pesan bila provider STT `isAvailable() === false`.
- `ui/StatusBadge.tsx`: label status baru + `text-[11px]` (batas UI).
- `RecordingPage`: navigasi `replace` ke `/rapat/{id}/transkrip` setelah stop
  sukses supaya proses terlihat.
- `providers/whisper/segmentAudio.ts` (baru): audio dipotong ≤ `MAX_SEGMENT_SECONDS`
  (120 s) di titik RMS paling tenang (±0.15 s), offset per potongan ditambahkan
  ke `WhisperTimestampChunk` sebelum digabung ke satu timeline. Potongan memakai
  `.slice()` (bukan `subarray`) karena buffer ditransfer ke worker.
- `speakers/runDiarization`: `isProcessable` kini `TRANSCRIPT_READY`/`COMPLETED`.

**Jujur / batasan:**

- STT tetap `whisper-web` (`whisper-web`, Xenova/whisper-tiny, WASM) — **tanpa
  API key**, tapi unduhan model pertama (~40 MB) + WASM (~26 MB) butuh internet;
  sesudahnya offline. Bila `isAvailable()` false, pipeline dilewati TANPA
  menambah hitungan percobaan dan UI menyebutkannya.
- Audio TIDAK PERNAH dihapus saat gagal; rapat gagal tetap muncul dengan status
  `PROCESSING_ERROR` dan tombol coba lagi.
- Test: **61 file / 386 test** (`runPipeline` 10, `stopRecording` 4,
  `segmentAudio` 5, ditambah pembaruan `transcriptionQueue` & `TranscriptTab`).

**Temuan dari uji NYATA (Chrome headless + mikrofon palsu, `pipeline_e2e.py`):**

1. **Transkripsi selalu gagal** dengan `Whisper did not predict an ending
timestamp…` → akar penyebab `force_full_sequences: true` di
   `providers/whisper/whisper.worker.ts`. Tokenisator transformers melempar error
   itu bila potongan terakhir berhenti di tengah kata; default pipeline sendiri
   adalah `false`. Diperbaiki ke `false`; pesan mentah model kini tidak pernah
   sampai ke layar (di-log di worker, dipetakan `friendlyWhisperFailure()` ke
   bahasa Indonesia, detail disimpan di `AppError.context.providerMessage`).
2. **Dead-end transkrip kosong:** semua chunk `DONE` tetapi tidak ada segmen
   (audio sunyi) → `finalizeMeetings` dulu `continue` diam-diam dan
   `healStuckMeetings` kembali menariknya ke `TRANSCRIPT_READY` tiap 15 dtk =
   loop tanpa ujung. Kini: `PROCESSING_ERROR` + `pipelineAttempts = MAX`
   (percobaan otomatis dimatikan) dan `heal`/`processMeeting` melewatinya.
3. **Tombol "Coba Lagi" tidak berarti** untuk kasus di atas → `retryPipeline`
   kini me-reset chunk ke `PENDING` bila transkrip kosong, jadi transkripsi
   benar-benar diulang.
4. **Banner error bisa kosong:** pesan provider `''` lolos ke UI
   (`pipelineError: ''` → `?? fallback` tidak aktif). Diperbaiki dengan
   `orFallback()` di `pipelineStatus.ts` (dipakai penulis & pembaca pesan).
5. **Bug instrumentasi, bukan aplikasi:** `innerText` mengikuti `text-transform`,
   jadi deteksi `StatusBadge` harus memakai `textContent`.

**Hasil uji akhir (audio bicara Indonesia 45 s, model sudah di-cache):**
stop → `SAVING_AUDIO` → `TRANSCRIPTION_PENDING` → `TRANSCRIBING` →
`TRANSCRIPT_READY` → `SUMMARIZING` → `GENERATING_MINUTES` → `COMPLETED`
dalam **±38 detik**, `pipelineAttempts = 0`, tanpa `pipelineError`;
5 segmen transkrip dengan timeline benar (0–45 s), ringkasan & notulen terisi
dari transkrip sungguhan. Kegagalan percobaan pertama (unduhan model dingin)
berhenti tepat di `PROCESSING_ERROR` setelah 5 percobaan dan pulih lewat
"Coba Lagi".

## Temuan dari uji MICROPHONE di Android Chrome (HTTPS)

**Gejala yang dilaporkan:** merekam dari HP tidak pernah jalan; UI hanya
menampilkan satu pesan generik _"Perangkat atau browser ini tidak mendukung
perekaman audio"_.

**Akar penyebab (terukur, bukan dugaan).** Halaman dibuka lewat
`http://192.168.100.16:4173` (IP LAN, HTTP) → `isSecureContext = false` →
`navigator.mediaDevices = undefined` → `getUserMedia` tidak ada, padahal
`MediaRecorder` TETAP ada. `WebRecordingEngine.isSupported()` karena itu false,
`getRecordingEngine()` memilih `UnavailableRecordingEngine`, dan pesan generik
itu satu-satunya yang sampai ke pengguna. Ringkasnya: **masalahnya bukan
mikrofon, tapi secure context** — Chrome hanya membuka API mikrofon di HTTPS
atau `localhost`.

**Perbaikan:**

1. `src/modules/recording/recordingDiagnostics.ts` (baru, murni fungsi):
   `describeUnsupportedEngine()` membedakan tiga penyebab (bukan secure context
   → suruh pakai HTTPS; `mediaDevices` hilang → API mic tak tersedia;
   `MediaRecorder` hilang) dan `describeRecordingFailure()` memetakan
   `NotAllowedError` / `NotFoundError` / `NotReadableError` /
   `OverconstrainedError` / `SecurityError` / `NotSupportedError` / `AbortError`
   ke kalimat yang bisa ditindaklanjuti (termasuk langkah memberi izin),
   dengan fallback ke `error.cause` bila pesan dibungkus. `null` bila penyebab
   tidak dikenal → pemanggil memakai pesan cadangan sendiri.
2. `webEngine.ts`: pesan `PROVIDER_UNAVAILABLE` kini memakai
   `describeUnsupportedEngine()`; kegagalan `getUserMedia`/`MediaRecorder`
   memakai `describeRecordingFailure()` + kode `AppError` yang tepat
   (`PERMISSION_DENIED` hanya untuk `NotAllowedError`/`SecurityError`);
   status `recording` + timer hanya dimulai pada event `recorder.onstart`
   (bukan saat tombol ditekan); `MediaRecorder` yang `start()`-nya melempar
   kini dibersihkan dan dilaporkan, bukan menggantung di `requesting_permission`.
3. `RecordingPage.tsx`: blok "tidak mendukung" memakai `role="alert"` dan
   `describeUnsupportedEngine()`; pesan kegagalan memprioritaskan
   `describeRecordingFailure(error)` di atas `friendlyMessage()`.
4. `providers/index.ts`: engine tidak lagi di-downgrade permanen ke
   `UnavailableRecordingEngine` (cache module-level mengunci keputusan itu
   selama hidup aplikasi). `stopRecording.ts`: chunk `0` →
   `PROCESSING_ERROR` + `AppError('RECORDING_FAILED')`, jadi status
   `SAVING_AUDIO` tidak pernah nyangkut untuk rekaman kosong.
5. **HTTPS:** `scripts/dev-certs.sh` (CA lokal + sertifikat SAN IP/DNS lewat
   `openssl`), `vite.config.ts` mengaktifkan `server.https`/`preview.https`
   lewat env `NOTULA_HTTPS=1`, npm scripts `certs` / `dev:https` /
   `preview:https`, `certs/` masuk `.gitignore`.
   Cara memasang CA di HP: **`docs/DEV-HTTPS.md`**.

**Hasil uji NYATA:**

- _Desktop (Chrome headless, `https://localhost:4173`, fake mic + audio bicara
  Indonesia 45 s):_ `isSecureContext = true`, `navigator.mediaDevices = object`,
  `getUserMedia = function`. Rekam 45 s → 1 chunk `00:00:45` → pipeline
  `COMPLETED` dalam ±87 detik sejak mulai merekam, transkrip/ringkasan/notulen
  terisi, tanpa `pipelineError`.
- _Android 16 (emulator, Chrome, `https://192.168.100.16:4173`):_ sertifikat
  dev **dipercaya tanpa warning** setelah CA dipasang sebagai _user
  credential_. Halaman rekam menampilkan `SIAP MEREKAM` (bukan pesan
  "tidak didukung") → izin Chrome muncul → izin OS `RECORD_AUDIO` muncul →
  status `SEDANG MEREKAM` dengan timer berjalan (00:00:44) dan waveform hidup.
  Stop → rapat tersimpan **00:00:47**, pemutar audio berfungsi (posisi
  berjalan 00:00:08/47), pipeline berjalan sampai badge **`SELESAI`** dengan
  transkrip bertimestamp dan tab Ringkasan terisi.

## 1. Hasil Audit Repository (Batch 01 — Tahap 1)

```text
Current Stack        : Tidak ada. Repo berisi 2 file statis.
Current Architecture : Prototype HTML single-file (vanilla JS) + PRD markdown.
Existing Features    : Mock UI home, record, transcript, summary, speakers, export;
                       navigasi bottom-nav, toast, warna brand sesuai PRD.
Missing Features     : Seluruh bagian nyata — build tooling, TypeScript, database,
                       recording sungguhan, chunking, background service,
                       transkripsi, search, diarization, AI, export, sync, security, test.
Potential Conflicts   : Prototype memakai data hard-coded & timer palsu (harus dipertahankan
                       sebagai referensi desain, bukan dihapus); PRD ada di root tetapi
                       master prompt merujuk docs/PRD-*.md; environment tidak punya
                       Java/Android SDK sehingga build APK tidak bisa di lingkungan ini.
Recommended Architecture : Lihat bagian 2–4.
```

---

## 2. Stack Terpilih

| Lapisan            | Pilihan                                              | Alasan                                        |
| ------------------ | ---------------------------------------------------- | --------------------------------------------- |
| App framework      | React + TypeScript (strict) + Vite                   | Cepat, stabil, cocok PWA & mobile-first       |
| Styling            | Tailwind CSS                                         | Sesuai kebutuhan UI Android-style biru, cepat |
| PWA                | `vite-plugin-pwa` (Workbox)                          | Offline shell, installable                    |
| Android shell      | Capacitor                                            | Satu codebase web + native foreground service |
| Local DB (web/PWA) | IndexedDB via Dexie                                  | Offline-first, typed, migration               |
| Local DB (Android) | SQLite via Capacitor plugin (setelah IndexedDB port) | Persistence kuat di Android                   |
| State              | Zustand + repository layer                           | Ringan, tidak bocor ke storage                |
| Validation         | Zod                                                  | Validasi input + runtime parsing provider     |
| Unit test          | Vitest + Testing Library                             | 1 cara test untuk unit & komponen             |
| Lint/format        | ESLint (typescript-eslint) + Prettier                | Type-aware lint, aturan `any` dilarang        |
| Backend (nanti)    | Service modular terpisah (batch 12)                  | Hanya untuk AI/sync/auth opsional             |

**Keputusan penting:** UI tidak boleh mengakses storage/DB langsung.
Semua lewat **repository abstraction** (`MeetingRepository`, `TranscriptRepository`, …) sehingga IndexedDB/SQLite/cloud bisa ditukar tanpa menyentuh UI.

---

## 3. Struktur Target Repository

```text
notula-asisten/
├── docs/
│   ├── PRD-Notula-Assistent-Final.md     # dipindahkan dari root (batch 01)
│   ├── IMPLEMENTATION-PLAN.md            # dokumen ini
│   └── ARCHITECTURE.md                   # arsitektur detail (batch 01)
├── prototype/
│   └── notula-assistent.html             # dipindahkan dari root — referensi desain
├── src/
│   ├── app/            # shell aplikasi, router, error boundary, layout
│   ├── core/           # types, logging, errors, time utils, config
│   ├── providers/      # interface + impl SpeechToText/AI/Diarization/Storage/Export
│   ├── data/           # repository layer + IndexedDB (Dexie) + migrations
│   ├── modules/
│   │   ├── auth/  meetings/  recording/  audio/  transcription/
│   │   ├── speakers/  transcript/  search/  summary/  decisions/
│   │   ├── action-items/  minutes/  export/  storage/  sync/  settings/
│   └── ui/             # komponen reusable (Button, Card, Sheet, StatusBadge…)
├── android/            # Capacitor host + Foreground Recording Service (batch 04)
├── tests/              # integration & e2e-lite
├── .env.example
├── package.json  tsconfig.json  vite.config.ts  eslint.config.js
└── README.md
```

---

## 4. Abstraction Wajib (dibuat di Batch 01)

```typescript
// Provider — semua bisa ditukar tanpa merombak aplikasi
SpeechToTextProvider.transcribeChunk(chunk: AudioChunk): Promise<TranscriptSegment[]>
SpeakerDiarizationProvider.identifySegments(chunk: AudioChunk): Promise<SpeakerSegment[]>
AISummarizationProvider.summarize(input: SummaryInput): Promise<AISummaryResult>
ExportProvider.export(doc: MeetingDocument, format: ExportFormat): Promise<Blob>
StorageProvider  // akses file audio lokal (web FS / Capacitor Filesystem)
RecordingEngine  // start/pause/resume/stop + event chunk (web & android impl)

// Repository — UI tidak tahu storage apa yang dipakai
MeetingRepository, AudioChunkRepository, TranscriptRepository,
SpeakerRepository, BookmarkRepository, SummaryRepository,
DecisionRepository, ActionItemRepository, ExportRepository, SyncQueueRepository
```

Setiap provider punya **fallback local/dev** yang nyata (bukan mock data palsu):
mis. `LocalDevSpeechToTextProvider` melakukan chunk audio → menandai `status: PENDING_TRANSCRIPTION` dengan pesan jujur "Transkripsi menunggu diproses".

---

## 5. Data Model (entity wajib)

`User, Meeting, AudioChunk, Speaker, TranscriptSegment, Bookmark, Summary,
Decision, ActionItem, ExportFile, SyncQueue`

Meeting status: `DRAFT → RECORDING → SAVING_AUDIO → TRANSCRIPTION_PENDING → TRANSCRIBING → TRANSCRIPT_READY → SUMMARIZING → GENERATING_MINUTES → COMPLETED` | `PROCESSING_ERROR` | `ARCHIVED` (legacy `PROCESSING`/`ERROR` masih dibaca untuk data lama).

Skema disimpan sebagai **versi migration** (Dexie upgrade function), bukan ad-hoc.

---

## 6. Urutan Batch

| #   | Batch                        | Scope utama                                                                                                                                                                                                              | DoD ringkas                                                                                                                                                                                              |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Project audit + architecture | Audit, docs, scaffold Vite+React+TS+Tailwind+PWA, strict TS, lint, vitest, error boundary, logger, core types, provider & repository interface, .env.example                                                             | `lint` `typecheck` `test` `build` hijau                                                                                                                                                                  |
| 02  | UI/UX + navigation           | Bottom nav, Home, Create Meeting, Recording screen (UI), Transcript, Summary, Speakers, Export, Settings; komponen reusable; warna PRD                                                                                   | Semua screen navigable, mobile-first                                                                                                                                                                     |
| 03  | Local database + storage     | Dexie schema + migration, repository impl, struktur folder `Meetings/{id}/…`, storage monitor                                                                                                                            | Data survive reload; storage estimate                                                                                                                                                                    |
| 04  | Recording engine (web)       | `RecordingEngine` web (MediaRecorder timeslice, state machine, permission flow) + persist chunk otomatis. **Capacitor/foreground service Android DITUNDA ke Batch 14** (deviasi terdokumentasi, mesin tanpa Android SDK) | Rekam nyata di web, chunk tersimpan                                                                                                                                                                      |
| 05  | Audio chunking + recovery    | Chunk 5 menit, manifest, recovery saat crash/interrupt, stop aman saat storage penuh (**selesai**: `manifest.ts`, `recovery.ts`, `stopRecordingSafely`, `useRecoverMeetings`)                                            | Chunk recovery test lulus (114 total)                                                                                                                                                                    |
| 06  | Transcription                | `SpeechToTextProvider` impl nyata + queue offline, timestamp timeline meeting                                                                                                                                            | **Selesai**: Whisper in-browser, 143 test lulus (`transcriptionQueue`, `mapSegments`, `whisperWeb`, migrasi v2, banner)                                                                                  |
| 07  | Audio-text sync              | `AudioPlayer` ↔ `TranscriptTimeline` satu state; klik teks→seek; audio→highlight; search → seek                                                                                                                          | **Selesai**: `playerStore` + `AudioPlayerBar`, 178 test lulus (klik/seek/sorot/cari dua arah)                                                                                                            |
| 08  | Speaker diarization          | Provider + rename pembicara + halaman pembicara (durasi/%)                                                                                                                                                               | **Selesai**: `vad-local` + `runDiarization`, 207 test lulus (assignment, rename selamat, %/durasi)                                                                                                       |
| 09  | AI summary                   | `AISummarizationProvider` + anti-hallucination guard + traceability sumber timestamp                                                                                                                                     | **Selesai**: provider `extractive`, 237 test lulus (keputusan/PIC/deadline + guard)                                                                                                                      |
| 10  | Notulen + action items       | `MinutesGenerator`, template notulen, action items PIC/deadline                                                                                                                                                          | **Selesai**: `generateMinutes` + 8 template, 253 test lulus (§17 terstruktur, PIC/deadline)                                                                                                              |
| 11  | Export                       | PDF, DOCX, TXT, XLSX via `ExportProvider`                                                                                                                                                                                | **Selesai**: `LocalExportProvider` (penulis manual, nol dep), 292 test lulus (unduhan nyata + riwayat)                                                                                                   |
| 12  | Optional cloud sync          | `SyncQueue` (PENDING/UPLOADING/SUCCESS/FAILED/RETRY, idempotent), setting "Hanya perangkat" default                                                                                                                      | **Selesai**: `syncEngine` + `HttpSyncProvider`, 323 test lulus (verify→upload, tanpa sukses palsu)                                                                                                       |
| 13  | Security + testing           | Consent notice, hapus rapat/audio/transkrip, proteksi file, error handling penuh, suite test PRD §34                                                                                                                     | **Selesai**: consent RecordingPage, hapus per-jenis, audit log lokal, koreksi transkrip §43, acceptance §52 (20 test) — 366 test lulus                                                                   |
| 14  | Production build             | PWA manifest, Capacitor Android + `ForegroundService`/notifikasi/permission (warisan Batch 04), APK build (perlu Android SDK), README, dokumentasi akhir                                                                 | **Selesai**: Capacitor 8 + izin §28 + `MODIFY_AUDIO_SETTINGS` + service/plugin; **APK build sukses & teruji di emulator API 36** (rekam → background → berhenti, notifikasi foreground) — 369 test lulus |

**Aturan antar batch:** setiap batch diakhiri `npm run lint && npm run typecheck && npm run test && npm run build`. Batch berikutnya tidak dimulai bila batch sebelumnya rusak.

---

## 7. Risiko & Mitigasi

| Risiko                                   | Mitigasi                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment tanpa Java/Android SDK       | **Teratasi**: JDK 21 + Android SDK 36 dipasang portable (`~/tools/jdk21`, `~/android-sdk`, `local.properties`); emulator AVD `notula-avd` (API 36, KVM) untuk uji runtime |
| Background recording di browser terbatas | `RecordingEngine` terpisah per platform; Android = foreground service native; web = batasan jujur di UI                                                                   |
| Provider AI/STT berbayar & butuh key     | Interface + `.env.example`; fallback lokal yang jujur; key tidak pernah di frontend bundle untuk server-side                                                              |
| Hallucination AI                         | Guard: semua output wajib punya `sourceTimestamp`; bila tidak ada di transkrip → "Tidak disebutkan dalam rapat."                                                          |
| Storage penuh                            | Storage monitor sebelum rekam; stop aman setelah chunk aktif selesai                                                                                                      |

---

## 8. Definition of Done (per fitur)

- [ ] Kode berjalan
- [ ] 0 TypeScript error (strict, tanpa `any` sembarangan)
- [ ] 0 build error
- [ ] Test utama lulus
- [ ] Data tersimpan lokal dengan benar (local-first)
- [ ] Error handling tersedia (async punya catch)
- [ ] Tidak merusak fitur existing
- [ ] Dokumentasi diperbarui
