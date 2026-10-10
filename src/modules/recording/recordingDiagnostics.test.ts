import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeRecordingFailure,
  describeUnsupportedEngine,
  errorCodeForFailure,
  hasGetUserMedia,
  hasMediaRecorder,
  isPermissionFailure,
  isSecureContextAvailable,
} from './recordingDiagnostics';

function setSecureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
}

function setMediaDevices(value: unknown): void {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });
}

function domException(name: string, message = 'gagal'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'isSecureContext');
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('describeUnsupportedEngine — penyebab disebut apa adanya', () => {
  it('bukan secure context → menyebut HTTPS', () => {
    setSecureContext(false);
    setMediaDevices({ getUserMedia: () => Promise.resolve() });
    vi.stubGlobal('MediaRecorder', function FakeRecorder(): void {});

    expect(describeUnsupportedEngine()).toMatch(/HTTPS \(secure context\)/);
  });

  it('secure context tapi navigator.mediaDevices hilang → menyebut API microphone', () => {
    setSecureContext(true);
    setMediaDevices(undefined);
    vi.stubGlobal('MediaRecorder', function FakeRecorder(): void {});

    expect(describeUnsupportedEngine()).toMatch(/navigator\.mediaDevices/);
  });

  it('secure context + mediaDevices tapi tanpa MediaRecorder → menyebut MediaRecorder', () => {
    setSecureContext(true);
    setMediaDevices({ getUserMedia: () => Promise.resolve() });
    vi.stubGlobal('MediaRecorder', undefined);

    expect(describeUnsupportedEngine()).toMatch(/MediaRecorder/);
  });

  it('mendeteksi kondisi lingkungan', () => {
    setSecureContext(true);
    setMediaDevices({ getUserMedia: () => Promise.resolve() });
    vi.stubGlobal('MediaRecorder', function FakeRecorder(): void {});

    expect(isSecureContextAvailable()).toBe(true);
    expect(hasGetUserMedia()).toBe(true);
    expect(hasMediaRecorder()).toBe(true);
    expect(describeUnsupportedEngine()).toBe('Perekaman audio tidak tersedia di perangkat ini.');
  });
});

describe('describeRecordingFailure — per jenis kegagalan', () => {
  it('NotAllowedError → cara memberi izin', () => {
    expect(describeRecordingFailure(domException('NotAllowedError'))).toMatch(
      /Izin microphone ditolak/,
    );
    expect(describeRecordingFailure(domException('NotAllowedError'))).toMatch(/Izinkan/);
    expect(isPermissionFailure(domException('NotAllowedError'))).toBe(true);
    expect(errorCodeForFailure(domException('NotAllowedError'))).toBe('PERMISSION_DENIED');
  });

  it('NotFoundError → microphone tidak ada', () => {
    expect(describeRecordingFailure(domException('NotFoundError'))).toMatch(
      /Tidak ditemukan microphone/,
    );
    expect(errorCodeForFailure(domException('NotFoundError'))).toBe('RECORDING_FAILED');
  });

  it('NotReadableError → dipakai aplikasi lain', () => {
    expect(describeRecordingFailure(domException('NotReadableError'))).toMatch(/aplikasi lain/);
  });

  it('OverconstrainedError → konfigurasi tidak tersedia', () => {
    expect(describeRecordingFailure(domException('OverconstrainedError'))).toMatch(
      /Konfigurasi microphone/,
    );
  });

  it('SecurityError → HTTPS', () => {
    setSecureContext(false);
    expect(describeRecordingFailure(domException('SecurityError'))).toMatch(/HTTPS/);
    expect(errorCodeForFailure(domException('SecurityError'))).toBe('PERMISSION_DENIED');
  });

  it('NotSupportedError / AbortError → pesan masing-masing', () => {
    expect(describeRecordingFailure(domException('NotSupportedError'))).toMatch(/tidak didukung/);
    expect(describeRecordingFailure(domException('AbortError'))).toMatch(/dihentikan oleh sistem/);
  });

  it('mengikuti `cause` bila pesan digulung', () => {
    const wrapped = new Error('start()', { cause: domException('NotAllowedError') });
    expect(describeRecordingFailure(wrapped)).toMatch(/Izin microphone ditolak/);
  });

  it('penyebab tidak dikenal → null (pemanggil memakai cadangan)', () => {
    expect(describeRecordingFailure(domException('QuotaExceededError'))).toBeNull();
    expect(describeRecordingFailure('bukan error')).toBeNull();
    expect(describeRecordingFailure(undefined)).toBeNull();
    expect(describeRecordingFailure(domException('QuotaExceededError'))).toBeNull();
    expect(errorCodeForFailure('bukan error')).toBe('RECORDING_FAILED');
  });
});
