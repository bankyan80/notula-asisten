import { Link, useNavigate } from 'react-router-dom';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { formatDateIdShort, formatClock } from '../../core/utils/time';
import { Card, EmptyState, ScreenHeader } from '../../ui';

export function MinutesListPage() {
  const repositories = useRepositories();
  const navigate = useNavigate();

  const { data: meetings, loading } = useAsync(() => repositories.meetings.list(), [repositories]);

  const { data: minutesList, loading: loadingMinutes } = useAsync(async () => {
    const list = meetings ?? [];
    const results = await Promise.all(
      list.map(async (meeting) => ({
        meeting,
        minutes: await repositories.minutes.get(meeting.id),
      })),
    );
    return results.filter((entry) => entry.minutes !== null);
  }, [repositories, meetings]);

  const hasAny = (meetings?.length ?? 0) > 0;

  return (
    <div>
      <ScreenHeader title="Notulen" subtitle="Dokumen rapat siap dibagikan" showBack={false} />

      <main className="px-4 pb-6 pt-4">
        {(loading || loadingMinutes) && (
          <p className="py-6 text-center text-xs text-muted">Memuat notulen…</p>
        )}

        {!loading && !loadingMinutes && (minutesList?.length ?? 0) === 0 && (
          <EmptyState
            icon="📄"
            title={hasAny ? 'Belum ada notulen' : 'Belum ada rapat'}
            description={
              hasAny
                ? 'Buat ringkasan lalu notulen dari halaman rapat — dokumen akan muncul di sini.'
                : 'Mulai rapat pertama Anda untuk menghasilkan notulen otomatis.'
            }
            actionLabel="Mulai Rapat"
            onAction={() => void navigate('/rapat/baru')}
          />
        )}

        {minutesList?.map(({ meeting }) => (
          <Card key={meeting.id} className="mb-3 p-3">
            <Link to={`/rapat/${meeting.id}/notulen`} className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/10">
                📝
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-semibold text-ink">{meeting.title}</h4>
                <p className="text-xs text-muted">
                  {formatDateIdShort(meeting.date)} • {formatClock(meeting.durationSeconds)}
                </p>
              </div>
              <span className="text-muted">›</span>
            </Link>
          </Card>
        ))}
      </main>
    </div>
  );
}
