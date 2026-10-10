import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositoriesProvider } from '../../app/RepositoriesContext';
import { useToastStore } from '../../app/toastStore';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import { SummaryTab } from './SummaryTab';

let meetingId = '';

async function seed(): Promise<void> {
  const meeting = await getRepositories().meetings.create({
    title: 'Rapat Ringkasan',
    date: '2026-10-07',
  });
  meetingId = meeting.id;
}

async function seedTranscript(): Promise<void> {
  await getRepositories().speakers.add({
    id: 'sp-1',
    meetingId,
    code: 'speaker_1',
    displayName: 'Operator',
    durationSeconds: 30,
    segmentCount: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await getRepositories().transcript.addSegments([
    {
      id: 'seg-1',
      meetingId,
      startTime: 0,
      endTime: 15,
      text: 'Kita bahas verifikasi data semester. Disepakati seluruh data diverifikasi.',
      sequence: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'seg-2',
      meetingId,
      startTime: 15,
      endTime: 30,
      text: 'Operator akan mengirim rekap paling lambat besok.',
      sequence: 1,
      createdAt: new Date().toISOString(),
    },
  ]);
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={[`/rapat/${meetingId}/ringkasan`]}>
      <RepositoriesProvider>
        <Routes>
          <Route path="/rapat/:meetingId/ringkasan" element={<SummaryTab />} />
        </Routes>
      </RepositoriesProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetRepositories();
  useToastStore.setState({ message: null });
  await clearAllLocalData();
  await seed();
});

describe('SummaryTab — ringkasan AI dari transkrip (PRD §15/§52)', () => {
  it('tanpa transkrip → tombol dinonaktifkan & penjelasan jujur', async () => {
    renderTab();

    expect(await screen.findByRole('button', { name: /Buat Ringkasan/ })).toBeDisabled();
    expect(await screen.findByText(/Transkrip belum tersedia/)).toBeInTheDocument();
  });

  it('ringkasan berhasil: tersimpan + keputusan bertimestamp sumber', async () => {
    await seedTranscript();
    renderTab();

    const button = await screen.findByRole('button', { name: /Buat Ringkasan/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(useToastStore.getState().message).toBe('Ringkasan selesai dibuat.'));

    const summary = await getRepositories().summaries.get(meetingId);
    expect(summary?.content.length).toBeGreaterThan(0);
    expect(summary?.sourceSegmentIds.length).toBeGreaterThan(0);

    const decisions = await getRepositories().decisions.listByMeeting(meetingId);
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(decisions[0]?.content).toContain('Disepakati');
    expect(decisions[0]?.sourceTimestamp).toBe(0);

    const actionItems = await getRepositories().actionItems.listByMeeting(meetingId);
    expect(actionItems.length).toBeGreaterThanOrEqual(1);
    expect(actionItems[0]?.assignee).toBe('Operator');
    expect(actionItems[0]?.deadline).toBe('besok');
    expect(actionItems[0]?.sourceTimestamp).toBe(15);
  });

  it('hasil tampil di layar: keputusan + sumber jam, tindak lanjut + PIC', async () => {
    await seedTranscript();
    renderTab();

    const button = await screen.findByRole('button', { name: /Buat Ringkasan/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    expect(await screen.findByRole('heading', { name: 'Keputusan' })).toBeInTheDocument();
    expect(screen.getByText(/sumber: 00:00/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tindak Lanjut' })).toBeInTheDocument();
    expect(screen.getByText(/PIC: Operator/)).toBeInTheDocument();
    expect(screen.getByText(/Deadline: besok/)).toBeInTheDocument();
  });
});
