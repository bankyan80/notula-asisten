import { describe, expect, it } from 'vitest';
import { AppError, friendlyMessage, isAppError, toAppError } from './AppError';

describe('AppError', () => {
  it('membawa kode, retryable, dan context', () => {
    const error = new AppError('STORAGE_FULL', 'penuh', { retryable: false, context: { free: 0 } });
    expect(isAppError(error)).toBe(true);
    expect(error.code).toBe('STORAGE_FULL');
    expect(error.retryable).toBe(false);
    expect(error.context).toEqual({ free: 0 });
  });
});

describe('toAppError', () => {
  it('mempertahankan AppError yang sudah ada', () => {
    const original = new AppError('AI_FAILED', 'gagal');
    expect(toAppError(original)).toBe(original);
  });

  it('membungkus Error biasa', () => {
    const wrapped = toAppError(new Error('rusak'), 'TRANSCRIPTION_FAILED');
    expect(wrapped.code).toBe('TRANSCRIPTION_FAILED');
    expect(wrapped.message).toBe('rusak');
  });

  it('menangani non-Error tanpa melempar', () => {
    const wrapped = toAppError('string error');
    expect(wrapped.code).toBe('UNKNOWN');
    expect(wrapped.message).toBe('string error');
  });
});

describe('friendlyMessage', () => {
  it('pesan Bahasa Indonesia untuk kasus umum', () => {
    expect(friendlyMessage(new AppError('PERMISSION_DENIED', 'x'))).toContain('Microphone');
    expect(friendlyMessage(new AppError('STORAGE_FULL', 'x'))).toContain('hampir penuh');
    expect(friendlyMessage(new AppError('TRANSCRIPTION_FAILED', 'x'))).toContain(
      'Audio tetap aman',
    );
    expect(friendlyMessage(new AppError('AI_FAILED', 'x'))).toContain('Transkrip tetap tersedia');
    expect(friendlyMessage(new AppError('NETWORK_ERROR', 'x'))).toContain('Offline');
  });

  it('error non-AppError tetap aman ditampilkan', () => {
    expect(friendlyMessage(new Error('rahasia'))).toContain('Data Anda tetap aman');
    expect(friendlyMessage('apapun')).toContain('Data Anda tetap aman');
  });
});
