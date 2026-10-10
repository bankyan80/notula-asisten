import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositoriesProvider } from '../../app/RepositoriesContext';
import { useToastStore } from '../../app/toastStore';
import { clearAllLocalData, resetRepositories } from '../../data';
import { useSettingsStore } from './settingsStore';
import { SettingsPage } from './SettingsPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/pengaturan']}>
      <RepositoriesProvider>
        <SettingsPage />
      </RepositoriesProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetRepositories();
  useToastStore.setState({ message: null });
  useSettingsStore.setState({ storageMode: 'device', consentAccepted: true });
  await clearAllLocalData();
});

describe('SettingsPage — mode penyimpanan', () => {
  it('menampilkan dua opsi mode penyimpanan', async () => {
    renderPage();

    expect(await screen.findByRole('radio', { name: /Hanya Perangkat/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Perangkat \+ Cloud/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Hanya Perangkat/ })).toBeChecked();
  });

  it('memilih Perangkat + Cloud mengubah storageMode', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('radio', { name: /Perangkat \+ Cloud/ }));

    await waitFor(() => expect(useSettingsStore.getState().storageMode).toBe('device_cloud'));
  });
});

describe('SettingsPage — kamus istilah', () => {
  it('menambah istilah baru ke kamus', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('Istilah baru'), {
      target: { value: 'TKA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));

    expect(useSettingsStore.getState().dictionary).toContain('TKA');
    expect(useToastStore.getState().message).toBe('Istilah "TKA" ditambahkan.');
  });
});

describe('SettingsPage — pemberitahuan rekaman', () => {
  it('checkbox persetujuan rekaman bisa diubah', async () => {
    useSettingsStore.setState({ consentAccepted: false });
    renderPage();

    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() => expect(useSettingsStore.getState().consentAccepted).toBe(true));
  });
});
