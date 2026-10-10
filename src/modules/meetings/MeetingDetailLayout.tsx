import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { formatDateId, formatClock } from '../../core/utils/time';
import { EmptyState, ScreenHeader, TabNav } from '../../ui';
import { AudioPlayerBar } from '../audio/AudioPlayerBar';
import { usePlayerStore } from '../audio/playerStore';

export function MeetingDetailLayout() {
  const { meetingId = '' } = useParams();
  const repositories = useRepositories();
  const { data: meeting, loading } = useAsync(
    () => repositories.meetings.getById(meetingId),
    [repositories, meetingId],
  );
  const { data: chunks } = useAsync(
    () => repositories.audioChunks.listByMeeting(meetingId),
    [repositories, meetingId],
  );

  useEffect(() => {
    if (meeting === null) return;
    usePlayerStore.getState().attach({ meetingId: meeting.id, chunks: chunks ?? [] });
    return () => usePlayerStore.getState().detach();
  }, [meeting, chunks]);

  if (loading) {
    return (
      <div>
        <ScreenHeader title="Memuat rapat…" backTo="/rapat" />
        <p className="py-10 text-center text-base text-muted">Memuat…</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div>
        <ScreenHeader title="Rapat tidak ditemukan" backTo="/rapat" />
        <EmptyState
          icon="🔎"
          title="Rapat tidak ditemukan"
          description="Rapat mungkin sudah dihapus dari perangkat ini."
          actionLabel="Kembali ke daftar rapat"
          onAction={() => window.location.assign('/rapat')}
        />
      </div>
    );
  }

  const base = `/rapat/${meeting.id}`;

  return (
    <div className="min-h-dvh bg-surface">
      <ScreenHeader
        title={meeting.title}
        subtitle={`${formatDateId(meeting.date)} • ${formatClock(meeting.durationSeconds)}`}
        backTo="/rapat"
      />

      <TabNav
        ariaLabel="Bagian rapat"
        items={[
          { to: `${base}/transkrip`, label: 'Transkrip' },
          { to: `${base}/ringkasan`, label: 'Ringkasan' },
          { to: `${base}/notulen`, label: 'Notulen' },
          { to: `${base}/ekspor`, label: 'Ekspor' },
        ]}
      />

      <main className="px-4 pb-8 pt-3">
        <AudioPlayerBar />
        <Outlet />
      </main>
    </div>
  );
}
