import { useNavigate } from 'react-router-dom';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { ScreenHeader } from '../../ui';

export function AccountPage() {
  const navigate = useNavigate();
  const repositories = useRepositories();

  const { data: meetings } = useAsync(() => repositories.meetings.list(), [repositories]);

  return (
    <div className="min-h-dvh bg-surface">
      <ScreenHeader title="Akun" showBack={false} />

      <main className="px-5 pb-6 pt-3">
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-2xl">
              👤
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-ink">Pengguna Perangkat</h2>
              <p className="text-sm text-muted">
                Belum masuk akun cloud — data tetap di perangkat ini.
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted">{meetings?.length ?? 0} rapat tersimpan</p>
        </div>

        <button
          type="button"
          onClick={() => void navigate('/pengaturan')}
          className="mt-4 block w-full rounded-2xl bg-white p-4 text-left active:bg-light"
        >
          <span className="text-base font-semibold text-ink">⚙️ Pengaturan</span>
          <span className="mt-0.5 block text-sm text-muted">
            Mode penyimpanan, bahasa, kamus, dan lainnya
          </span>
        </button>

        <p className="mt-6 text-center text-sm leading-relaxed text-muted">
          Rekaman, transkrip, dan hasil AI diproses secara lokal (local-first).
        </p>
      </main>
    </div>
  );
}
