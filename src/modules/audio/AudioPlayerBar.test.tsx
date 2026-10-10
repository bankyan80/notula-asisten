import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeAudioElement,
  type FakeAudioElement,
} from '../../../tests/helpers/fakeAudioElement';
import type { AudioChunk } from '../../core/types/entities';
import { MemStorage } from '../recording/memStorage';
import { AudioPlayerBar } from './AudioPlayerBar';
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

async function seedWithTwoChunks(): Promise<void> {
  const storage = new MemStorage();
  await storage.writeBlob('Meetings/m1/audio/000001.m4a', new Blob(['chunk-1']));
  await storage.writeBlob('Meetings/m1/audio/000002.m4a', new Blob(['chunk-2']));
  usePlayerStore
    .getState()
    .attach({ meetingId: 'm1', chunks: [chunk(1, 0, 300), chunk(2, 300, 600)], storage });
}

beforeEach(() => {
  resetPlayerForTests();
  fake = createFakeAudioElement();
  setAudioElementFactoryForTests(() => fake.element);
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  URL.revokeObjectURL = vi.fn();
});

describe('AudioPlayerBar', () => {
  it('tanpa audio (timeline kosong) → bar tidak tampil', () => {
    render(<AudioPlayerBar />);
    expect(screen.queryByRole('group', { name: 'Pemutar audio rapat' })).not.toBeInTheDocument();
  });

  it('menampilkan waktu sekarang / total dari store', async () => {
    await seedWithTwoChunks();
    render(<AudioPlayerBar />);

    expect(screen.getByRole('group', { name: 'Pemutar audio rapat' })).toBeInTheDocument();
    expect(screen.getByText('00:00:00 / 00:10:00')).toBeInTheDocument();
  });

  it('tombol putar → berjalan → label berubah jadi Jeda', async () => {
    await seedWithTwoChunks();
    render(<AudioPlayerBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Putar' }));
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Jeda' })).toBeInTheDocument();
    });
    expect(usePlayerStore.getState().playing).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Jeda' }));
    expect(usePlayerStore.getState().playing).toBe(false);
    expect(screen.getByRole('button', { name: 'Putar' })).toBeInTheDocument();
  });

  it('slider menggeser posisi (state yang sama dipakai Transkrip)', async () => {
    await seedWithTwoChunks();
    render(<AudioPlayerBar />);

    fireEvent.change(screen.getByLabelText('Posisi audio'), { target: { value: '125' } });

    expect(usePlayerStore.getState().currentTime).toBe(125);
    expect(screen.getByText('00:02:05 / 00:10:00')).toBeInTheDocument();
  });

  it('error store tampil sebagai pesan peringatan (jujur, bukan hilang diam)', async () => {
    await seedWithTwoChunks();
    usePlayerStore.setState({ error: 'Audio rapat tidak dapat dimuat dari perangkat.' });
    render(<AudioPlayerBar />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Audio rapat tidak dapat dimuat dari perangkat.',
    );
  });

  it('saat memuat: tombol nonaktif + keterangan', async () => {
    await seedWithTwoChunks();
    usePlayerStore.setState({ loading: true });
    render(<AudioPlayerBar />);

    expect(screen.getByText('Memuat audio…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Putar' })).toBeDisabled();
  });
});
