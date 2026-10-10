import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositoriesProvider } from '../../app/RepositoriesContext';
import { clearAllLocalData, resetRepositories } from '../../data';
import { useSettingsStore } from '../settings/settingsStore';
import { CreateMeetingPage } from './CreateMeetingPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/rapat/baru']}>
      <RepositoriesProvider>
        <Routes>
          <Route path="/rapat/baru" element={<CreateMeetingPage />} />
          <Route path="/rapat/:meetingId/rekam" element={<h1>Halaman Rekam</h1>} />
        </Routes>
      </RepositoriesProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetRepositories();
  await clearAllLocalData();
  useSettingsStore.setState({ consentAccepted: true });
});

describe('CreateMeetingPage', () => {
  it('menampilkan error validasi saat judul kosong', () => {
    renderPage();

    const submit = screen.getByRole('button', { name: /MULAI REKAM/ });
    fireEvent.click(submit);

    expect(screen.getByText('Judul rapat minimal 3 karakter')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Halaman Rekam' })).not.toBeInTheDocument();
  });

  it('membuat rapat dan pindah ke halaman rekam', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Judul Rapat'), {
      target: { value: 'Rapat Koordinasi TKA SD' },
    });
    fireEvent.click(screen.getByRole('button', { name: /MULAI REKAM/ }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Halaman Rekam' })).toBeInTheDocument();
    });
  });

  it('menolak submit saat persetujuan rekaman belum dicentang', () => {
    useSettingsStore.setState({ consentAccepted: false });
    renderPage();

    expect(screen.getByRole('button', { name: /MULAI REKAM/ })).toBeDisabled();
  });
});
