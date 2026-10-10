/**
 * Diagnosa kegagalan rekaman → pesan Indonesia yang SPESIFIK (PRD: satu pesan
 * generik untuk semua kegagalan menyulitkan pengguna memperbaiki masalahnya).
 *
 * Dua kelompok masalah yang paling sering di lapangan:
 * 1. Bukan secure context (HTTP lewat IP LAN) → `navigator.mediaDevices`
 *    bahkan tidak ada; `MediaRecorder` tetap ada sehingga mudah tertukar.
 * 2. `getUserMedia` menolak/menggagalkan → nama `DOMException` menjelaskan
 *    penyebabnya (izin, hardware sibuk, dsb.).
 *
 * Modul ini murni fungsi tanpa dependensi — aman dipanggil dari engine,
 * dari UI, dan dari unit test.
 */

/** Apakah halaman berjalan di konteks yang diizinkan mengakses mikrofon. */
export function isSecureContextAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

export function hasGetUserMedia(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

export function hasMediaRecorder(): boolean {
  return typeof MediaRecorder !== 'undefined';
}

/**
 * Alasan spesifik mengapa perekaman tidak tersedia — dipakai pengganti pesan
 * generik "Perangkat atau browser ini tidak mendukung perekaman audio".
 */
export function describeUnsupportedEngine(): string {
  if (!isSecureContextAvailable()) {
    return (
      'Akses microphone memerlukan HTTPS (secure context). ' +
      'Buka aplikasi lewat https:// atau localhost, lalu muat ulang halaman.'
    );
  }
  if (!hasGetUserMedia()) {
    return (
      'Browser ini tidak menyediakan API microphone (navigator.mediaDevices). ' +
      'Perbarui browser atau gunakan Chrome terbaru.'
    );
  }
  if (!hasMediaRecorder()) {
    return 'Browser ini tidak mendukung MediaRecorder sehingga audio tidak bisa direkam.';
  }
  return 'Perekaman audio tidak tersedia di perangkat ini.';
}

interface NamedError {
  name?: string;
  message?: string;
  cause?: unknown;
}

function nameOf(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'name' in error) {
    const name = (error as NamedError).name;
    if (typeof name === 'string') return name;
  }
  return '';
}

function causeName(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'cause' in error) {
    return nameOf((error as NamedError).cause);
  }
  return '';
}

/**
 * Peta `DOMException.name` → kalimat yang bisa ditindaklanjuti pengguna.
 * `null` bila nama tidak dikenal.
 */
function messageForName(name: string): string | null {
  switch (name) {
    case 'NotAllowedError':
      return (
        'Izin microphone ditolak. Ketuk ikon gembok di bilah alamat → ' +
        'Izin → Mikrofon → Izinkan, lalu tekan MULAI REKAM lagi.'
      );
    case 'NotFoundError':
      return 'Tidak ditemukan microphone pada perangkat ini. Periksa microphone lalu coba lagi.';
    case 'NotReadableError':
      return (
        'Microphone sedang dipakai aplikasi lain atau perangkat sedang sibuk. ' +
        'Tutup aplikasi lain yang memakai microphone lalu coba lagi.'
      );
    case 'OverconstrainedError':
      return (
        'Konfigurasi microphone yang diminta tidak tersedia di perangkat ini. ' +
        'Coba lagi tanpa mengubah pengaturan mikrofon.'
      );
    case 'SecurityError':
      return isSecureContextAvailable()
        ? 'Browser memblokir akses microphone karena alasan keamanan. Buka lewat https:// lalu coba lagi.'
        : 'Akses microphone memerlukan HTTPS (secure context). Buka aplikasi lewat https:// lalu muat ulang.';
    case 'NotSupportedError':
      return 'Perekaman audio tidak didukung pada peramban/perangkat ini.';
    case 'AbortError':
      return 'Perekaman dihentikan oleh sistem sebelum sempat dimulai. Coba lagi.';
    default:
      return null;
  }
}

/**
 * `DOMException.name` → kalimat yang bisa ditindaklanjuti pengguna, dengan
 * fallback ke `error.cause` (kasus: `engine.start()` membungkus penyebab
 * aslinya sehingga `error.name` hanya "Error"). `null` bila tidak dikenal —
 * pemanggil memakai pesan cadangannya sendiri.
 */
export function describeRecordingFailure(error: unknown): string | null {
  const own = nameOf(error);
  const direct = messageForName(own);
  if (direct !== null) return direct;
  const cause = causeName(error);
  if (cause !== '' && cause !== own) return messageForName(cause);
  return null;
}

/** Kode `AppError` yang paling tepat untuk sebuah `DOMException`. */
export function errorCodeForFailure(error: unknown): 'PERMISSION_DENIED' | 'RECORDING_FAILED' {
  const own = nameOf(error);
  const cause = causeName(error);
  const name = isPermissionName(own) ? own : cause;
  return isPermissionName(name) ? 'PERMISSION_DENIED' : 'RECORDING_FAILED';
}

function isPermissionName(name: string): boolean {
  return name === 'NotAllowedError' || name === 'SecurityError';
}

export function isPermissionFailure(error: unknown): boolean {
  return errorCodeForFailure(error) === 'PERMISSION_DENIED';
}
