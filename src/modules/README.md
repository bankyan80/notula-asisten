# `src/modules/`

Setiap modul bisnis dibuat sebagai folder terpisah dengan `index.ts` sebagai
publik API. UI tidak boleh mengimpor lintas-modul selain lewat `index.ts`.

| Modul           | Tanggung jawab                              | Batch   |
| --------------- | ------------------------------------------- | ------- |
| `account`       | Akun lokal, privasi, ringkasan penyimpanan  | 02      |
| `auth`          | Sesi pengguna (opsional cloud)              | 12      |
| `meetings`      | CRUD rapat, status, list terbaru            | 02      |
| `recording`     | Engine rekaman, kontrol, lifecycle          | 04      |
| `audio`         | Chunk, manifest, pemutar audio              | 05 / 07 |
| `transcription` | Antrean transkripsi, pipeline chunk         | 06      |
| `speakers`      | Diarization, rename, statistik bicara       | 08      |
| `transcript`    | Segmen, edit, render timeline               | 06 / 07 |
| `search`        | Pencarian dalam transkrip + seek audio      | 07      |
| `summary`       | Ringkasan AI + traceability                 | 09      |
| `decisions`     | Keputusan rapat dengan sumber timestamp     | 09      |
| `action-items`  | Tugas, PIC, deadline, status                | 10      |
| `minutes`       | Generator notulen + template                | 10      |
| `export`        | PDF/DOCX/TXT/XLSX via ExportProvider        | 11      |
| `storage`       | Struktur folder, monitor, hapus data        | 03      |
| `sync`          | SyncQueue, retry idempotent, status online  | 12      |
| `settings`      | Penyimpanan, bahasa, kamus istilah, privasi | 02      |

Folder dibuat ketika modulnya mulai diimplementasikan (bukan folder kosong).
Batch 02 membuat layar UI untuk `recording`, `transcript`, `speakers`,
`summary`, `minutes`, `export` — logika lengkapnya (engine, provider, generator)
menyusul pada batch yang tercantum di tabel.
