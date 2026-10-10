import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { friendlyMessage } from '../../core/errors/AppError';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { createId } from '../../core/utils/id';
import { formatClock, nowIso } from '../../core/utils/time';
import { searchSegments, type SearchHit } from '../search/searchSegments';
import { findActiveSegment } from '../audio/timeline';
import { usePlayerStore } from '../audio/playerStore';
import { Button, EmptyState, StatusBadge } from '../../ui';
import type { TranscriptSegment } from '../../core/types/entities';
import { getSpeechToTextProvider } from '../../providers';
import { retryPipeline } from '../pipeline/runPipeline';
import {
  PIPELINE_MESSAGES,
  failureMessage,
  orFallback,
  shouldPollMeeting,
} from '../pipeline/pipelineStatus';

interface SegmentDraft {
  text: string;
  speakerId: string;
  startTime: number;
  endTime: number;
}

function nearestSpace(text: string, pos: number): number {
  if (text.charAt(pos - 1) === ' ' || text.charAt(pos) === ' ') return pos;
  for (let offset = 0; offset < text.length; offset += 1) {
    const left = pos - offset;
    if (left > 0 && text.charAt(left) === ' ') return left;
    const right = pos + offset;
    if (right < text.length && text.charAt(right) === ' ') return right;
  }
  return pos;
}

export function TranscriptTab() {
  const { meetingId = '' } = useParams();
  const repositories = useRepositories();
  const showToast = useToastStore((state) => state.showToast);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SegmentDraft | null>(null);
  const [splitAt, setSplitAt] = useState<number | null>(null);

  const { data: meeting, reload: reloadMeeting } = useAsync(
    () => repositories.meetings.getById(meetingId),
    [repositories, meetingId],
  );
  const {
    data: segments,
    loading,
    reload: reloadSegments,
  } = useAsync(() => repositories.transcript.listByMeeting(meetingId), [repositories, meetingId]);
  const { data: speakers } = useAsync(
    () => repositories.speakers.listByMeeting(meetingId),
    [repositories, meetingId],
  );

  const provider = useMemo(() => getSpeechToTextProvider(), []);
  const { data: sttAvailable } = useAsync(() => provider.isAvailable(), [provider]);

  // Pantau selama pipeline masih berjalan — bukan hanya saat TRANSCRIBING,
  // sehingga status "Menyimpan audio…", "Menyiapkan transkripsi…" dll terlihat.
  const polling =
    meeting !== undefined && meeting !== null
      ? shouldPollMeeting(meeting.status, meeting.pipelineError)
      : false;
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => {
      reloadMeeting();
      reloadSegments();
    }, 2500);
    return () => clearInterval(timer);
  }, [polling, reloadMeeting, reloadSegments]);

  const currentTime = usePlayerStore((state) => state.currentTime);
  const playing = usePlayerStore((state) => state.playing);
  const activeSegmentId = useMemo(() => {
    if (segments === null || segments.length === 0) return null;
    return findActiveSegment(segments, currentTime)?.id ?? null;
  }, [segments, currentTime]);

  useEffect(() => {
    if (!playing || activeSegmentId === null) return;
    const node = document.getElementById(`segmen-${activeSegmentId}`);
    if (node !== null && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center' });
    }
  }, [playing, activeSegmentId]);

  const speakerName = (speakerId?: string): string => {
    if (!speakerId) return 'Pembicara';
    return speakers?.find((speaker) => speaker.id === speakerId)?.displayName ?? 'Pembicara';
  };

  const hits: SearchHit[] = useMemo(() => {
    const list = segments ?? [];
    if (query.trim() === '') {
      return list.map((segment) => ({
        segment,
        matchStart: -1,
        matchEnd: -1,
        snippet: segment.text,
      }));
    }
    return searchSegments(list, query);
  }, [segments, query]);

  const playFrom = usePlayerStore((state) => state.playFrom);

  const run = async (action: () => Promise<unknown>, successMessage: string): Promise<void> => {
    try {
      await action();
      showToast(successMessage);
      setEditingId(null);
      setDraft(null);
      setSplitAt(null);
      void reloadSegments();
    } catch (error) {
      showToast(friendlyMessage(error));
    }
  };

  const startEdit = (segment: TranscriptSegment): void => {
    setEditingId(segment.id);
    setDraft({
      text: segment.text,
      speakerId: segment.speakerId ?? '',
      startTime: segment.startTime,
      endTime: segment.endTime,
    });
    setSplitAt(null);
  };

  const saveEdit = (segment: TranscriptSegment): void => {
    if (draft === null) return;
    const text = draft.text.trim();
    if (text === '') {
      showToast('Teks segmen tidak boleh kosong.');
      return;
    }
    if (!(draft.endTime > draft.startTime)) {
      showToast('Waktu akhir harus setelah waktu mulai.');
      return;
    }
    void run(
      () =>
        repositories.transcript.updateSegment(segment.id, {
          text,
          speakerId: draft.speakerId === '' ? undefined : draft.speakerId,
          startTime: draft.startTime,
          endTime: draft.endTime,
        }),
      'Perubahan transkrip disimpan.',
    );
  };

  const deleteSegment = (segment: TranscriptSegment): void => {
    const confirmed = window.confirm(
      'Hapus segmen ini dari transkrip? Tindakan ini tidak dapat dibatalkan.',
    );
    if (!confirmed) return;
    void run(() => repositories.transcript.deleteSegment(segment.id), 'Segmen dihapus.');
  };

  const mergeWithNext = (segment: TranscriptSegment): void => {
    const list = segments ?? [];
    const index = list.findIndex((item) => item.id === segment.id);
    const next = index >= 0 ? list[index + 1] : undefined;
    if (!next) {
      showToast('Tidak ada segmen berikutnya untuk digabungkan.');
      return;
    }
    void run(async () => {
      await repositories.transcript.updateSegment(segment.id, {
        text: `${segment.text} ${next.text}`.trim(),
        endTime: next.endTime,
      });
      await repositories.transcript.deleteSegment(next.id);
    }, 'Segmen digabungkan.');
  };

  const splitSegment = (segment: TranscriptSegment): void => {
    const text = draft?.text ?? segment.text;
    if (text.trim().length < 2) {
      showToast('Teks terlalu pendek untuk dipecah.');
      return;
    }
    const raw = splitAt ?? -1;
    const pos =
      raw > 0 && raw < text.length
        ? nearestSpace(text, raw)
        : nearestSpace(text, Math.floor(text.length / 2));
    const left = text.slice(0, pos).trim();
    const right = text.slice(pos).trim();
    if (left === '' || right === '') {
      showToast('Teks terlalu pendek untuk dipecah.');
      return;
    }
    const ratio = left.length / (left.length + right.length);
    const duration = segment.endTime - segment.startTime;
    const splitTime = segment.startTime + duration * ratio;
    void run(async () => {
      await repositories.transcript.updateSegment(segment.id, {
        text: left,
        endTime: splitTime,
      });
      await repositories.transcript.addSegments([
        {
          id: createId(),
          meetingId: segment.meetingId,
          speakerId: segment.speakerId,
          startTime: splitTime,
          endTime: segment.endTime,
          text: right,
          sequence: segment.sequence + 0.5,
          createdAt: nowIso(),
        },
      ]);
    }, 'Segmen dipecah.');
  };

  const renderEditPanel = (segment: TranscriptSegment): React.ReactElement | null => {
    if (draft === null) return null;
    return (
      <div className="mb-3 rounded-2xl bg-light p-3" role="group" aria-label="Edit segmen">
        <label className="sr-only" htmlFor={`edit-${segment.id}`}>
          Teks segmen
        </label>
        <textarea
          id={`edit-${segment.id}`}
          value={draft.text}
          rows={3}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          onSelect={(event) => setSplitAt(event.currentTarget.selectionStart)}
          className="w-full rounded-xl border border-line bg-white p-2.5 text-base leading-relaxed text-ink outline-none focus:border-brand"
        />
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-ink">
          <label className="flex flex-col gap-1">
            Pembicara
            <select
              value={draft.speakerId}
              onChange={(event) => setDraft({ ...draft, speakerId: event.target.value })}
              className="rounded-xl border border-line bg-white px-2 py-1.5 outline-none focus:border-brand"
            >
              <option value="">Pembicara</option>
              {speakers?.map((speaker) => (
                <option key={speaker.id} value={speaker.id}>
                  {speaker.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Mulai (detik)
            <input
              type="number"
              step={0.1}
              min={0}
              value={draft.startTime}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value)) setDraft({ ...draft, startTime: value });
              }}
              className="rounded-xl border border-line bg-white px-2 py-1.5 outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1">
            Akhir (detik)
            <input
              type="number"
              step={0.1}
              min={0}
              value={draft.endTime}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value)) setDraft({ ...draft, endTime: value });
              }}
              className="rounded-xl border border-line bg-white px-2 py-1.5 outline-none focus:border-brand"
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={() => saveEdit(segment)}>Simpan</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setEditingId(null);
              setDraft(null);
              setSplitAt(null);
            }}
          >
            Batal
          </Button>
          <Button variant="secondary" onClick={() => mergeWithNext(segment)}>
            Gabung
          </Button>
          <Button variant="secondary" onClick={() => splitSegment(segment)}>
            Pecah
          </Button>
          <Button variant="danger" onClick={() => deleteSegment(segment)}>
            Hapus
          </Button>
        </div>
      </div>
    );
  };

  const renderRow = (hit: SearchHit): React.ReactElement => {
    const { segment } = hit;
    const hasQuery = query.trim() !== '';
    const active = activeSegmentId === segment.id;
    const editing = editingId === segment.id;
    return (
      <div
        key={segment.id}
        id={`segmen-${segment.id}`}
        className={`px-1 ${active ? 'bg-light rounded-xl' : ''}`}
      >
        <div className="flex items-start gap-1">
          <button
            type="button"
            aria-current={active ? 'true' : undefined}
            onClick={() => void playFrom(segment.startTime)}
            disabled={editing}
            className="min-w-0 flex-1 py-3 text-left disabled:cursor-default"
          >
            <div className="flex items-center gap-2">
              <time className="text-sm font-medium text-brand">
                {formatClock(segment.startTime)}
              </time>
              <span className="text-base font-semibold text-ink">
                {speakerName(segment.speakerId)}
              </span>
              {active && <span className="text-xs font-bold text-brand">● sedang berjalan</span>}
              {segment.editedAt !== undefined && (
                <span className="text-xs text-muted">✎ diedit</span>
              )}
            </div>
            <p className="mt-1 text-base leading-relaxed text-ink">
              {hasQuery ? (
                <>
                  {segment.text.slice(0, hit.matchStart)}
                  <mark className="rounded bg-amber-100 px-0.5">
                    {segment.text.slice(hit.matchStart, hit.matchEnd)}
                  </mark>
                  {segment.text.slice(hit.matchEnd)}
                </>
              ) : (
                segment.text
              )}
            </p>
          </button>
          {!editing && (
            <button
              type="button"
              aria-label={`Edit segmen ${formatClock(segment.startTime)}`}
              onClick={() => startEdit(segment)}
              className="mt-3 shrink-0 rounded-xl px-2 py-1 text-sm text-brand active:bg-brand/10"
            >
              ✏️
            </button>
          )}
        </div>
        {editing && renderEditPanel(segment)}
      </div>
    );
  };

  const statusNotice = ((): { text: string; className: string; canRetry?: boolean } | null => {
    if (meeting === null || meeting === undefined) return null;

    // Kegagalan transkripsi (audio tidak hilang) — tombol coba lagi.
    const failure = failureMessage(meeting.status);
    if (failure !== null) {
      return {
        text: orFallback(meeting.pipelineError, failure),
        className: 'bg-danger/10 text-danger',
        canRetry: true,
      };
    }

    // Kegagalan tahap ringkasan/notulen — transkrip tetap terbaca.
    if ((meeting.pipelineError ?? '').trim() !== '') {
      return {
        text: meeting.pipelineError ?? '',
        className: 'bg-danger/10 text-danger',
        canRetry: true,
      };
    }

    const message = PIPELINE_MESSAGES[meeting.status];
    if (message !== undefined) {
      return {
        text: message,
        className: 'bg-brand/5 text-brand',
      };
    }

    if (meeting.status === 'PROCESSING' && (segments === null || segments.length === 0)) {
      return {
        text: 'Transkripsi menunggu diproses — audio sudah tersimpan di perangkat.',
        className: 'bg-amber-50 text-amber-700',
      };
    }
    return null;
  })();

  const handleRetry = (): void => {
    void retryPipeline(repositories, meetingId)
      .then(() => {
        showToast('Memproses ulang rapat…');
        void reloadMeeting();
        void reloadSegments();
      })
      .catch((error: unknown) => showToast(friendlyMessage(error)));
  };

  return (
    <div>
      {meeting != null && (
        <div className="mb-3 flex items-center gap-2">
          <StatusBadge status={meeting.status} />
        </div>
      )}

      {sttAvailable === false && meeting != null && (segments?.length ?? 0) === 0 && (
        <p
          className="mb-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700"
          role="status"
        >
          Transkripsi otomatis belum tersedia di perangkat ini. Audio tetap aman di perangkat dan
          bisa diproses lagi nanti.
        </p>
      )}

      {statusNotice !== null && (
        <div
          className={`mb-3 flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${statusNotice.className}`}
          role="status"
        >
          <span className="min-w-0 flex-1">{statusNotice.text}</span>
          {statusNotice.canRetry === true && (
            <button
              type="button"
              onClick={handleRetry}
              className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-danger active:opacity-70"
            >
              ↻ Coba Lagi
            </button>
          )}
        </div>
      )}

      {segments && segments.length > 0 && (
        <label htmlFor="transcript-search" className="sr-only">
          Cari dalam transkrip
        </label>
      )}
      {segments && segments.length > 0 && (
        <input
          id="transcript-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="🔍 Cari dalam transkrip…"
          className="mb-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none focus:border-brand"
        />
      )}

      <div>
        {loading && <p className="py-6 text-center text-base text-muted">Memuat transkrip…</p>}

        {!loading && segments && segments.length === 0 && (
          <EmptyState
            icon="📝"
            title="Belum ada transkrip"
            description="Transkrip berisi timestamp ini muncul setelah audio rapat berhasil diproses."
          />
        )}

        {!loading && segments && segments.length > 0 && hits.length === 0 && (
          <EmptyState
            icon="🔍"
            title={`Tidak ditemukan "${query}"`}
            description="Coba kata kunci lain."
          />
        )}

        {!loading && <div className="space-y-1">{hits.map(renderRow)}</div>}
      </div>
    </div>
  );
}
