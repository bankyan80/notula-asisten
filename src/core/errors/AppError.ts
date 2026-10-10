/**
 * Error terstruktur untuk seluruh aplikasi.
 * Setiap error yang sampai ke UI harus punya kode yang bisa ditindaklanjuti.
 */

export type AppErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'STORAGE_FULL'
  | 'STORAGE_WRITE_FAILED'
  | 'STORAGE_READ_FAILED'
  | 'RECORDING_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'DIARIZATION_FAILED'
  | 'AI_FAILED'
  | 'EXPORT_FAILED'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export interface AppErrorOptions {
  cause?: unknown;
  retryable?: boolean;
  context?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly context: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.context = options.context ?? {};
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Deteksi kuota penyimpanan penuh lintas platform/browser
 * (QuotaExceededError di Chrome/Safari, NS_ERROR_DOM_QUOTA_REACHED di Firefox).
 * Dinilai dari `name` karena DOMException tidak selalu `instanceof Error`.
 */
export function isQuotaExceededError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/** Menangkap error apa pun menjadi AppError tanpa pernah melempar. */
export function toAppError(error: unknown, fallbackCode: AppErrorCode = 'UNKNOWN'): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return new AppError(fallbackCode, error.message, { cause: error });
  }
  return new AppError(fallbackCode, String(error), { cause: error });
}

/** Pesan ramah pengguna (Bahasa Indonesia) untuk ditampilkan di UI. */
export function friendlyMessage(error: unknown): string {
  if (!isAppError(error)) {
    return 'Terjadi kesalahan tak terduga. Data Anda tetap aman di perangkat.';
  }
  switch (error.code) {
    case 'PERMISSION_DENIED':
      return 'Microphone belum diizinkan. Silakan aktifkan izin microphone di pengaturan perangkat.';
    case 'STORAGE_FULL':
      return 'Penyimpanan perangkat hampir penuh. Rekaman dihentikan untuk mencegah kehilangan data.';
    case 'STORAGE_WRITE_FAILED':
      return 'Gagal menulis data ke perangkat. Rekaman akan dicoba disimpan ulang.';
    case 'RECORDING_FAILED':
      return 'Perekaman mengalami gangguan. Audio yang sudah terekam tetap aman.';
    case 'TRANSCRIPTION_FAILED':
      return 'Audio tetap aman. Transkripsi menunggu diproses ulang.';
    case 'AI_FAILED':
      return 'Transkrip tetap tersedia. Ringkasan dapat dicoba kembali.';
    case 'PROVIDER_UNAVAILABLE':
      return 'Layanan pemroses belum tersedia. Data tetap tersimpan di perangkat.';
    case 'NETWORK_ERROR':
      return 'Offline. Rekaman tetap berjalan dan akan disinkronkan ketika koneksi kembali.';
    case 'VALIDATION_ERROR':
      return error.message;
    case 'NOT_FOUND':
      return 'Data tidak ditemukan di perangkat.';
    default:
      return error.message || 'Terjadi kesalahan. Data Anda tetap aman di perangkat.';
  }
}
