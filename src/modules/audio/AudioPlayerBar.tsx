/**
 * Bar pemutar audio (PRD §12) — membaca `usePlayerStore` (satu state bersama
 * dengan Transkrip). Tampil di layar detail rapat bila sudah ada file audio.
 */
import { formatClock } from '../../core/utils/time';
import { usePlayerStore } from './playerStore';

export function AudioPlayerBar() {
  const timelineLength = usePlayerStore((state) => state.timeline.length);
  const playing = usePlayerStore((state) => state.playing);
  const loading = usePlayerStore((state) => state.loading);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const error = usePlayerStore((state) => state.error);
  const toggle = usePlayerStore((state) => state.toggle);
  const seek = usePlayerStore((state) => state.seek);

  if (timelineLength === 0) return null;

  return (
    <section
      role="group"
      aria-label="Pemutar audio rapat"
      className="mb-4 rounded-2xl border border-line bg-white p-3"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={loading}
          aria-label={playing ? 'Jeda' : 'Putar'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-base text-white disabled:opacity-50"
        >
          {playing ? '⏸' : '▶'}
        </button>
        <span className="font-mono text-[11px] tabular-nums text-brand">
          {formatClock(currentTime)} / {formatClock(duration)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(1, duration)}
        step={0.1}
        value={Math.min(currentTime, duration)}
        aria-label="Posisi audio"
        onChange={(event) => seek(Number(event.target.value))}
        className="mt-2 w-full accent-brand"
      />

      {loading && <p className="mt-1 text-[11px] text-muted">Memuat audio…</p>}
      {error !== null && (
        <p role="alert" className="mt-1 text-[11px] font-semibold text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
