/**
 * Pembuatan ringkasan — SATU jalur untuk tombol manual (Ringkasan) dan
 * pipeline otomatis (`modules/pipeline/runPipeline.ts`), supaya tidak ada
 * duplikasi dan hasilnya identik.
 *
 * Semua keluaran disimpan ke DB lokal LEBIH DAHULU; kegagalan melempar AppError
 * dan TIDAK PERNAH menghapus transkrip yang sudah ada.
 */
import { AppError, isAppError } from '../../core/errors/AppError';
import { createId } from '../../core/utils/id';
import { nowIso } from '../../core/utils/time';
import type { Repositories } from '../../data/repositories';
import type { Summary } from '../../core/types/entities';
import type { AISummarizationProvider } from '../../core/types/providers';

export async function generateSummaryForMeeting(
  repositories: Repositories,
  meetingId: string,
  provider: AISummarizationProvider,
): Promise<Summary> {
  const meeting = await repositories.meetings.getById(meetingId);
  if (meeting === null) {
    throw new AppError('NOT_FOUND', 'Rapat tidak ditemukan.');
  }

  const [segments, speakers] = await Promise.all([
    repositories.transcript.listByMeeting(meetingId),
    repositories.speakers.listByMeeting(meetingId),
  ]);
  if (segments.length === 0) {
    throw new AppError('AI_FAILED', 'Transkrip belum tersedia.');
  }

  if (!(await provider.isAvailable())) {
    throw new AppError('PROVIDER_UNAVAILABLE', 'Provider AI belum dikonfigurasi.', {
      retryable: true,
    });
  }

  let result;
  try {
    result = await provider.summarize({
      meeting,
      segments,
      speakers,
      language: meeting.language,
    });
  } catch (error) {
    if (isAppError(error)) throw error;
    throw new AppError('AI_FAILED', 'Ringkasan AI gagal dibuat.', {
      cause: error,
      retryable: true,
    });
  }

  const timestamp = nowIso();
  const traceableSources = [...result.decisions, ...result.actionItems]
    .map((item) => item.sourceSegmentId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const summary = await repositories.summaries.save({
    id: createId(),
    meetingId,
    content: result.summary,
    topics: result.topics,
    undecided: result.undecided,
    sourceSegmentIds: [...new Set(traceableSources)],
    createdAt: timestamp,
  });

  await repositories.decisions.replaceForMeeting(
    meetingId,
    result.decisions.map((decision) => ({
      id: createId(),
      meetingId,
      content: decision.content,
      sourceTimestamp: decision.sourceTimestamp,
      sourceSegmentId: decision.sourceSegmentId,
      createdAt: timestamp,
    })),
  );

  await repositories.actionItems.replaceForMeeting(
    meetingId,
    result.actionItems.map((item) => ({
      id: createId(),
      meetingId,
      task: item.task,
      assignee: item.assignee,
      deadline: item.deadline,
      status: 'OPEN' as const,
      sourceTimestamp: item.sourceTimestamp,
      sourceSegmentId: item.sourceSegmentId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );

  return summary;
}
