import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { friendlyMessage } from '../../core/errors/AppError';
import { formatClock } from '../../core/utils/time';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { getAISummarizationProvider } from '../../providers';
import { Button, EmptyState } from '../../ui';
import { generateSummaryForMeeting } from './generateSummary';

export function SummaryTab() {
  const { meetingId = '' } = useParams();
  const repositories = useRepositories();
  const showToast = useToastStore((state) => state.showToast);

  const provider = useMemo(() => getAISummarizationProvider(), []);
  const { data: available } = useAsync(() => provider.isAvailable(), [provider]);

  const {
    data: summary,
    loading,
    reload: reloadSummary,
  } = useAsync(() => repositories.summaries.get(meetingId), [repositories, meetingId]);
  const { data: meeting } = useAsync(
    () => repositories.meetings.getById(meetingId),
    [repositories, meetingId],
  );
  const { data: segments } = useAsync(
    () => repositories.transcript.listByMeeting(meetingId),
    [repositories, meetingId],
  );
  const { data: decisions, reload: reloadDecisions } = useAsync(
    () => repositories.decisions.listByMeeting(meetingId),
    [repositories, meetingId],
  );
  const { data: actionItems, reload: reloadActionItems } = useAsync(
    () => repositories.actionItems.listByMeeting(meetingId),
    [repositories, meetingId],
  );

  const hasTranscript = (segments?.length ?? 0) > 0;
  const canSummarize = Boolean(available) && hasTranscript;

  // Kegagalan pipeline otomatis — ditampilkan sebagai tombol coba lagi.
  const pipelineError = meeting?.pipelineError;

  const handleSummarize = async (): Promise<void> => {
    try {
      await generateSummaryForMeeting(repositories, meetingId, provider);
      reloadSummary();
      reloadDecisions();
      reloadActionItems();
      showToast('Ringkasan selesai dibuat.');
    } catch (error) {
      showToast(friendlyMessage(error));
    }
  };

  return (
    <div>
      {!hasTranscript && (
        <p className="mb-4 text-base leading-relaxed text-muted">
          Ringkasan dibuat dari transkrip rapat. Transkrip belum tersedia.
        </p>
      )}

      {hasTranscript && !available && (
        <p className="mb-4 text-base leading-relaxed text-muted">
          Provider AI belum dikonfigurasi. Transkrip tetap tersedia.
        </p>
      )}

      {pipelineError && (
        <p className="mb-4 rounded-xl bg-danger/10 p-3.5 text-base leading-relaxed text-danger">
          {pipelineError}
        </p>
      )}

      {!summary && (
        <Button
          block
          onClick={() => void handleSummarize()}
          disabled={!canSummarize}
          className="mb-6"
        >
          {pipelineError ? '↻ Coba Buat Ringkasan Lagi' : '✨ Buat Ringkasan AI'}
        </Button>
      )}

      {loading && <p className="py-4 text-center text-base text-muted">Memuat…</p>}

      {!loading && !summary && hasTranscript && available && (
        <EmptyState
          icon="🤖"
          title="Belum ada ringkasan"
          description="Tekan tombol di atas untuk menghasilkan ringkasan, keputusan, dan tindak lanjut."
        />
      )}

      {!loading && !summary && !hasTranscript && (
        <EmptyState
          icon="🤖"
          title="Belum ada ringkasan"
          description="Setelah transkrip tersedia, ringkasan otomatis dapat dibuat di sini."
        />
      )}

      {summary && (
        <div className="space-y-6">
          {/* Summary text */}
          <p className="text-base leading-relaxed text-ink">{summary.content}</p>

          {/* Topics */}
          {summary.topics.length > 0 && (
            <section>
              <h3 className="text-lg font-bold text-ink">Pokok Pembahasan</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-base leading-relaxed text-ink">
                {summary.topics.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ol>
            </section>
          )}

          {/* Undecided */}
          {summary.undecided.length > 0 && (
            <section>
              <h3 className="text-lg font-bold text-ink">Hal yang Belum Diputuskan</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink">
                {summary.undecided.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Decisions */}
          {decisions && decisions.length > 0 && (
            <section>
              <h3 className="text-lg font-bold text-ink">Keputusan</h3>
              <ul className="mt-2 space-y-2">
                {decisions.map((decision) => (
                  <li key={decision.id} className="text-base leading-relaxed text-ink">
                    {decision.content}
                    <span className="ml-1 text-sm text-brand">
                      (sumber: {formatClock(decision.sourceTimestamp)})
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Action items */}
          {actionItems && actionItems.length > 0 && (
            <section>
              <h3 className="text-lg font-bold text-ink">Tindak Lanjut</h3>
              <div className="mt-2 space-y-3">
                {actionItems.map((item) => (
                  <div key={item.id} className="rounded-xl bg-white p-3.5">
                    <p className="text-base font-semibold text-ink">{item.task}</p>
                    <p className="mt-1.5 text-sm text-muted">
                      PIC: {item.assignee ?? 'Tidak disebutkan'} • Deadline:{' '}
                      {item.deadline ?? 'Tidak disebutkan'}
                      {item.sourceTimestamp !== undefined && (
                        <> • Sumber: {formatClock(item.sourceTimestamp)}</>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
