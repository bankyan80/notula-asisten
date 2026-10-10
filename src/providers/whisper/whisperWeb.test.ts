import { describe, expect, it } from 'vitest';
import { AppError } from '../../core/errors/AppError';
import type { TranscribeRequest } from '../../core/types/providers';
import { isWhisperSupportedEnvironment, WhisperWebSpeechToTextProvider } from './whisperWeb';

function fakeRequest(): { storageTouched: boolean; request: TranscribeRequest } {
  const fake: { storageTouched: boolean; request: TranscribeRequest } = {
    storageTouched: false,
    request: {
      chunk: {
        id: 'c1',
        meetingId: 'm1',
        sequence: 1,
        localPath: 'Meetings/m1/audio/000001.m4a',
        startTime: 0,
        endTime: 300,
        durationSeconds: 300,
        mimeType: 'audio/webm',
        uploadStatus: 'PENDING',
        transcriptionStatus: 'PENDING',
        transcriptionAttempts: 0,
        createdAt: '2026-10-07T10:00:00.000Z',
      },
      language: 'id',
      dictionary: ['TKA'],
      sequenceOffset: 0,
      readAudio: async () => {
        fake.storageTouched = true;
        return new Blob(['audio']);
      },
    },
  };
  return fake;
}

describe('WhisperWebSpeechToTextProvider — kejujuran lingkungan', () => {
  it('jsdom tidak punya AudioContext → lingkungan tidak didukung', () => {
    expect(isWhisperSupportedEnvironment()).toBe(false);
  });

  it('isAvailable() melaporkan false di lingkungan tanpa dukungan penuh', async () => {
    const provider = new WhisperWebSpeechToTextProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('transcribeChunk langsung menolak TANPA membaca storage (gagal cepat & jujur)', async () => {
    const provider = new WhisperWebSpeechToTextProvider();
    const fake = fakeRequest();

    await expect(provider.transcribeChunk(fake.request)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
    });
    expect(fake.storageTouched).toBe(false);
  });

  it('error yang dilempar berupa AppError (kontrak error aplikasi)', async () => {
    const provider = new WhisperWebSpeechToTextProvider();
    const fake = fakeRequest();
    const error = await provider.transcribeChunk(fake.request).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AppError);
  });
});
