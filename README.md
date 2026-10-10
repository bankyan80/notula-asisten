# Notula Assistent

**Rekam. Transkrip. Rangkum.**

Asisten rapat local-first: merekam pembicaraan, mentranskripsikan dengan
timestamp, memisahkan pembicara, lalu menghasilkan ringkasan, keputusan,
tindak lanjut, notulen, dan ekspor — tanpa bergantung pada internet.

- PRD: [`docs/PRD-Notula-Assistent-Final.md`](docs/PRD-Notula-Assistent-Final.md)
- Rencana pengembangan: [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md)
- Arsitektur: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Prototype UI (referensi desain, bukan aplikasi): [`prototype/notula-assistent.html`](prototype/notula-assistent.html)

## Stack

React + TypeScript (strict) + Vite + Tailwind CSS + PWA, dengan Capacitor sebagai
shell Android untuk foreground recording service. Penyimpanan lokal-first
(IndexedDB/Dexie → repository abstraction), cloud opsional.

## Perintah

```bash
npm install
npm run dev         # development server
npm run lint        # ESLint
npm run typecheck   # TypeScript --noEmit (strict)
npm run test        # Vitest (59 file, 369 test)
npm run build       # typecheck + production build (PWA)
npm run preview     # smoke-test hasil build di :4173
npm run android:sync  # build + sinkron dist → project Android (cap sync)
npm run android:apk   # android:sync + ./gradlew assembleDebug (butuh JDK 17+ & Android SDK)
```

Semua perintah di atas wajib hijau sebelum batch berikutnya dikerjakan.

## Build produksi & Android

- **Web/PWA:** `npm run build` → `dist/` (HTML, precache, `sw.js`,
  `manifest.webmanifest`). Deploy folder `dist/` ke host statis apa pun;
  instalasi "Add to Home Screen" tersedia di browser mendukung.
- **Android:** project Capacitor ada di `android/` (`appId: id.notula.assistent`).
  Izin: PRD §28 (`RECORD_AUDIO`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`) + `MODIFY_AUDIO_SETTINGS`
  (wajib bagi Chrome/WebView agar mikrofon MediaRecorder dapat dipakai) +
  `RecordingForegroundService` (notifikasi rekaman, `START_STICKY`, tipe
  microphone) terdaftar sebagai plugin `RecordingService` — dipanggil otomatis
  dari `RecordingPage` (no-op di browser). Build APK:

  ```bash
  # prasyarat: JDK 21 (Capacitor 8/AGP 8.13) + Android SDK 36
  echo "sdk.dir=/path/to/android-sdk" > android/local.properties
  npm run android:apk   # sync + ./gradlew assembleDebug
  # hasil: android/app/build/outputs/apk/debug/app-debug.apk
  ```

  **Sudah diverifikasi di emulator** (AVD API 36, KVM): APK terpasang, buat
  rapat → MULAI REKAM → timer berjalan, notifikasi foreground aktif, rekaman
  tetap jalan saat app di-background (HOME), "Berhenti" menghentikan service +
  notifikasi. Uji di HP fisik: `adb install app-debug.apk` (mode debug).

## Struktur

```text
src/
├── app/         # shell, router, error boundary, DI repository
├── core/        # types, config, errors, logging, utils, validation
├── data/        # repository abstraction (implementasi local DB di Batch 03)
├── modules/     # modul bisnis (lihat src/modules/README.md)
├── providers/   # kontrak + implementasi STT/diarization/AI/export/storage
└── ui/          # komponen reusable (Button, Card, BottomNav, TabNav, …)
```

## Status pengembangan

| Batch                   | Status     |
| ----------------------- | ---------- |
| 01 — Audit & arsitektur | ✅ Selesai |
| 02 — UI/UX & navigasi   | ✅ Selesai |
| 03 — Local DB & storage | ✅ Selesai |
| 04 — Rekam web          | ✅ Selesai |
| 05 — Chunk & recovery   | ✅ Selesai |
| 06 — Transkripsi        | ✅ Selesai |
| 07 — Audio ↔ transkrip  | ✅ Selesai |
| 08 — Pembicara          | ✅ Selesai |
| 09 — Ringkasan AI       | ✅ Selesai |
| 10 — Notulen            | ✅ Selesai |
| 11 — Ekspor file        | ✅ Selesai |
| 12 — Sinkron cloud      | ✅ Selesai |
| 13 — Keamanan+testing   | ✅ Selesai |
| 14 — Build produksi     | ✅ Selesai |

## Konfigurasi

Salin `.env.example` ke `.env`. Jangan pernah menaruh API key/secret di frontend;
provider AI/STT berbayar dipanggil lewat backend (Batch 12).
