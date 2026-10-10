import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../core/errors/AppError';
import type { RecordingChunkEvent, RecordingState } from '../../core/types/providers';
import { WebRecordingEngine } from './webEngine';

interface FakeTrack {
  stop: () => void;
}

function createFakeStream(): { stream: MediaStream; track: FakeTrack } {
  const track: FakeTrack = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

/**
 * Pengganti MediaRecorder untuk jsdom: perilaku timeslice disederhanakan —
 * `stop()` selalu mem-flush satu dataavailable terakhir sebelum `onstop`,
 * persis seperti perilaku browser asli.
 */
class FakeMediaRecorder {
  static isTypeSupported(type: string): boolean {
    return type.startsWith('audio/webm');
  }
  static instances: FakeMediaRecorder[] = [];

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly mimeType: string;
  lastTimeslice: number | undefined;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    FakeMediaRecorder.instances.push(this);
  }

  start(timeslice?: number): void {
    this.lastTimeslice = timeslice;
    this.state = 'recording';
    // Seperti browser asli: event `start` dikirim setelah recorder aktif.
    this.onstart?.();
  }

  pause(): void {
    this.state = 'paused';
  }

  resume(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.flush(new Blob(['final'], { type: this.mimeType }));
    this.state = 'inactive';
    this.onstop?.();
  }

  /** Menirukan dataavailable dari timeslice. */
  flush(blob: Blob): void {
    this.ondataavailable?.({ data: blob });
  }
}

function latestRecorder(): FakeMediaRecorder {
  const recorder = FakeMediaRecorder.instances.at(-1);
  if (!recorder) throw new Error('MediaRecorder belum dibuat');
  return recorder;
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  FakeMediaRecorder.instances = [];
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

function startOptions(overrides?: Partial<{ chunkDurationSeconds: number }>) {
  return { meetingId: 'm1', language: 'id', chunkDurationSeconds: 5, ...overrides };
}

describe('WebRecordingEngine', () => {
  it('memulai rekaman dengan timeslice dan mengirim chunk berurutan', async () => {
    const { stream } = createFakeStream();
    getUserMedia.mockResolvedValue(stream);

    const engine = new WebRecordingEngine();
    expect(engine.isSupported()).toBe(true);

    const chunks: RecordingChunkEvent[] = [];
    const statuses: RecordingState['status'][] = [];
    engine.onChunk((event) => chunks.push(event));
    engine.onStateChange((state) => statuses.push(state.status));

    await engine.start(startOptions());
    expect(engine.getState()).toMatchObject({
      status: 'recording',
      meetingId: 'm1',
      currentSequence: 1,
      elapsedSeconds: 0,
    });
    expect(statuses).toEqual(['requesting_permission', 'recording']);
    expect(latestRecorder().lastTimeslice).toBe(5000);

    vi.advanceTimersByTime(3000);
    expect(engine.getState().elapsedSeconds).toBe(3);

    latestRecorder().flush(new Blob(['chunk-1'], { type: 'audio/webm' }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      meetingId: 'm1',
      sequence: 1,
      startTime: 0,
      endTime: 3,
      mimeType: 'audio/webm',
    });
    expect(engine.getState().currentSequence).toBe(2);

    const result = await engine.stop();
    expect(result.meetingId).toBe('m1');
    // chunk-1 + flush terakhir saat stop
    expect(result.chunkCount).toBe(2);
    expect(result.totalDurationSeconds).toBe(3);
    expect(engine.getState().status).toBe('stopped');
    expect(chunks.map((chunk) => chunk.sequence)).toEqual([1, 2]);
    expect(chunks[1]).toMatchObject({ startTime: 3, endTime: 3 });
  });

  it('pause membekukan timeline dan resume melanjutkan', async () => {
    getUserMedia.mockResolvedValue(createFakeStream().stream);
    const engine = new WebRecordingEngine();

    await engine.start(startOptions());
    vi.advanceTimersByTime(2000);

    await engine.pause();
    expect(engine.getState()).toMatchObject({ status: 'paused', elapsedSeconds: 2 });
    expect(latestRecorder().state).toBe('paused');

    vi.advanceTimersByTime(10_000);
    expect(engine.getState().elapsedSeconds).toBe(2);

    await engine.resume();
    expect(engine.getState().status).toBe('recording');
    vi.advanceTimersByTime(1000);
    expect(engine.getState().elapsedSeconds).toBe(3);

    const result = await engine.stop();
    expect(result.totalDurationSeconds).toBe(3);
  });

  it('izin microphone ditolak menjadi PERMISSION_DENIED dan state error', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const engine = new WebRecordingEngine();

    await expect(engine.start(startOptions())).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
    expect(engine.getState()).toMatchObject({
      status: 'error',
      errorCode: 'PERMISSION_DENIED',
    });
  });

  it('menolak start ganda dan aksi di luar state yang sah', async () => {
    getUserMedia.mockResolvedValue(createFakeStream().stream);
    const engine = new WebRecordingEngine();

    await expect(engine.pause()).rejects.toBeInstanceOf(AppError);
    await expect(engine.stop()).rejects.toBeInstanceOf(AppError);

    await engine.start(startOptions());
    await expect(engine.start(startOptions())).rejects.toMatchObject({
      code: 'RECORDING_FAILED',
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('stop menutup sesi dan menghentikan track mikrofon', async () => {
    const { stream, track } = createFakeStream();
    getUserMedia.mockResolvedValue(stream);
    const engine = new WebRecordingEngine();

    await engine.start(startOptions());
    await engine.stop();

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(engine.getState()).toMatchObject({ status: 'stopped', meetingId: 'm1' });
    expect(engine.getState().errorCode).toBeUndefined();
  });

  it('jujur: isSupported() false dan start() gagal tanpa MediaRecorder', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const engine = new WebRecordingEngine();

    expect(engine.isSupported()).toBe(false);
    await expect(engine.start(startOptions())).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(engine.getState().status).toBe('idle');
  });
});
