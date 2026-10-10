import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoriesProvider } from '../../app/RepositoriesContext';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import type { MeetingStatus } from '../../core/types/entities';
import { createId } from '../../core/utils/id';
import { MemStorage } from '../recording/memStorage';
import {
  resetPlayerForTests,
  setAudioElementFactoryForTests,
  usePlayerStore,
} from '../audio/playerStore';
import { createFakeAudioElement } from '../../../tests/helpers/fakeAudioElement';
import { useToastStore } from '../../app/toastStore';
import { TranscriptTab } from './TranscriptTab';

let meetingId = '';
let segmentId = '';

async function seedMeeting(status: MeetingStatus): Promise<void> {
  const meeting = await getRepositories().meetings.create({
    title: 'Rapat Uji Transkrip',
    date: '2026-10-07',
  });
  meetingId = meeting.id;
  await getRepositories().meetings.update(meeting.id, { status });
}

async function seedSegment(text = 'Segmen uji'): Promise<void> {
  segmentId = createId();
  await getRepositories().transcript.addSegments([
    {
      id: segmentId,
      meetingId,
      startTime: 40,
      endTime: 55,
      text,
      sequence: 0,
      createdAt: new Date().toISOString(),
    },
  ]);
}

/** Lampirkan 1 file audio (0–300 dtk) ke player store — cukup untuk semua kasus klik. */
async function attachAudio(): Promise<void> {
  const storage = new MemStorage();
  await storage.writeBlob(`Meetings/${meetingId}/audio/000001.m4a`, new Blob(['audio']));
  usePlayerStore.getState().attach({
    meetingId,
    chunks: [
      {
        id: 'chunk-1',
        meetingId,
        sequence: 1,
        localPath: `Meetings/${meetingId}/audio/000001.m4a`,
        startTime: 0,
        endTime: 300,
        durationSeconds: 300,
        mimeType: 'audio/webm',
        uploadStatus: 'PENDING',
        transcriptionStatus: 'DONE',
        transcriptionAttempts: 1,
        createdAt: new Date().toISOString(),
      },
    ],
    storage,
  });
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={[`/rapat/${meetingId}/transkrip`]}>
      <RepositoriesProvider>
        <Routes>
          <Route path="/rapat/:meetingId/transkrip" element={<TranscriptTab />} />
        </Routes>
      </RepositoriesProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetRepositories();
  resetPlayerForTests();
  setAudioElementFactoryForTests(() => createFakeAudioElement().element);
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  URL.revokeObjectURL = vi.fn();
  await clearAllLocalData();
});

describe('TranscriptTab — banner status transkripsi', () => {
  it('meeting PROCESSING tanpa segmen → menunggu diproses', async () => {
    await seedMeeting('PROCESSING');
    renderTab();

    expect(await screen.findByText(/Transkripsi menunggu diproses/)).toBeInTheDocument();
  });

  it('meeting PROCESSING yang sudah punya segmen TIDAK menampilkan banner menunggu', async () => {
    await seedMeeting('PROCESSING');
    await seedSegment();
    renderTab();

    expect(await screen.findByText('Segmen uji')).toBeInTheDocument();
    expect(screen.queryByText(/Transkripsi menunggu diproses/)).not.toBeInTheDocument();
  });

  it('meeting TRANSCRIBING → banner sedang berjalan (segmen tampil bertahap)', async () => {
    await seedMeeting('TRANSCRIBING');
    renderTab();

    expect(await screen.findByText(/Sedang mengubah suara menjadi teks/)).toBeInTheDocument();
  });

  it('meeting ERROR → banner gagal dengan pesan bahwa audio aman', async () => {
    await seedMeeting('ERROR');
    renderTab();

    expect(await screen.findByText(/Transkripsi gagal — audio tetap aman/)).toBeInTheDocument();
  });

  it('meeting COMPLETED dengan segmen → tanpa banner', async () => {
    await seedMeeting('COMPLETED');
    await seedSegment('Sudah selesai');
    renderTab();

    expect(await screen.findByText('Sudah selesai')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('TranscriptTab — sync audio ↔ teks (PRD §12)', () => {
  it('klik kalimat → player melompat ke timestamp segmen (PRD §12.1)', async () => {
    await seedMeeting('COMPLETED');
    await seedSegment();
    await attachAudio();
    renderTab();

    const row = await screen.findByRole('button', { name: /Segmen uji/ });
    fireEvent.click(row);

    await vi.waitFor(() => {
      expect(usePlayerStore.getState().currentTime).toBe(40);
      expect(usePlayerStore.getState().playing).toBe(true);
    });
  });

  it('posisi audio aktif → segmen itu disorot dengan aria-current (PRD §12.2)', async () => {
    await seedMeeting('COMPLETED');
    await seedSegment('Segmen yang disorot');
    renderTab();

    expect(await screen.findByText('Segmen yang disorot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Segmen yang disorot/ })).not.toHaveAttribute(
      'aria-current',
    );

    act(() => {
      usePlayerStore.setState({ currentTime: 47 });
    });

    expect(screen.getByRole('button', { name: /Segmen yang disorot/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByText('● sedang berjalan')).toBeInTheDocument();
  });

  it('posisi di luar semua segmen → tidak ada yang disorot', async () => {
    await seedMeeting('COMPLETED');
    await seedSegment();
    renderTab();

    await screen.findByRole('button', { name: /Segmen uji/ });
    act(() => {
      usePlayerStore.setState({ currentTime: 5 });
    });

    expect(screen.getByRole('button', { name: /Segmen uji/ })).not.toHaveAttribute('aria-current');
  });

  it('klik hasil pencarian → lompat ke timestamp hasil itu (PRD §12.3)', async () => {
    await seedMeeting('COMPLETED');
    await seedSegment('Data NISN sudah valid');
    await attachAudio();
    renderTab();

    fireEvent.change(await screen.findByLabelText('Cari dalam transkrip'), {
      target: { value: 'NISN' },
    });
    const result = await screen.findByRole('button', { name: /Data NISN sudah valid/ });
    fireEvent.click(result);

    await vi.waitFor(() => {
      expect(usePlayerStore.getState().currentTime).toBe(40);
      expect(usePlayerStore.getState().playing).toBe(true);
    });
  });
});

describe('TranscriptTab — koreksi transkrip (PRD §43, AC §52 #16)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useToastStore.setState({ message: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function seedTwoSegments(): Promise<void> {
    await getRepositories().transcript.addSegments([
      {
        id: 'seg-a',
        meetingId,
        startTime: 40,
        endTime: 55,
        text: 'Segmen pertama',
        sequence: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'seg-b',
        meetingId,
        startTime: 55,
        endTime: 70,
        text: 'Segmen kedua',
        sequence: 1,
        createdAt: new Date().toISOString(),
      },
    ]);
    await getRepositories().speakers.add({
      id: 'sp-1',
      meetingId,
      code: 'speaker_1',
      displayName: 'Pak Budi',
      durationSeconds: 30,
      segmentCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  it('edit teks → tersimpan sebagai versi terbaru + penanda "diedit"', async () => {
    await seedMeeting('COMPLETED');
    await seedSegment('Teks salah eja');
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /Edit segmen/ }));
    const textarea = await screen.findByLabelText('Teks segmen');
    fireEvent.change(textarea, { target: { value: 'Teks sudah dikoreksi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await vi.waitFor(() =>
      expect(useToastStore.getState().message).toBe('Perubahan transkrip disimpan.'),
    );
    expect(await screen.findByText('Teks sudah dikoreksi')).toBeInTheDocument();
    expect(screen.getByText('✎ diedit')).toBeInTheDocument();

    const [stored] = await getRepositories().transcript.listByMeeting(meetingId);
    expect(stored?.text).toBe('Teks sudah dikoreksi');
    expect(stored?.editedAt).toBeDefined();
  });

  it('koreksi timestamp & pembicara → tersimpan', async () => {
    await seedMeeting('COMPLETED');
    await seedTwoSegments();
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /Edit segmen 00:00:40/ }));
    fireEvent.change(await screen.findByLabelText('Mulai (detik)'), {
      target: { value: '41.5' },
    });
    fireEvent.change(await screen.findByLabelText('Pembicara'), { target: { value: 'sp-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await vi.waitFor(() =>
      expect(useToastStore.getState().message).toBe('Perubahan transkrip disimpan.'),
    );
    const [stored] = await getRepositories().transcript.listByMeeting(meetingId);
    expect(stored?.startTime).toBe(41.5);
    expect(stored?.speakerId).toBe('sp-1');
    expect(screen.getByText('Pak Budi')).toBeInTheDocument();
  });

  it('teks kosong → ditolak dengan pesan, data tidak berubah', async () => {
    await seedMeeting('COMPLETED');
    await seedSegment('Teks asli');
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /Edit segmen/ }));
    fireEvent.change(await screen.findByLabelText('Teks segmen'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await vi.waitFor(() =>
      expect(useToastStore.getState().message).toBe('Teks segmen tidak boleh kosong.'),
    );
    const [stored] = await getRepositories().transcript.listByMeeting(meetingId);
    expect(stored?.text).toBe('Teks asli');
  });

  it('hapus satu segmen (PRD §26) → tinggal segmen lain, rapat tetap ada', async () => {
    await seedMeeting('COMPLETED');
    await seedTwoSegments();
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /Edit segmen 00:00:40/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }));

    await vi.waitFor(() => expect(useToastStore.getState().message).toBe('Segmen dihapus.'));
    const remaining = await getRepositories().transcript.listByMeeting(meetingId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.text).toBe('Segmen kedua');
    expect(await getRepositories().meetings.getById(meetingId)).not.toBeNull();
  });

  it('gabungkan dengan segmen berikutnya → teks & akhir menyatu', async () => {
    await seedMeeting('COMPLETED');
    await seedTwoSegments();
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /Edit segmen 00:00:40/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gabung' }));

    await vi.waitFor(() => expect(useToastStore.getState().message).toBe('Segmen digabungkan.'));
    const segments = await getRepositories().transcript.listByMeeting(meetingId);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.text).toBe('Segmen pertama Segmen kedua');
    expect(segments[0]?.endTime).toBe(70);
  });

  it('pecah segmen → dua segmen dengan batas waktu yang masuk akal', async () => {
    await seedMeeting('COMPLETED');
    await seedSegment('Kata pertama dan kata kedua serta kata ketiga yang panjang');
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /Edit segmen/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pecah' }));

    await vi.waitFor(() => expect(useToastStore.getState().message).toBe('Segmen dipecah.'));
    const segments = await getRepositories().transcript.listByMeeting(meetingId);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.text.length ?? 0).toBeGreaterThan(0);
    expect(segments[1]?.text.length ?? 0).toBeGreaterThan(0);
    expect(segments[0]?.endTime).toBe(segments[1]?.startTime);
    expect(segments[1]?.endTime).toBe(55);
    expect(segments[1]?.sequence).toBe(0.5);
  });
});
