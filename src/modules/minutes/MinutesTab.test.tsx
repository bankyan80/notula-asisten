import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositoriesProvider } from '../../app/RepositoriesContext';
import { useToastStore } from '../../app/toastStore';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import { MinutesTab } from './MinutesTab';

let meetingId = '';

async function seedMeeting(): Promise<void> {
  const meeting = await getRepositories().meetings.create({
    title: 'Rapat Sekolah',
    date: '2026-10-07',
  });
  meetingId = meeting.id;
}

async function seedMaterial(): Promise<void> {
  await getRepositories().transcript.addSegments([
    {
      id: 'seg-1',
      meetingId,
      startTime: 0,
      endTime: 30,
      text: 'Kita bahas data semester.',
      sequence: 0,
      createdAt: new Date().toISOString(),
    },
  ]);
  await getRepositories().summaries.save({
    id: 'sum-1',
    meetingId,
    content: 'Rapat membahas data semester.',
    topics: ['data semester'],
    undecided: ['Menunggu keputusan'],
    sourceSegmentIds: ['seg-1'],
    createdAt: new Date().toISOString(),
  });
  await getRepositories().decisions.replaceForMeeting(meetingId, [
    {
      id: 'dec-1',
      meetingId,
      content: 'Disepakati data diverifikasi.',
      sourceTimestamp: 10,
      sourceSegmentId: 'seg-1',
      createdAt: new Date().toISOString(),
    },
  ]);
  await getRepositories().actionItems.replaceForMeeting(meetingId, [
    {
      id: 'act-1',
      meetingId,
      task: 'Operator akan mengirim rekap besok.',
      assignee: 'Operator',
      deadline: 'besok',
      status: 'OPEN',
      sourceTimestamp: 20,
      sourceSegmentId: 'seg-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={[`/rapat/${meetingId}/notulen`]}>
      <RepositoriesProvider>
        <Routes>
          <Route path="/rapat/:meetingId/notulen" element={<MinutesTab />} />
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

describe('MinutesTab — notulen otomatis (PRD §17/§18)', () => {
  it('tanpa bahan → tombol dinonaktifkan & penjelasan jujur', async () => {
    renderTab();

    expect(await screen.findByRole('button', { name: /Buat Notulen/ })).toBeDisabled();
    expect(await screen.findByText(/dari transkrip dan ringkasan rapat/i)).toBeInTheDocument();
    // 8 template PRD §18 tetap bisa dipilih lebih awal.
    expect(screen.getByRole('combobox', { name: 'Template notulen' })).toBeInTheDocument();
  });

  it('membuat notulen tersimpan: 7 section + isi keputusan/PIC/deadline', async () => {
    await seedMaterial();
    renderTab();

    const button = await screen.findByRole('button', { name: /Buat Notulen/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(useToastStore.getState().message).toBe('Notulen berhasil dibuat.'));

    const minutes = await getRepositories().minutes.get(meetingId);
    expect(minutes).not.toBeNull();
    expect(minutes?.sections).toHaveLength(7);
    expect(minutes?.templateId).toBe('umum');

    const decisionSection = minutes?.sections.find((section) => section.key === 'keputusan');
    expect(decisionSection?.lines[0]).toContain('Disepakati data diverifikasi.');
    expect(decisionSection?.lines[0]).toContain('sumber: 00:00:10');

    expect(await screen.findByRole('heading', { name: 'KEPUTUSAN' })).toBeInTheDocument();
    expect(screen.getByText('Operator — Operator akan mengirim rekap besok.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buat Ulang Notulen/ })).toBeInTheDocument();
  });

  it('memilih template proyek → judul section sesuai template (PRD §18)', async () => {
    await seedMaterial();
    renderTab();

    fireEvent.change(await screen.findByRole('combobox', { name: 'Template notulen' }), {
      target: { value: 'proyek' },
    });
    const button = await screen.findByRole('button', { name: /Buat Notulen/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(useToastStore.getState().message).toBe('Notulen berhasil dibuat.'));

    const minutes = await getRepositories().minutes.get(meetingId);
    expect(minutes?.templateId).toBe('proyek');
    expect(minutes?.sections.find((section) => section.key === 'catatan')?.title).toBe(
      'RISIKO & CATATAN',
    );

    // Pilihan template ikut tersimpan ke rapat.
    const storedMeeting = await getRepositories().meetings.getById(meetingId);
    expect(storedMeeting?.minutesTemplateId).toBe('proyek');
  });

  it('buat ulang mengganti notulen lama dengan template terbaru', async () => {
    await seedMaterial();
    renderTab();

    const button = await screen.findByRole('button', { name: /Buat Notulen/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(useToastStore.getState().message).toBe('Notulen berhasil dibuat.'));

    useToastStore.setState({ message: null });
    fireEvent.change(screen.getByRole('combobox', { name: 'Template notulen' }), {
      target: { value: 'evaluasi' },
    });
    const recreate = await screen.findByRole('button', { name: /Buat Ulang Notulen/ });
    fireEvent.click(recreate);

    await waitFor(() => expect(useToastStore.getState().message).toBe('Notulen berhasil dibuat.'));
    const minutes = await getRepositories().minutes.get(meetingId);
    expect(minutes?.templateId).toBe('evaluasi');
    expect(minutes?.sections.find((section) => section.key === 'keputusan')?.title).toBe(
      'TEMUAN & KEPUTUSAN',
    );
  });
});
