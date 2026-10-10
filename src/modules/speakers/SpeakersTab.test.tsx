import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositoriesProvider } from '../../app/RepositoriesContext';
import { useToastStore } from '../../app/toastStore';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import { createId } from '../../core/utils/id';
import { SpeakersTab } from './SpeakersTab';

let meetingId = '';

async function seedMeeting(): Promise<void> {
  const meeting = await getRepositories().meetings.create({
    title: 'Rapat Pembicara',
    date: '2026-10-07',
  });
  meetingId = meeting.id;
}

async function seedSpeaker(displayName: string, durationSeconds: number, segmentCount: number) {
  return getRepositories().speakers.add({
    id: createId(),
    meetingId,
    code: `speaker_${createId().slice(0, 4)}`,
    displayName,
    durationSeconds,
    segmentCount,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={[`/rapat/${meetingId}/pembicara`]}>
      <RepositoriesProvider>
        <Routes>
          <Route path="/rapat/:meetingId/pembicara" element={<SpeakersTab />} />
        </Routes>
      </RepositoriesProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetRepositories();
  useToastStore.setState({ message: null });
  await clearAllLocalData();
  await seedMeeting();
});

describe('SpeakersTab — pengelolaan pembicara (PRD §13–14)', () => {
  it('tanpa pembicara → keadaan kosong jujur (menunggu diarization)', async () => {
    renderTab();

    expect(await screen.findByText('Belum ada pembicara')).toBeInTheDocument();
  });

  it('rename persist ke repository (PRD §13: nama manual oleh pengguna)', async () => {
    const speaker = await seedSpeaker('Pembicara 1', 60, 2);
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Ubah nama Pembicara 1' }));
    fireEvent.change(screen.getByLabelText('Nama pembicara baru'), {
      target: { value: 'Kepala Sekolah' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByRole('heading', { name: 'Kepala Sekolah' })).toBeInTheDocument();
    const stored = (await getRepositories().speakers.listByMeeting(meetingId)).find(
      (item) => item.id === speaker.id,
    );
    expect(stored?.displayName).toBe('Kepala Sekolah');
    expect(useToastStore.getState().message).toBe('Nama pembicara diperbarui.');
  });

  it('menampilkan durasi, persentase, dan jumlah segmen (PRD §14)', async () => {
    await seedSpeaker('Kepala Sekolah', 60, 4);
    await seedSpeaker('Operator', 40, 3);
    renderTab();

    expect(await screen.findByText('Kepala Sekolah')).toBeInTheDocument();
    // 60 / (60+40) = 60%
    expect(screen.getByText(/Durasi 01:00 • 60% • 4 segmen/)).toBeInTheDocument();
    expect(screen.getByText(/Durasi 00:40 • 40% • 3 segmen/)).toBeInTheDocument();
  });

  it('menambah pembicara baru dengan nama default', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /Tambah Pembicara/ }));

    expect(await screen.findByRole('heading', { name: 'Pembicara 1' })).toBeInTheDocument();
    expect(useToastStore.getState().message).toBe('Pembicara ditambahkan.');
    const speakers = await getRepositories().speakers.listByMeeting(meetingId);
    expect(speakers).toHaveLength(1);
    expect(speakers[0]?.displayName).toBe('Pembicara 1');
  });

  it('nama kosong saat rename diabaikan (tidak menyimpan string kosong)', async () => {
    const speaker = await seedSpeaker('Pembicara 1', 10, 1);
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Ubah nama Pembicara 1' }));
    fireEvent.change(screen.getByLabelText('Nama pembicara baru'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    const stored = (await getRepositories().speakers.listByMeeting(meetingId)).find(
      (item) => item.id === speaker.id,
    );
    expect(stored?.displayName).toBe('Pembicara 1');
  });
});
