import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, ScreenHeader } from '../ui';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div>
      <ScreenHeader title="Halaman tidak ditemukan" backTo="/" />
      <main className="px-4 pt-4">
        <EmptyState
          icon="🧭"
          title="404 — Halaman tidak ada"
          description="Tautan yang Anda buka tidak tersedia di aplikasi ini."
        />
        <div className="flex gap-3">
          <Button block onClick={() => void navigate('/')}>
            Ke Beranda
          </Button>
          <Button variant="secondary" block onClick={() => void navigate('/rapat')}>
            Daftar Rapat
          </Button>
        </div>
      </main>
    </div>
  );
}
