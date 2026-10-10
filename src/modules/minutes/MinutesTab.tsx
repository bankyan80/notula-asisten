import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { friendlyMessage } from '../../core/errors/AppError';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { formatDateId, formatTimeId } from '../../core/utils/time';
import { Button, EmptyState } from '../../ui';
import { MINUTES_TEMPLATES } from './templates';
import { generateMinutesForMeeting } from './generateForMeeting';

export function MinutesTab() {
  const { meetingId = '' } = useParams();
  const repositories = useRepositories();
  const showToast = useToastStore((state) => state.showToast);
  const [templateChoice, setTemplateChoice] = useState<string | null>(null);

  const { data: meeting } = useAsync(
    () => repositories.meetings.getById(meetingId),
    [repositories, meetingId],
  );
  const {
    data: minutes,
    loading,
    reload,
  } = useAsync(() => repositories.minutes.get(meetingId), [repositories, meetingId]);
  const { data: segments } = useAsync(
    () => repositories.transcript.listByMeeting(meetingId),
    [repositories, meetingId],
  );
  const { data: summary } = useAsync(
    () => repositories.summaries.get(meetingId),
    [repositories, meetingId],
  );

  const hasMaterial = (segments?.length ?? 0) > 0 || Boolean(summary);
  const selectedTemplate = templateChoice ?? meeting?.minutesTemplateId ?? 'umum';

  const handleGenerate = async (): Promise<void> => {
    try {
      await generateMinutesForMeeting(repositories, meetingId, selectedTemplate);
      reload();
      showToast('Notulen berhasil dibuat.');
    } catch (error) {
      showToast(friendlyMessage(error));
    }
  };

  return (
    <div>
      {/* Template selector */}
      <div className="mb-4">
        <label htmlFor="template-notulen" className="text-sm font-semibold text-ink">
          Template notulen
        </label>
        <select
          id="template-notulen"
          aria-label="Template notulen"
          value={selectedTemplate}
          onChange={(event) => setTemplateChoice(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3.5 text-base outline-none focus:border-brand"
        >
          {MINUTES_TEMPLATES.map((template) => (
            <option key={template.id} value={template.id}>
              {template.label}
            </option>
          ))}
        </select>
      </div>

      <Button block className="mb-6" disabled={!hasMaterial} onClick={() => void handleGenerate()}>
        {minutes ? '↻ Buat Ulang Notulen' : '✨ Buat Notulen'}
      </Button>

      {meeting?.pipelineError && !minutes && (
        <p className="mb-4 rounded-xl bg-danger/10 p-3.5 text-base leading-relaxed text-danger">
          {meeting.pipelineError}
        </p>
      )}

      {!hasMaterial && (
        <p className="mb-4 text-base leading-relaxed text-muted">
          Notulen dibuat dari transkrip dan ringkasan rapat. Keduanya belum tersedia.
        </p>
      )}

      {loading && <p className="py-4 text-center text-base text-muted">Memuat…</p>}

      {!loading && !minutes && (
        <EmptyState
          icon="📄"
          title="Belum ada notulen"
          description="Notulen memuat identitas rapat, peserta, agenda, pembahasan, keputusan, tindak lanjut, PIC, dan deadline."
        />
      )}

      {minutes && meeting && (
        <div className="space-y-6">
          {/* Document header */}
          <header className="text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-brand">Notulen Rapat</p>
            <h2 className="mt-1 text-xl font-bold text-ink">{meeting.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {formatDateId(meeting.date)}
              {meeting.startTime ? ` • ${formatTimeId(meeting.startTime)}` : ''}
              {meeting.location ? ` • ${meeting.location}` : ''}
            </p>
            {meeting.participants.length > 0 && (
              <p className="mt-1 text-sm text-muted">Peserta: {meeting.participants.join(', ')}</p>
            )}
          </header>

          {/* Sections */}
          {minutes.sections.map((section) => (
            <section key={section.key}>
              <h3 className="text-lg font-bold uppercase tracking-wide text-ink">
                {section.title}
              </h3>
              {section.lines.length === 0 ? (
                <p className="mt-1.5 text-base italic text-muted">Tidak disebutkan dalam rapat.</p>
              ) : (
                <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink">
                  {section.lines.map((line, index) => (
                    <li key={`${section.key}-${index}`}>{line}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
