import { describe, expect, it } from 'vitest';
import { VadSpeakerDiarizationProvider } from './vadDiarization';

describe('VadSpeakerDiarizationProvider — kejujuran lingkungan', () => {
  it('jsdom tanpa Web Audio → isAvailable false (tidak mengarang hasil)', async () => {
    const provider = new VadSpeakerDiarizationProvider();
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it('membawa id provider yang stabil untuk konfigurasi', () => {
    expect(new VadSpeakerDiarizationProvider().id).toBe('vad-local');
  });
});
