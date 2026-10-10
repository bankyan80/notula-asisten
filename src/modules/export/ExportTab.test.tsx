import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoriesProvider } from '../../app/RepositoriesContext';
import { useToastStore } from '../../app/toastStore';
import { clearAllLocalData, getRepositories, resetRepositories } from '../../data';
import { clearAuditEvents, listAuditEvents } from '../security/auditLog';
import { ExportTab } from './ExportTab';

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
    undecided: [],
    sourceSegmentIds: ['seg-1'],
    createdAt: new Date().toISOString(),
  });
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={[`/rapat/${meetingId}/ekspor`]}>
      <RepositoriesProvider>
        <Routes>
          <Route path="/rapat/:meetingId/ekspor" element={<ExportTab />} />
        </Routes>
      </RepositoriesProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetRepositories();
  useToastStore.setState({ message: null });
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  URL.revokeObjectURL = vi.fn();
  await clearAllLocalData();
  await seedMeeting();
});

describe('ExportTab — ekspor nyata (PRD §19)', () => {
  it('tanpa hasil rapat → keempat tombol format dinonaktifkan', async () => {
    renderTab();

    expect(await screen.findByText(/Belum ada hasil rapat untuk diekspor/i)).toBeInTheDocument();
    for (const label of ['PDF', 'DOCX', 'TXT', 'XLSX']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeDisabled();
    }
  });

  it('klik PDF → file terunduh, toast sukses', async () => {
    await seedMaterial();
    renderTab();

    const pdfButton = await screen.findByRole('button', { name: /PDF/ });
    await waitFor(() => expect(pdfButton).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(pdfButton);

    await waitFor(
      () =>
        expect(useToastStore.getState().message).toBe(
          'File Rapat Sekolah 2026-10-07.pdf berhasil diunduh.',
        ),
      { timeout: 5000 },
    );
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    const files = await getRepositories().exports.listByMeeting(meetingId);
    expect(files).toHaveLength(1);
    expect(files[0]?.format).toBe('PDF');
    expect(files[0]?.fileName).toBe('Rapat Sekolah 2026-10-07.pdf');
    expect(files[0]?.byteSize ?? 0).toBeGreaterThan(0);
  });

  it('klik XLSX → entri riwayat berformat XLSX (tabel tugas)', async () => {
    await seedMaterial();
    renderTab();

    const xlsxButton = await screen.findByRole('button', { name: /XLSX/ });
    await waitFor(() => expect(xlsxButton).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(xlsxButton);

    await waitFor(
      () =>
        expect(useToastStore.getState().message).toBe(
          'File Rapat Sekolah 2026-10-07.xlsx berhasil diunduh.',
        ),
      { timeout: 5000 },
    );

    const files = await getRepositories().exports.listByMeeting(meetingId);
    expect(files[0]?.format).toBe('XLSX');
    expect(files[0]?.fileName.endsWith('.xlsx')).toBe(true);
  });

  it('hanya satu ekspor berjalan: tombol lain terkunci saat proses', async () => {
    await seedMaterial();
    renderTab();

    const pdfButton = await screen.findByRole('button', { name: /PDF/ });
    await waitFor(() => expect(pdfButton).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(pdfButton);

    // Saat proses berjalan, tombol format lain nonaktif.
    await waitFor(() => expect(screen.getByRole('button', { name: /DOCX/ })).toBeDisabled(), {
      timeout: 5000,
    });
    await waitFor(() => expect(useToastStore.getState().message).toContain('berhasil diunduh'), {
      timeout: 5000,
    });
  });
});

describe('ExportTab — Zona Berbahaya: hapus data terpisah (PRD §26)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    clearAuditEvents();
    useToastStore.setState({ message: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hapus transkrip → segmen hilang, ringkasan & rapat tetap; audit tercatat', async () => {
    await seedMaterial();
    renderTab();

    const button = await screen.findByRole('button', { name: /^📝 Transkrip$/ });
    // Tombol aktif hanya setelah meeting selesai dimuat (disabled={!meeting}).
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(button);

    await vi.waitFor(
      () => expect(useToastStore.getState().message).toBe('Transkrip rapat dihapus.'),
      { timeout: 5000 },
    );
    expect(await getRepositories().transcript.listByMeeting(meetingId)).toHaveLength(0);
    expect(await getRepositories().summaries.get(meetingId)).not.toBeNull();
    expect(await getRepositories().meetings.getById(meetingId)).not.toBeNull();
    expect(listAuditEvents()[0]?.action).toBe('Hapus transkrip rapat');
  });

  it('hapus audio → chunk hilang, transkrip tetap', async () => {
    await seedMaterial();
    await getRepositories().audioChunks.add({
      id: 'chunk-1',
      meetingId,
      sequence: 1,
      localPath: `Meetings/${meetingId}/audio/000001.m4a`,
      startTime: 0,
      endTime: 30,
      durationSeconds: 30,
      mimeType: 'audio/webm',
      uploadStatus: 'PENDING',
      transcriptionStatus: 'DONE',
      transcriptionAttempts: 1,
      createdAt: new Date().toISOString(),
    });
    renderTab();

    const button = await screen.findByRole('button', { name: /^🎵 Audio$/ });
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(button);

    await vi.waitFor(() => expect(useToastStore.getState().message).toBe('Audio rapat dihapus.'), {
      timeout: 5000,
    });
    expect(await getRepositories().audioChunks.listByMeeting(meetingId)).toHaveLength(0);
    expect(await getRepositories().transcript.listByMeeting(meetingId)).toHaveLength(1);
  });

  it('konfirmasi dibatalkan → tidak ada yang dihapus', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await seedMaterial();
    renderTab();

    const button = await screen.findByRole('button', { name: /^📝 Transkrip$/ });
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(button);

    expect(await getRepositories().transcript.listByMeeting(meetingId)).toHaveLength(1);
    expect(listAuditEvents()).toHaveLength(0);
  });

  it('hapus rapat & semua data → rapat hilang dari daftar + audit tercatat', async () => {
    await seedMaterial();
    renderTab();

    const button = await screen.findByRole('button', { name: /Hapus Rapat/ });
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(button);

    await vi.waitFor(
      () => expect(useToastStore.getState().message).toBe('Rapat dan seluruh datanya dihapus.'),
      { timeout: 5000 },
    );
    expect(await getRepositories().meetings.getById(meetingId)).toBeNull();
    expect(await getRepositories().transcript.listByMeeting(meetingId)).toHaveLength(0);
    expect(listAuditEvents()[0]?.action).toBe('Hapus rapat dan seluruh data');
  });
});
