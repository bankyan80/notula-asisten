import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositoriesProvider } from '../../app/RepositoriesContext';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import { RecordingPage } from './RecordingPage';
import { useSettingsStore } from '../settings/settingsStore';

let meetingId = '';

async function seedMeeting(): Promise<void> {
  const meeting = await getRepositories().meetings.create({
    title: 'Rapat Koordinasi TKA SD',
    date: '2026-10-07',
  });
  meetingId = meeting.id;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/rapat/${meetingId}/rekam`]}>
      <RepositoriesProvider>
        <Routes>
          <Route path="/rapat/:meetingId/rekam" element={<RecordingPage />} />
        </Routes>
      </RepositoriesProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetRepositories();
  await clearAllLocalData();
  await seedMeeting();
});

describe('RecordingPage', () => {
  it('menampilkan status siap merekam dan judul rapat', async () => {
    renderPage();

    expect(await screen.findByText('Rapat Koordinasi TKA SD')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('● SIAP MEREKAM');
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
  });

  it('jujur menampilkan kondisi mesin rekaman di lingkungan tanpa API microphone', async () => {
    renderPage();

    // Penyebab disebutkan apa adanya, bukan satu pesan generik.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/secure context|navigator\.mediaDevices|MediaRecorder/);
    expect(screen.getByText(/Mic: belum aktif/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /MULAI REKAM/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /■ SELESAI/ })).toBeDisabled();
  });
});

describe('RecordingPage — pemberitahuan rekaman (PRD §27)', () => {
  it('persetujuan belum diberikan → pemberitahuan tampil sebelum mulai rekam', async () => {
    useSettingsStore.setState({ consentAccepted: false });
    renderPage();

    expect(await screen.findByText('📢 Pemberitahuan Rekaman')).toBeInTheDocument();
    expect(
      screen.getByText(/Pastikan seluruh peserta mengetahui dan menyetujui perekaman/),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('menyetujui → pemberitahuan hilang (tersimpan untuk sesi berikutnya)', async () => {
    useSettingsStore.setState({ consentAccepted: false });
    renderPage();
    const checkbox = await screen.findByRole('checkbox');

    fireEvent.click(checkbox);

    expect(screen.queryByText('📢 Pemberitahuan Rekaman')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().consentAccepted).toBe(true);
  });

  it('persetujuan sudah diberikan → tidak menampilkan pemberitahuan lagi', async () => {
    useSettingsStore.setState({ consentAccepted: true });
    renderPage();

    expect(await screen.findByText('● SIAP MEREKAM')).toBeInTheDocument();
    expect(screen.queryByText('📢 Pemberitahuan Rekaman')).not.toBeInTheDocument();
  });
});
