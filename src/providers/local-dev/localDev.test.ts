import { describe, expect, it } from 'vitest';
import type { AudioChunk } from '../../core/types/entities';
import { isAppError, type AppError } from '../../core/errors/AppError';
import { LocalDevAISummarizationProvider } from './aiSummary';
import { LocalDevSpeakerDiarizationProvider } from './speakerDiarization';
import { LocalDevSpeechToTextProvider } from './speechToText';

const chunk: AudioChunk = {
  id: 'c1',
  meetingId: 'm1',
  sequence: 1,
  localPath: 'Meetings/m1/audio/000001.m4a',
  startTime: 0,
  endTime: 300,
  durationSeconds: 300,
  mimeType: 'audio/mp4',
  uploadStatus: 'PENDING',
  transcriptionStatus: 'PENDING',
  transcriptionAttempts: 0,
  createdAt: new Date().toISOString(),
};

const readAudio = async (): Promise<Blob> => new Blob([new Uint8Array(1)]);

describe('provider local-dev', () => {
  it('speech-to-text menolak dengan jujur, tidak mengarang transkrip', async () => {
    const provider = new LocalDevSpeechToTextProvider();
    expect(await provider.isAvailable()).toBe(false);

    const error = await provider
      .transcribeChunk({ chunk, readAudio, language: 'id' })
      .catch((e: unknown) => e);

    expect(isAppError(error)).toBe(true);
    expect((error as AppError).code).toBe('PROVIDER_UNAVAILABLE');
    expect((error as AppError).retryable).toBe(true);
  });

  it('diarization tidak mengklaim identitas pembicara', async () => {
    const provider = new LocalDevSpeakerDiarizationProvider();
    expect(await provider.isAvailable()).toBe(false);

    const error = await provider
      .identifySegments({ chunk, readAudio, language: 'id' })
      .catch((e: unknown) => e);

    expect(isAppError(error)).toBe(true);
    expect((error as AppError).code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('AI summary tidak menghasilkan ringkasan palsu', async () => {
    const provider = new LocalDevAISummarizationProvider();
    expect(await provider.isAvailable()).toBe(false);

    const error = await provider
      .summarize({
        meeting: {
          id: 'm1',
          title: 'Rapat',
          date: '2026-10-07',
          participants: [],
          language: 'id',
          durationSeconds: 0,
          status: 'DRAFT',
          storageMode: 'device',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        segments: [],
        speakers: [],
        language: 'id',
      })
      .catch((e: unknown) => e);

    expect(isAppError(error)).toBe(true);
    expect((error as AppError).code).toBe('PROVIDER_UNAVAILABLE');
  });
});
