# PRD FINAL --- NOTULA ASSISTENT

**Nama Produk:** Notula Assistent\
**Tagline:** _Rekam. Transkrip. Rangkum._\
**Versi:** 1.0.0\
**Status:** Final --- Ready for Development\
**Platform:** Android-first, Web/PWA companion, Desktop Web  
**Arsitektur Penyimpanan:** Local-first — data rapat secara default tersimpan di perangkat pengguna; cloud bersifat opsional\
**Target Utama:** Rapat sekolah, dinas, organisasi, komunitas,
perusahaan, dan pertemuan formal\
**Bahasa utama:** Bahasa Indonesia\
**Orientasi:** Mobile-first, Android-style, mudah digunakan,
profesional, ringan

---

## 1. Ringkasan Produk

**Notula Assistent** adalah aplikasi asisten rapat berbasis AI yang
mampu merekam pembicaraan, melakukan transkripsi suara menjadi teks,
memberikan timestamp pada setiap bagian percakapan, mengenali/memisahkan
pembicara, menampilkan transkrip secara realtime, serta menghasilkan
ringkasan dan notulen otomatis setelah rapat selesai.

Aplikasi dirancang agar pengguna dapat:

1.  Menekan tombol **Mulai Rapat**.
2.  Merekam pembicaraan melalui microphone.
3.  Mengunci layar atau meninggalkan aplikasi ketika menggunakan Android
    native recording service.
4.  Tetap menyimpan audio secara bertahap.
5.  Mendapatkan transkripsi realtime atau near-realtime.
6.  Menghubungkan setiap teks dengan posisi waktu pada audio.
7.  Membedakan pembicara.
8.  Memutar audio dari kalimat tertentu.
9.  Mencari kata tertentu dalam transkrip dan langsung menuju timestamp
    audio.
10. Menghasilkan ringkasan AI.
11. Menghasilkan keputusan rapat, tugas, PIC, dan deadline.
12. Menghasilkan notulen yang dapat diekspor.

---

# 2. Tujuan Produk

## 2.1 Tujuan Utama

Mengubah rekaman rapat menjadi dokumen informasi yang terstruktur tanpa
pengguna harus mengetik notulen secara manual.

## 2.2 Tujuan Pengguna

Pengguna dapat:

- merekam rapat panjang dengan aman;
- tidak kehilangan audio ketika koneksi internet terputus;
- melihat pembicaraan dalam bentuk teks;
- mengetahui siapa yang berbicara;
- mencari pembahasan tertentu;
- memutar ulang bagian pembicaraan tertentu;
- mendapatkan ringkasan otomatis;
- mendapatkan daftar keputusan;
- mendapatkan daftar pekerjaan/tindak lanjut;
- mengetahui PIC;
- mengetahui deadline;
- menghasilkan dokumen notulen siap dibagikan.

---

# 3. Masalah yang Diselesaikan

Notulen rapat manual memiliki beberapa masalah:

- pencatatan membutuhkan konsentrasi;
- informasi penting dapat terlewat;
- sulit mengetahui siapa yang mengatakan suatu pernyataan;
- sulit mencari pembahasan dalam rekaman panjang;
- membutuhkan waktu lama untuk membuat notulen;
- hasil notulen dapat berbeda tergantung orang yang mencatat;
- rekaman audio dan catatan sering tidak memiliki hubungan timestamp.

Notula Assistent menghubungkan:

**Audio → Timestamp → Pembicara → Transkrip → Ringkasan → Notulen**

---

# 4. Target Pengguna

## 4.1 Pengguna Utama

### Instansi Pemerintah

- Dinas Pendidikan
- Kecamatan/Korwil
- Sekolah
- UPT
- Organisasi pemerintahan

### Pendidikan

- Kepala sekolah
- Guru
- Pengawas
- Operator sekolah
- Tata usaha
- Tim kerja

### Organisasi

- Ketua organisasi
- Sekretaris
- Panitia
- Komunitas

### Perusahaan

- Manager
- HR
- Project manager
- Team leader
- Sekretaris

### Pengguna umum

- Rapat keluarga
- Komunitas
- Diskusi
- Wawancara
- Seminar kecil

---

# 5. Platform

## 5.1 Android

Platform utama.

Direkomendasikan menggunakan:

- Android native shell/application;
- Foreground Service untuk perekaman;
- microphone permission;
- notification recording status;
- local audio storage;
- background-safe recording.

## 5.2 Web/PWA

Digunakan sebagai:

- dashboard;
- pengelolaan rapat;
- melihat transkrip;
- melihat hasil AI;
- ekspor;
- sinkronisasi data.

PWA dapat digunakan untuk recording dalam kondisi yang didukung browser,
tetapi **background recording ketika layar dikunci tidak boleh
bergantung pada browser PWA murni**.

## 5.3 Desktop

Web application dapat digunakan pada:

- Windows
- Linux
- macOS

---

# 6. Prinsip Arsitektur

Arsitektur utama:

```text
Android App
    |
    | Microphone
    v
Foreground Recording Service
    |
    +---- Local Audio Chunks
    |
    +---- Upload Queue
             |
             v
         Backend API
             |
       +-----+------+
       |            |
       v            v
 Speech-to-Text   Storage
       |
       v
 Speaker Diarization
       |
       v
 Timestamped Transcript
       |
       v
 AI Summarization
       |
       +---- Summary
       +---- Decisions
       +---- Tasks
       +---- PIC
       +---- Deadline
       +---- Minutes
```

---

# 7. Fitur Utama

## 7.1 Dashboard

Dashboard menampilkan:

- logo Notula Assistent;
- tombol **Mulai Rapat**;
- rapat terbaru;
- ringkasan terakhir;
- notulen;
- pencarian;
- akun;
- pengaturan.

---

# 8. Fitur Rekam Rapat

## 8.1 Membuat Sesi Rapat

Sebelum merekam:

- Judul rapat
- Tanggal
- Waktu
- Lokasi
- Deskripsi
- Peserta opsional
- Template notulen
- Bahasa transkripsi

Contoh:

```text
Judul:
Rapat Koordinasi TKA SD

Tanggal:
7 Oktober 2026

Lokasi:
Ruang Rapat Dinas
```

## 8.2 Tombol Rekam

Status:

```text
● SIAP MEREKAM
```

Ketika dimulai:

```text
🔴 SEDANG MEREKAM
00:24:37
```

## 8.3 Kontrol

- Mulai
- Pause
- Lanjut
- Stop
- Bookmark/tanda penting
- Tambahkan catatan
- Tandai pembahasan

---

# 9. Background Recording

Ini adalah fitur penting.

Aplikasi Android harus menggunakan **Foreground Service** untuk menjaga
proses perekaman tetap berjalan ketika:

- layar dimatikan;
- layar dikunci;
- pengguna berpindah aplikasi;
- aplikasi tidak sedang berada di foreground.

Android menampilkan notifikasi:

```text
🔴 Notula Assistent sedang merekam

Rapat Koordinasi TKA SD
00:47:23

Ketuk untuk membuka
```

## 9.1 Proteksi Rekaman

Audio tidak boleh hanya disimpan sebagai satu file besar.

Audio dibagi menjadi beberapa chunk.

Contoh:

```text
meeting/
  audio/
    000001.m4a
    000002.m4a
    000003.m4a
    ...
```

Chunk dapat dibuat setiap:

- 1 menit; atau
- 5 menit.

Rekomendasi awal:

**5 menit per chunk.**

Keuntungannya:

- risiko kehilangan data lebih kecil;
- upload dapat dilakukan bertahap;
- koneksi terputus tidak menghentikan recording;
- proses transkripsi dapat dilakukan bertahap.

---

# 10. Offline-First Recording

Aplikasi harus tetap dapat merekam tanpa internet.

Ketika offline:

```text
Microphone
    ↓
Local Storage
    ↓
Pending Upload
```

Ketika internet kembali:

```text
Pending Upload
    ↓
Automatic Sync
    ↓
Server
```

Tidak boleh ada kondisi:

> Internet putus → rekaman hilang.

---

# 11. Transkripsi Suara

## 11.1 Live Transcript

Ketika audio masuk, aplikasi mengubah suara menjadi teks.

Contoh:

```text
00:00:12
Pembicara 1

Selamat pagi, kita mulai rapat koordinasi
TKA tahun ini.
```

## 11.2 Near-Realtime

Transkripsi dapat menggunakan buffer pendek.

Contoh:

```text
Audio 10–30 detik
        ↓
Speech-to-Text
        ↓
Transcript segment
        ↓
UI update
```

Target:

**latensi transkripsi ≤ 5--10 detik** pada koneksi normal.

---

# 12. Sinkron Audio dan Teks

Setiap segmen transkrip wajib memiliki:

- start timestamp;
- end timestamp;
- speaker ID;
- text;
- confidence jika tersedia.

Contoh data:

```json
{
  "start": 47.2,
  "end": 53.8,
  "speaker": "speaker_1",
  "text": "Kita perlu memastikan data NISN sudah valid.",
  "confidence": 0.94
}
```

## 12.1 Klik Teks → Audio

Ketika pengguna menekan kalimat:

```text
"Kita perlu memastikan data NISN..."
```

audio langsung:

```text
▶ 00:00:47
```

## 12.2 Audio → Teks

Saat audio berjalan:

```text
00:00:47
```

segmen teks aktif otomatis disorot.

## 12.3 Pencarian

Pengguna dapat mencari:

```text
NISN
```

Hasil:

```text
00:42:17 — Pembicara 2
"...data NISN siswa..."
```

Klik hasil → audio melompat ke timestamp.

---

# 13. Speaker Diarization

Aplikasi harus dapat memisahkan suara pembicara.

Contoh:

```text
Pembicara 1
Pembicara 2
Pembicara 3
Pembicara 4
```

Setelah rapat pengguna dapat mengganti:

```text
Pembicara 1 → Kepala Sekolah
Pembicara 2 → Operator
Pembicara 3 → Pengawas
```

Sistem tidak boleh mengklaim identitas seseorang secara otomatis hanya
berdasarkan suara tanpa mekanisme identifikasi yang benar.

---

# 14. Pengelolaan Pembicara

Data pembicara:

```text
ID
Nama
Durasi bicara
Jumlah segmen
Persentase bicara
```

Contoh:

Pembicara Durasi Persentase

---

Kepala Sekolah 42:15 34%
Operator 28:36 23%
Pengawas 15:22 12%

---

# 15. AI Summary

Setelah rapat selesai, sistem menjalankan pipeline:

```text
Transcript
    ↓
Segment Summary
    ↓
Global Summary
    ↓
Decision Extraction
    ↓
Action Item Extraction
    ↓
PIC Extraction
    ↓
Deadline Extraction
    ↓
Final Minutes
```

---

# 16. Struktur Ringkasan

Output AI:

## Ringkasan

Paragraf singkat mengenai keseluruhan rapat.

## Pokok Pembahasan

1.  Topik pertama
2.  Topik kedua
3.  Topik ketiga

## Keputusan

1.  Keputusan pertama
2.  Keputusan kedua

## Tindak Lanjut

Tugas PIC Deadline

---

Verifikasi data Operator 9 Okt
Rekap data Korwil 10 Okt

## Hal yang Belum Diputuskan

AI harus memisahkan hal yang masih membutuhkan keputusan.

---

# 17. Notulen Otomatis

Format notulen:

```text
NOTULEN RAPAT

Judul:
Tanggal:
Waktu:
Tempat:

Peserta:
1.
2.
3.

AGENDA
...

PEMBAHASAN
...

KEPUTUSAN
...

TINDAK LANJUT
...

PENANGGUNG JAWAB
...

DEADLINE
...

CATATAN
...
```

---

# 18. Template Notulen

Pengguna dapat memilih:

- Notulen Umum
- Notulen Dinas
- Notulen Sekolah
- Notulen Rapat Guru
- Notulen Evaluasi
- Notulen Koordinasi
- Notulen Proyek
- Template Custom

---

# 19. Ekspor

Format yang wajib didukung:

- PDF
- DOCX
- TXT

Format tambahan:

- XLSX
- CSV

## 19.1 PDF

PDF berisi:

- identitas rapat;
- peserta;
- ringkasan;
- pembahasan;
- keputusan;
- tugas;
- PIC;
- deadline.

## 19.2 DOCX

Dokumen dapat diedit.

## 19.3 TXT

Untuk transkrip sederhana.

---

# 20. Pemutar Rekaman

Pemutar harus memiliki:

- play;
- pause;
- rewind 10 detik;
- forward 10 detik;
- speed 0.75x;
- speed 1x;
- speed 1.25x;
- speed 1.5x;
- speed 2x;
- waveform;
- timestamp;
- daftar segmen;
- bookmark.

---

# 21. Bookmark

Pengguna dapat menandai:

```text
⭐ Penting
⭐ Keputusan
⭐ Tindak lanjut
⭐ Pertanyaan
⭐ Catatan
```

Bookmark terhubung dengan timestamp audio.

---

# 22. Pencarian Transkrip

Search harus mencari:

- kata;
- kalimat;
- nama pembicara;
- topik.

Hasil pencarian:

```text
NISN

00:42:17
Pembicara 2

"...data NISN siswa..."
```

Klik hasil:

**Audio → timestamp tersebut.**

---

# 23. Database

Model minimum:

## User

```text
id
name
email
photo
created_at
```

## Meeting

```text
id
user_id
title
date
location
duration
status
created_at
```

## AudioChunk

```text
id
meeting_id
sequence
file_url
duration
uploaded
created_at
```

## Speaker

```text
id
meeting_id
speaker_code
display_name
duration
```

## TranscriptSegment

```text
id
meeting_id
speaker_id
start_time
end_time
text
confidence
created_at
```

## Summary

```text
id
meeting_id
summary
created_at
```

## Decision

```text
id
meeting_id
content
created_at
```

## ActionItem

```text
id
meeting_id
task
assignee
deadline
status
```

---

# 24. Status Meeting

Meeting mempunyai status:

```text
DRAFT
RECORDING
PROCESSING
TRANSCRIBING
SUMMARIZING
COMPLETED
ERROR
ARCHIVED
```

---

# 25. Penyimpanan

## Local

Digunakan untuk:

- audio sementara;
- audio chunk;
- transcript cache;
- metadata;
- upload queue.

## Server

Digunakan untuk:

- audio backup;
- transkrip;
- metadata;
- hasil AI;
- dokumen.

Penyimpanan dapat menggunakan object storage yang kompatibel dengan
arsitektur backend.

---

# 26. Keamanan

Audio rapat dan transkrip dapat berisi informasi sensitif.

Wajib tersedia:

- authentication;
- authorization;
- HTTPS;
- encrypted storage jika memungkinkan;
- signed URL untuk file audio;
- access control;
- session security;
- secure API;
- audit log.

Pengguna harus dapat menghapus:

- rapat;
- audio;
- transkrip;
- hasil AI.

---

# 27. Privasi dan Persetujuan

Sebelum rekaman dimulai, aplikasi harus menampilkan pemberitahuan:

> **Pemberitahuan Rekaman**
>
> Pertemuan ini akan direkam dan dapat ditranskripsikan menggunakan
> layanan AI. Pastikan seluruh peserta mengetahui dan menyetujui
> perekaman sesuai aturan yang berlaku.

Pengguna bertanggung jawab memastikan perekaman dilakukan dengan
persetujuan yang sesuai.

---

# 28. Permission Android

Minimal:

```text
RECORD_AUDIO
FOREGROUND_SERVICE
FOREGROUND_SERVICE_MICROPHONE
POST_NOTIFICATIONS
```

Permission hanya diminta ketika diperlukan.

---

# 29. Kondisi Error

## Microphone ditolak

Tampilkan:

> Microphone belum diizinkan. Silakan aktifkan izin microphone di
> pengaturan perangkat.

## Storage penuh

Tampilkan:

> Penyimpanan perangkat hampir penuh. Rekaman dihentikan untuk mencegah
> kehilangan data.

## Internet terputus

Tampilkan:

> Offline. Rekaman tetap berjalan dan akan disinkronkan ketika koneksi
> kembali.

## Transkripsi gagal

Audio tetap disimpan.

Status:

```text
Audio aman
Transkripsi menunggu diproses
```

## AI gagal

Transkrip tetap tersedia.

Pengguna dapat:

**Coba Ringkas Lagi**

---

# 30. Batas Rekaman

Tidak menggunakan batas karakter untuk transkrip.

Batas utama berdasarkan:

- storage perangkat;
- storage server;
- kemampuan backend;
- kebijakan paket pengguna.

Target produk:

**hingga 8 jam per sesi** untuk versi awal.

Arsitektur harus memungkinkan sesi lebih panjang di masa depan.

---

# 31. Performa

Target:

- aplikasi terbuka ≤ 3 detik pada perangkat Android menengah;
- recording start ≤ 2 detik;
- tidak kehilangan audio ketika aplikasi berpindah background;
- chunk audio tersimpan otomatis;
- UI transcript tidak freeze walaupun transkrip panjang;
- pagination/virtualization untuk transcript panjang.

---

# 32. UI/UX

## Gaya Visual

- Mobile-first
- Android-style
- clean
- profesional
- modern
- tidak menggunakan dark mode sebagai default
- dominan biru
- kartu dengan rounded corners
- tombol besar
- mudah digunakan dengan satu tangan

## Warna

Primary:

```text
#0757A8
```

Secondary:

```text
#0B72D9
```

Background:

```text
#F8FBFF
```

Success:

```text
#12A66A
```

Danger:

```text
#EF4444
```

---

# 33. Navigasi Utama

Bottom navigation:

```text
⌂ Beranda
🎙 Rapat
▤ Notulen
● Akun
```

---

# 34. Halaman Utama

Komponen:

```text
Logo
Notula Assistent

Selamat datang

[ 🎙 MULAI RAPAT ]

Rapat Terbaru
- Rapat Koordinasi TKA SD
- Evaluasi Program Sekolah

Akses Cepat
- Ringkasan AI
- Ekspor Notulen
```

---

# 35. Halaman Recording

Komponen:

```text
Judul Rapat

Waveform

● SEDANG MEREKAM

00:47:23

[ Pause ]
[ Stop ]
[ Bookmark ]

Transkripsi Langsung

Pembicara 1
...
```

---

# 36. Halaman Transcript

Komponen:

```text
Cari dalam transkrip

00:00:12 Pembicara 1
...

00:00:28 Pembicara 2
...

00:00:47 Pembicara 1
...
```

Teks aktif diberi highlight.

---

# 37. Halaman Summary

Komponen:

```text
Ringkasan AI

Pokok Pembahasan

Keputusan

Tindak Lanjut

PIC

Deadline

Notulen
```

---

# 38. Halaman Export

Pilihan:

```text
PDF
DOCX
TXT
XLSX

Salin
WhatsApp
Email
```

---

# 39. API Backend

Contoh endpoint:

```text
POST /api/auth/login

POST /api/meetings

POST /api/meetings/:id/start

POST /api/meetings/:id/audio-chunks

POST /api/meetings/:id/transcript

GET /api/meetings/:id/transcript

GET /api/meetings/:id/audio

POST /api/meetings/:id/summarize

GET /api/meetings/:id/summary

GET /api/meetings/:id/actions

POST /api/meetings/:id/export

DELETE /api/meetings/:id
```

---

# 40. AI Processing Pipeline

```text
Audio
 ↓
Noise Processing
 ↓
Voice Activity Detection
 ↓
Speech-to-Text
 ↓
Speaker Diarization
 ↓
Timestamp Alignment
 ↓
Transcript Cleanup
 ↓
Chunk Summary
 ↓
Global Summary
 ↓
Decision Extraction
 ↓
Action Item Extraction
 ↓
Notulen Generation
```

---

# 41. Akurasi

Sistem harus memperhatikan:

- Bahasa Indonesia;
- istilah pendidikan;
- nama orang;
- nama sekolah;
- NPSN;
- NISN;
- singkatan;
- angka;
- tanggal;
- jabatan.

Pengguna harus dapat mengoreksi transkrip.

---

# 42. Kamus Istilah

Sediakan custom dictionary.

Contoh:

```text
TKA
SPMB
NPSN
NISN
Dapodik
Korwil
PPPK
GTK
Rombel
```

Kamus dapat membantu meningkatkan akurasi transkripsi.

---

# 43. Edit Transkrip

Pengguna dapat:

- edit teks;
- hapus teks;
- gabungkan segmen;
- pecah segmen;
- ubah pembicara;
- koreksi timestamp.

Perubahan harus disimpan sebagai versi terbaru.

---

# 44. AI Correction

Tersedia tombol:

**✨ Perbaiki Transkrip**

AI dapat:

- memperbaiki tanda baca;
- memperbaiki kapitalisasi;
- merapikan kalimat;
- mempertahankan makna asli.

AI tidak boleh mengubah fakta pembicaraan secara sembarangan.

---

# 45. AI Notulen

Tombol:

**✨ Buat Notulen**

Output harus berdasarkan transkrip.

AI tidak boleh mengarang:

- keputusan;
- nama;
- deadline;
- tugas;
- fakta yang tidak ada dalam transkrip.

Jika informasi tidak tersedia:

```text
Tidak disebutkan dalam rapat.
```

---

# 46. Role Pengguna

Versi awal:

```text
User
```

Pengembangan berikutnya:

```text
Personal User
Organization Admin
Organization Member
Viewer
```

---

# 47. Sharing

Meeting dapat dibagikan melalui:

- link;
- WhatsApp;
- email;
- file.

Hak akses:

```text
Private
Anyone with link
Organization only
```

---

# 48. Audit Log

Untuk versi organisasi:

```text
User
Action
Meeting
Timestamp
IP/Device
```

Contoh:

```text
Operator
Membuka transkrip
Rapat TKA SD
07-10-2026 11:22
```

---

# 49. Non-Functional Requirements

## Reliability

Rekaman harus tetap aman walaupun:

- internet putus;
- aplikasi berpindah background;
- upload gagal;
- AI gagal;
- transkripsi gagal.

## Scalability

Backend harus dapat menangani banyak meeting secara bersamaan.

## Maintainability

Komponen:

- recording;
- transcription;
- speaker;
- AI;
- storage;
- export

harus modular.

---

# 50. MVP

MVP wajib mencakup:

### Recording

- [x] Start
- [x] Pause
- [x] Stop
- [x] Background recording Android
- [x] Audio chunks
- [x] Local recovery

### Transcript

- [x] Speech-to-text
- [x] Timestamp
- [x] Transcript viewer
- [x] Search
- [x] Audio jump

### Speaker

- [x] Speaker diarization
- [x] Rename speaker

### AI

- [x] Summary
- [x] Decisions
- [x] Action items
- [x] PIC
- [x] Deadline
- [x] Minutes

### Export

- [x] PDF
- [x] DOCX
- [x] TXT

---

# 51. Fase Pengembangan

## Fase 1 --- UI Prototype

- UI mobile
- navigasi
- meeting flow
- transcript mockup
- summary mockup

## Fase 2 --- Recording Engine

- Android recording
- foreground service
- local storage
- chunking
- recovery

## Fase 3 --- Speech-to-Text

- audio upload
- transcription
- timestamp
- realtime/near realtime

## Fase 4 --- Speaker

- diarization
- speaker labeling
- speaker editing

## Fase 5 --- AI

- summary
- decisions
- action items
- minutes

## Fase 6 --- Export

- PDF
- DOCX
- TXT
- XLSX

## Fase 7 --- Production

- authentication
- cloud storage
- monitoring
- logging
- security
- backup

---

# 52. Acceptance Criteria

Produk dianggap berhasil apabila:

1.  Pengguna dapat membuat rapat.
2.  Pengguna dapat memulai recording.
3.  Audio tetap direkam ketika layar Android dikunci.
4.  Audio disimpan dalam chunk.
5.  Rekaman tidak hilang ketika internet terputus.
6.  Transkrip memiliki timestamp.
7.  Transkrip dapat diklik untuk memutar audio dari posisi terkait.
8.  Audio yang diputar dapat menyorot teks terkait.
9.  Pengguna dapat mencari kata dalam transkrip.
10. Sistem dapat memisahkan pembicara.
11. Pengguna dapat mengganti nama pembicara.
12. AI menghasilkan ringkasan.
13. AI menghasilkan keputusan.
14. AI menghasilkan tindak lanjut.
15. AI dapat mengidentifikasi PIC dan deadline jika disebutkan.
16. Pengguna dapat mengoreksi transkrip.
17. Pengguna dapat menghasilkan notulen.
18. Notulen dapat diekspor.
19. Pengguna dapat menghapus data rapat.
20. Kegagalan AI tidak menyebabkan audio hilang.

---

# 53. KPI

Target awal:

KPI Target

---

Recording success ≥ 99%
Audio recovery ≥ 99%
Transcript availability ≥ 98%
Transcription latency ≤ 10 detik
Audio-text timestamp accuracy ≥ 95%
Summary generation success ≥ 98%
Export success ≥ 99%
Crash-free sessions ≥ 99%

---

# 54. Risiko dan Mitigasi

## Battery

**Risiko:** recording panjang menguras baterai.

**Mitigasi:** - foreground service; - optimasi audio; - peringatan
baterai rendah.

## Storage

**Risiko:** audio panjang memenuhi storage.

**Mitigasi:** - estimasi ukuran; - upload bertahap; - penghapusan cache
aman setelah sinkronisasi.

## Internet

**Risiko:** koneksi terputus.

**Mitigasi:** - offline-first; - queue; - retry.

## Akurasi

**Risiko:** suara bising atau banyak pembicara.

**Mitigasi:** - noise reduction; - VAD; - speaker diarization; -
microphone positioning; - edit transcript.

## Privasi

**Risiko:** rekaman berisi informasi sensitif.

**Mitigasi:** - authentication; - encryption; - access control; - delete
capability; - consent notice.

---

# 55. Rekomendasi Perangkat

Untuk hasil terbaik:

- smartphone Android dengan microphone yang baik;
- posisi perangkat di tengah meja;
- gunakan external microphone jika tersedia;
- untuk rapat besar gunakan microphone array.

Aplikasi tidak boleh menjanjikan pemisahan suara sempurna jika kondisi
audio buruk.

---

# 56. Pengembangan Lanjutan

- optional cloud backup;
- multi-device synchronization;
- organization cloud archive;
- administrator-managed retention policy;
- secure shared meeting links;

Versi berikutnya dapat menambahkan:

- live meeting dashboard;
- multi-device microphone;
- microphone array;
- cloud collaborative transcript;
- live participant list;
- agenda management;
- voting/decision tracking;
- calendar integration;
- Google Drive integration;
- OneDrive integration;
- template instansi;
- tanda tangan digital;
- AI Q&A terhadap isi rapat;
- chatbot berdasarkan arsip rapat;
- knowledge base organisasi;
- pencarian seluruh arsip rapat.

---

# 57. Fitur AI Tanya Rapat

Pengembangan lanjutan:

Pengguna dapat bertanya:

> "Apa keputusan mengenai jadwal TKA?"

AI menjawab berdasarkan transkrip dan memberikan timestamp sumber.

Contoh:

```text
Keputusan:
Pelaksanaan TKA direncanakan pada minggu ketiga bulan ini.

Sumber:
00:01:28
Pembicara 2
```

Ini menjadi fitur penting untuk arsip rapat.

---

# 58. Prinsip Penting Produk

Notula Assistent harus mengikuti prinsip:

### Audio adalah sumber utama.

Transkrip adalah representasi audio.

### Transkrip adalah sumber utama untuk AI.

AI tidak boleh membuat keputusan yang tidak ada dalam transkrip.

### Timestamp harus dipertahankan.

Setiap informasi penting harus dapat dilacak kembali ke audio.

### Data harus aman.

Kegagalan jaringan atau AI tidak boleh menghapus rekaman.

### Sederhana untuk pengguna.

Pengguna idealnya cukup:

```text
Mulai
  ↓
Rapat
  ↓
Stop
  ↓
Notulen
```

---

# 59. User Flow Final

```text
BUKA NOTULA ASSISTENT
        ↓
   MULAI RAPAT
        ↓
Isi judul/lokasi
        ↓
   MULAI REKAM
        ↓
🎙️ Recording
        ↓
📝 Transkripsi
        ↓
👥 Speaker Detection
        ↓
   RAPAT SELESAI
        ↓
Audio disimpan
        ↓
Transkrip final
        ↓
✨ AI Processing
        ↓
┌───────────────────────┐
│ Ringkasan             │
│ Pembahasan            │
│ Keputusan             │
│ Tindak Lanjut         │
│ PIC                   │
│ Deadline              │
│ Notulen               │
└───────────────────────┘
        ↓
 PDF / DOCX / TXT / XLSX
        ↓
   BAGIKAN
```

---

# 60. Definisi Produk Final

**Notula Assistent** bukan sekadar aplikasi perekam suara.

Produk final harus menjadi:

> **Asisten rapat digital yang mampu mendengarkan, mencatat,
> menghubungkan suara dengan teks, mengenali pembicara, memahami isi
> pembicaraan, dan menghasilkan notulen secara otomatis.**

Tagline resmi:

# **Notula Assistent**

## _Rekam. Transkrip. Rangkum._

Status dokumen:

**FINAL --- READY FOR DEVELOPMENT**
