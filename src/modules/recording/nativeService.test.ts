import { describe, expect, it } from 'vitest';

import {
  isNativeRecordingServiceAvailable,
  startNativeRecordingService,
  stopNativeRecordingService,
} from './nativeService';

describe('nativeService (bridge foreground service Android)', () => {
  it('tidak tersedia di web/jsdom', () => {
    expect(isNativeRecordingServiceAvailable()).toBe(false);
  });

  it('start mengembalikan false (no-op jujur) di web', async () => {
    await expect(startNativeRecordingService()).resolves.toBe(false);
  });

  it('stop mengembalikan false (no-op jujur) di web', async () => {
    await expect(stopNativeRecordingService()).resolves.toBe(false);
  });
});
