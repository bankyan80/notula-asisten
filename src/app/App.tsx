/**
 * Shell aplikasi — Batch 02: routing + layout + host global (toast/offline).
 * Batch 04: persistensi chunk rekaman dipasang sekali di sini sehingga
 * rekaman tetap tersimpan walau pengguna meninggalkan layar Rekam.
 * Seluruh layar diakses lewat URL agar tetap bisa dibuka langsung (PWA).
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RepositoriesProvider } from './RepositoriesContext';
import { TabLayout } from './TabLayout';
import { NotFoundPage } from './NotFoundPage';
import { OfflineBanner, ToastHost } from '../ui';
import { HomePage } from '../modules/meetings/HomePage';
import { MeetingsPage } from '../modules/meetings/MeetingsPage';
import { CreateMeetingPage } from '../modules/meetings/CreateMeetingPage';
import { MeetingDetailLayout } from '../modules/meetings/MeetingDetailLayout';
import { RecordingPage } from '../modules/recording/RecordingPage';
import { useChunkPersistence } from '../modules/recording/useChunkPersistence';
import { usePipelineScheduler } from '../modules/pipeline/usePipelineScheduler';
import { useRecoverMeetings } from '../modules/recording/useRecoverMeetings';
import { useAutoSync } from '../modules/sync/autoSync';
import { MinutesListPage } from '../modules/minutes/MinutesListPage';
import { TranscriptTab } from '../modules/transcript/TranscriptTab';
import { SpeakersTab } from '../modules/speakers/SpeakersTab';
import { SummaryTab } from '../modules/summary/SummaryTab';
import { MinutesTab } from '../modules/minutes/MinutesTab';
import { ExportTab } from '../modules/export/ExportTab';
import { SettingsPage } from '../modules/settings/SettingsPage';
import { AccountPage } from '../modules/account/AccountPage';

export function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <RepositoriesProvider>
        <AppShell />
      </RepositoriesProvider>
    </BrowserRouter>
  );
}

/** Shell dalam provider repository: host global + persistensi & recovery chunk. */
function AppShell(): React.JSX.Element {
  useChunkPersistence();
  useRecoverMeetings();
  usePipelineScheduler();
  useAutoSync();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-surface pb-16">
      <OfflineBanner />
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/rapat" element={<MeetingsPage />} />
          <Route path="/notulen" element={<MinutesListPage />} />
          <Route path="/akun" element={<AccountPage />} />
        </Route>

        <Route path="/rapat/baru" element={<CreateMeetingPage />} />
        <Route path="/rapat/:meetingId/rekam" element={<RecordingPage />} />
        <Route path="/rapat/:meetingId" element={<MeetingDetailLayout />}>
          <Route index element={<Navigate to="transkrip" replace />} />
          <Route path="transkrip" element={<TranscriptTab />} />
          <Route path="pembicara" element={<SpeakersTab />} />
          <Route path="ringkasan" element={<SummaryTab />} />
          <Route path="notulen" element={<MinutesTab />} />
          <Route path="ekspor" element={<ExportTab />} />
        </Route>

        <Route path="/pengaturan" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ToastHost />
    </div>
  );
}
