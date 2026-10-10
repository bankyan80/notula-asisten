import { useOnlineStatus } from '../core/hooks/useOnlineStatus';

/** Banner status koneksi — offline TIDAK menghentikan recording. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center gap-2 bg-amber-500 px-4 py-2 text-xs font-semibold text-white"
    >
      <span aria-hidden="true">●</span>
      Offline — Rekaman tetap aman di perangkat dan akan disinkronkan saat koneksi kembali.
    </div>
  );
}
