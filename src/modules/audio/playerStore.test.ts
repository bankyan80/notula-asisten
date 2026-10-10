import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeAudioElement,
  type FakeAudioElement,
} from '../../../tests/helpers/fakeAudioElement';
import type { AudioChunk } from '../../core/types/entities';
import { MemStorage } from '../recording/memStorage';
import { resetPlayerForTests, setAudioElementFactoryForTests, usePlayerStore } from './playerStore';

function chunk(sequence: number, start: number, end: number): AudioChunk {
  return {
    id: `chunk-${sequence}`,
    meetingId: 'm1',
    sequence,
    localPath: `Meetings/m1/audio/${String(sequence).padStart(6, '0')}.m4a`,
    startTime: start,
    endTime: end,
    durationSeconds: end - start,
    mimeType: 'audio/webm',
    uploadStatus: 'PENDING',
    transcriptionStatus: 'DONE',
    transcriptionAttempts: 1,
    createdAt: '2026-10-07T10:00:00.000Z',
  };
}

let fake: FakeAudioElement;
let storage: MemStorage;

async function seedStorage(): Promise<void> {
  storage = new MemStorage();
  await storage.writeBlob('Meetings/m1/audio/000001.m4a', new Blob(['chunk-1']));
  await storage.writeBlob('Meetings/m1/audio/000002.m4a', new Blob(['chunk-2']));
}

function attach(chunks: AudioChunk[], target: MemStorage = storage): void {
  usePlayerStore.getState().attach({ meetingId: 'm1', chunks, storage: target });
}

beforeEach(() => {
  resetPlayerForTests();
  fake = createFakeAudioElement();
  setAudioElementFactoryForTests(() => fake.element);
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  URL.revokeObjectURL = vi.fn();
});

describe('playerStore — satu state lintas-chunk', () => {
  it('attach: timeline terurut & duration = akhir chunk terakhir', async () => {
    await seedStorage();
    attach([chunk(2, 300, 600), chunk(1, 0, 300)]);

    const state = usePlayerStore.getState();
    expect(state.timeline.map((span) => span.sequence)).toEqual([1, 2]);
    expect(state.duration).toBe(600);
    expect(state.meetingId).toBe('m1');
  });

  it('klik teks (PRD §12.1): playFrom membaca file chunk yang tepat & menyetel offset', async () => {
    await seedStorage();
    const readBlob = vi.spyOn(storage, 'readBlob');
    attach([chunk(1, 0, 300), chunk(2, 300, 600)]);

    await usePlayerStore.getState().playFrom(410); // di dalam chunk 2

    expect(readBlob).toHaveBeenCalledWith('Meetings/m1/audio/000002.m4a');
    expect(fake.src).toBe('blob:fake-url');
    expect(fake.currentTime).toBe(110); // 410 - 300
    expect(usePlayerStore.getState()).toMatchObject({
      currentTime: 410,
      playing: true,
      loading: false,
      error: null,
    });
  });

  it('ganti chunk di tengah jalan: revoke URL lama & baca file baru', async () => {
    await seedStorage();
    attach([chunk(1, 0, 300), chunk(2, 300, 600)]);

    await usePlayerStore.getState().playFrom(10);
    await usePlayerStore.getState().playFrom(320);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    expect(fake.currentTime).toBe(20);
    expect(usePlayerStore.getState().currentTime).toBe(320);
  });

  it('file chunk habis (ended) → otomatis lanjut chunk berikutnya', async () => {
    await seedStorage();
    const readBlob = vi.spyOn(storage, 'readBlob');
    attach([chunk(1, 0, 300), chunk(2, 300, 600)]);

    await usePlayerStore.getState().playFrom(10);
    fake.emitEnded();

    await vi.waitFor(() => {
      expect(usePlayerStore.getState().currentTime).toBe(300);
      expect(usePlayerStore.getState().playing).toBe(true);
    });
    expect(readBlob).toHaveBeenCalledWith('Meetings/m1/audio/000002.m4a');
    expect(fake.currentTime).toBe(0);
  });

  it('chunk terakhir ended → berhenti dengan jujur (tanpa error)', async () => {
    await seedStorage();
    attach([chunk(1, 0, 300)]);

    await usePlayerStore.getState().playFrom(10);
    fake.emitEnded();

    await vi.waitFor(() => {
      expect(usePlayerStore.getState().playing).toBe(false);
    });
    expect(usePlayerStore.getState().error).toBeNull();
  });

  it('readBlob gagal → pesan ramah, tidak ada yang berpura-pura jalan', async () => {
    const kosong = new MemStorage(); // tanpa file sama sekali
    attach([chunk(1, 0, 300)], kosong);

    await usePlayerStore.getState().playFrom(10);

    expect(usePlayerStore.getState()).toMatchObject({
      playing: false,
      loading: false,
      error: 'Audio rapat tidak dapat dimuat dari perangkat.',
    });
  });

  it('timeline kosong → playFrom diam (audio "aktif setelah tersedia"), storage tidak disentuh', async () => {
    await seedStorage();
    const readBlob = vi.spyOn(storage, 'readBlob');
    attach([]);

    await usePlayerStore.getState().playFrom(10);

    expect(readBlob).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().error).toBeNull();
    expect(usePlayerStore.getState().playing).toBe(false);
  });

  it('seek saat jeda: state & posisi file chunk ikut bergeser', async () => {
    await seedStorage();
    attach([chunk(1, 0, 300), chunk(2, 300, 600)]);
    await usePlayerStore.getState().playFrom(10);
    usePlayerStore.getState().pause();

    usePlayerStore.getState().seek(50);

    expect(usePlayerStore.getState().currentTime).toBe(50);
    expect(fake.currentTime).toBe(50);
    expect(usePlayerStore.getState().playing).toBe(false);
  });

  it('seek ke chunk lain saat jeda → state pindah; file diganti saat berikutnya diputar', async () => {
    await seedStorage();
    attach([chunk(1, 0, 300), chunk(2, 300, 600)]);
    await usePlayerStore.getState().playFrom(10);
    usePlayerStore.getState().pause();

    usePlayerStore.getState().seek(500);

    expect(usePlayerStore.getState().currentTime).toBe(500);
    await usePlayerStore.getState().toggle(); // main dari posisi 500 → chunk 2
    await vi.waitFor(() => {
      expect(usePlayerStore.getState().playing).toBe(true);
      expect(fake.currentTime).toBe(200); // 500 - 300
    });
  });

  it('toggle: jeda saat berjalan, lanjut saat dijeda', async () => {
    await seedStorage();
    attach([chunk(1, 0, 300)]);

    await usePlayerStore.getState().playFrom(10);
    expect(usePlayerStore.getState().playing).toBe(true);

    usePlayerStore.getState().pause();
    expect(usePlayerStore.getState().playing).toBe(false);

    await usePlayerStore.getState().toggle();
    expect(usePlayerStore.getState().playing).toBe(true);
  });

  it('timeupdate memperbarui currentTime (Audio → Teks)', async () => {
    await seedStorage();
    attach([chunk(1, 0, 300)]);
    await usePlayerStore.getState().playFrom(10);

    fake.emitTimeUpdate(42.5);

    expect(usePlayerStore.getState().currentTime).toBe(42.5);
  });

  it('detach: state kembali awal, file URL dicabut', async () => {
    await seedStorage();
    attach([chunk(1, 0, 300)]);
    await usePlayerStore.getState().playFrom(10);

    usePlayerStore.getState().detach();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    expect(fake.src).toBe('');
    expect(usePlayerStore.getState()).toMatchObject({
      meetingId: null,
      timeline: [],
      duration: 0,
      currentTime: 0,
      playing: false,
      error: null,
    });
  });

  it('attach rapat berbeda → posisi & audio lama di-reset', async () => {
    await seedStorage();
    attach([chunk(1, 0, 300)]);
    await usePlayerStore.getState().playFrom(10);

    usePlayerStore.getState().attach({ meetingId: 'm2', chunks: [], storage });

    expect(usePlayerStore.getState()).toMatchObject({
      meetingId: 'm2',
      currentTime: 0,
      playing: false,
      timeline: [],
    });
    expect(fake.src).toBe('');
  });
});
