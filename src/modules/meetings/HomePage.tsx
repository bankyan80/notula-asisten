import { Link } from 'react-router-dom';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { MeetingListItem } from './MeetingListItem';

export function HomePage() {
  const repositories = useRepositories();
  const { data: meetings, loading } = useAsync(
    () => repositories.meetings.list({ limit: 3 }),
    [repositories],
  );

  return (
    <div className="min-h-dvh bg-surface">
      <header className="px-5 pt-8 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white text-lg">
            🎙
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink">Notula Assistent</h1>
            <p className="text-sm text-muted">Asisten rapat cerdas</p>
          </div>
        </div>
      </header>

      <main className="px-5 pb-8 pt-6">
        <Link
          to="/rapat/baru"
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-brand py-5 text-white active:bg-brand-secondary"
        >
          <span className="text-2xl" aria-hidden="true">
            🎙
          </span>
          <span className="text-xl font-bold">MULAI RAPAT</span>
        </Link>

        {loading && <p className="mt-8 text-center text-base text-muted">Memuat rapat…</p>}

        {!loading && meetings && meetings.length === 0 && (
          <p className="mt-8 text-center text-base text-muted">
            Belum ada rapat. Tekan MULAI RAPAT untuk memulai.
          </p>
        )}

        {!loading && meetings && meetings.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">
              Rapat Terakhir
            </h2>
            <div className="space-y-2">
              {meetings.map((meeting) => (
                <MeetingListItem key={meeting.id} meeting={meeting} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
