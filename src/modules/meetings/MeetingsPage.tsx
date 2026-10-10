import { useNavigate } from 'react-router-dom';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { EmptyState, ScreenHeader } from '../../ui';
import { MeetingListItem } from './MeetingListItem';

export function MeetingsPage() {
  const repositories = useRepositories();
  const navigate = useNavigate();
  const { data: meetings, loading } = useAsync(() => repositories.meetings.list(), [repositories]);

  return (
    <div className="min-h-dvh bg-surface">
      <ScreenHeader title="Rapat" showBack={false} />

      <main className="px-5 pb-6 pt-3">
        {loading && <p className="py-6 text-center text-base text-muted">Memuat rapat…</p>}

        {!loading && meetings && meetings.length === 0 && (
          <EmptyState
            icon="🎙"
            title="Belum ada rapat"
            description="Buat rapat pertama Anda untuk mulai merekam."
            actionLabel="+ Buat Rapat"
            onAction={() => void navigate('/rapat/baru')}
          />
        )}

        {!loading && meetings && meetings.length > 0 && (
          <div className="space-y-2">
            {meetings.map((meeting) => (
              <MeetingListItem key={meeting.id} meeting={meeting} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
