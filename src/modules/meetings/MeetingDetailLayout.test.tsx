import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositoriesProvider } from '../../app/RepositoriesContext';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import { resetPlayerForTests, usePlayerStore } from '../audio/playerStore';
import { MeetingDetailLayout } from './MeetingDetailLayout';

let meetingId = '';

async function seedMeeting(): Promise<void> {
  const meeting = await getRepositories().meetings.create({
    title: 'Rapat dengan Audio',
    date: '2026-10-07',
  });
  meetingId = meeting.id;
}

async function seedChunk(): Promise<void> {
  await getRepositories().audioChunks.add({
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
  });
}

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={[`/rapat/${meetingId}/transkrip`]}>
      <RepositoriesProvider>
        <Routes>
          <Route path="/rapat/:meetingId" element={<MeetingDetailLayout />}>
            <Route path="transkrip" element={<p>Isi tab transkrip</p>} />
          </Route>
        </Routes>
      </RepositoriesProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetRepositories();
  resetPlayerForTests();
  await clearAllLocalData();
  await seedMeeting();
});

describe('MeetingDetailLayout — lampiran player (Batch 07)', () => {
  it('melampirkan timeline audio rapat ke store & menampilkan bar player', async () => {
    await seedChunk();
    renderLayout();

    expect(await screen.findByRole('group', { name: 'Pemutar audio rapat' })).toBeInTheDocument();
    expect(usePlayerStore.getState()).toMatchObject({ meetingId, duration: 300 });
    expect(screen.getByText('00:00:00 / 00:05:00')).toBeInTheDocument();
  });

  it('rapat tanpa audio → attach tetap jalan (meetingId terpasang), bar tidak tampil', async () => {
    renderLayout();

    expect(await screen.findByText('Isi tab transkrip')).toBeInTheDocument();
    // Attach menunggu load chunk async — tunggu sampai benar-benar terpasang.
    await waitFor(() => expect(usePlayerStore.getState().meetingId).toBe(meetingId));
    expect(screen.queryByRole('group', { name: 'Pemutar audio rapat' })).not.toBeInTheDocument();
  });
});
