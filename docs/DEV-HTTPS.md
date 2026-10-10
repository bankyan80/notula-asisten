# HTTPS untuk Pengujian dari HP

## Kenapa wajib HTTPS

`getUserMedia()` (microphone) hanya tersedia di **secure context**. Chrome
menganggap secure context: `https://…`, `http://localhost`, dan
`http://127.0.0.1` — **bukan** `http://<ip-lan>:4173`.

Bila aplikasi dibuka lewat HTTP + IP lokal:

| Properti                              | Nilai di HTTP + IP lokal |
| ------------------------------------- | ------------------------ |
| `window.isSecureContext`              | `false`                  |
| `navigator.mediaDevices`              | `undefined`              |
| `navigator.mediaDevices.getUserMedia` | `undefined`              |
| `MediaRecorder`                       | tetap ada (menyesatkan!) |

Akibatnya `WebRecordingEngine.isSupported()` = `false` dan UI menampilkan
penyebab sebenarnya: _"Akses microphone memerlukan HTTPS (secure context)…"_.
Tidak ada flag browser yang bisa melewati ini di Chrome Android, dan
menonaktifkan keamanan browser bukan solusi yang boleh ditawarkan ke pengguna.

## 1. Buat sertifikat (sekali)

```bash
npm run certs
```

Script `scripts/dev-certs.sh` membuat, dengan `openssl` yang sudah ada di
mesin:

- `certs/dev-ca.pem` + `certs/dev-ca-key.pem` — **CA lokal** (10 tahun).
  Inilah yang dipasang di HP.
- `certs/dev.pem` + `certs/dev-key.pem` — sertifikat server (825 hari) yang
  ditandatangani CA di atas, dengan SAN berisi `localhost`, nama host,
  `notula.local`, `notula.test`, `127.0.0.1`, dan **semua IPv4 yang terdeteksi
  di mesin ini**.

IP tambahan (mis. bila Wi-Fi berganti) bisa ditambahkan tanpa mengulang
semuanya:

```bash
NOTULA_EXTRA_IPS="192.168.1.50,10.0.0.5" npm run certs
```

Seluruh isi `certs/` masuk `.gitignore` — jangan pernah di-commit, dan ini
bukan untuk produksi.

## 2. Sajikan lewat HTTPS

```bash
npm run build
npm run preview:https
```

```
➜  Network: https://192.168.100.16:4173/  wlp3s0
```

Untuk pengembangan (dev server) gunakan `npm run dev:https` (port 5173).

`vite.config.ts` hanya mengaktifkan TLS bila `NOTULA_HTTPS=1`; tanpa env itu
perilaku `npm run dev` / `npm run preview` tetap HTTP seperti biasa. Bila
sertifikat belum dibuat, perintah HTTPS berhenti dengan pesan
`Jalankan dulu: npm run certs`.

Server selalu memakai `host: true`, jadi alamat `Network` di atas bisa
langsung dibuka dari HP di jaringan yang sama.

## 3. Pasang CA di HP

Chrome Android **mempercayai sertifikat yang dipasang sebagai kredensial
pengguna**. Cukup satu kali:

1. Salin `certs/dev-ca.pem` ke HP (kabel USB / `adb push` / kirim ke diri
   sendiri).
2. **Settings → Security & privacy → Encryption & credentials →
   Install a certificate → CA certificate** (di beberapa versi:
   _Settings → Security → Encryption & credentials_).
3. Pilih file `dev-ca.pem`, beri nama, konfirmasi.
4. Buka `https://<ip-lan>:4173/` di Chrome — tidak boleh ada warning
   _"Your connection is not private"_.

### Penting: pasang HANYA sebagai kredensial pengguna

Jangan memasang CA yang sama **sekaligus** sebagai _user certificate_ dan
_system certificate_. Android menolak sertifikat server yang chain-nya
menembus CA yang dipasang di dua tempat itu (CT/_certificate transparency_
rejection) sehingga halaman justru gagal dimuat. Ikuti jalur
**Install a certificate → CA certificate** (user), jangan menyentuh store
system.

Jangan juga menawarkan solusi "matikan keamanan browser"/"proceed anyway"
ke pengguna akhir — itu menutupi masalah, tidak menyelesaikannya.

### Melepas kembali

**Settings → Security & privacy → Encryption & credentials → Trusted
credentials → tab User → pilih CA Notula Dev → Hapus.**

## 4. Alternatif untuk emulator Android

```bash
adb push certs/dev-ca.pem /sdcard/Download/
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Download/dev-ca.pem
adb shell am start -a android.intent.action.VIEW \
  -t application/x-x509-ca-cert \
  -d content://media/external/file/<id> --grant-read-uri-permission
```

atau cukup buka `dev-ca.pem` dari aplikasi Files/Downloads (Android membuka
pemasang sertifikat bawaan).

## 5. Desktop / automation

- **Manual:** impor `certs/dev-ca.pem` ke keychain/browser (macOS Keychain
  Access → _Import_ → _Always Trust_; Linux `chrome://settings/certificates`;
  Windows `certmgr.msc → Trusted Root Certification Authorities`).
- **Headless/CI:** `--ignore-certificate-errors` hanya untuk automasi, bukan
  untuk pengguna. Yang diukur tetap `window.isSecureContext === true`.

## Troubleshooting

| Gejala                                   | Penyebab / solusi                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Sertifikat HTTPS belum ada`             | Jalankan `npm run certs`.                                                                                         |
| Chrome: _Your connection is not private_ | CA belum dipasang, dipasang di store yang salah, atau SAN tidak memuat host yang dibuka (cek `NOTULA_EXTRA_IPS`). |
| _Network is unreachable_ dari emulator   | HP/emulator harus satu jaringan dengan mesin; cek alamat `Network` yang dicetak Vite.                             |
| Mic tetap tidak ada padahal HTTPS        | Buka lewat host yang sama dengan sertifikat (bukan host lain), lalu muat ulang.                                   |
| Sertifikat kedaluwarsa                   | `npm run certs` lalu pasang ulang CA bila CA-nya ikut diganti.                                                    |
