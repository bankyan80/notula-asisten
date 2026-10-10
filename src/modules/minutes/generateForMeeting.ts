/**
 * Pembuatan notulen — SATU jalur untuk tombol manual (Notulen) dan pipeline
 * otomatis (`modules/pipeline/runPipeline.ts`).
 */
import { AppError } from '../../core/errors/AppError';
import type { Repositories } from '../../data/repositories';
import type { Minutes } from '../../core/types/entities';
import { generateMinutes } from './generator';

export async function generateMinutesForMeeting(
  repositories: Repositories,
  meetingId: string,
  templateId?: string,
): Promise<Minutes> {
  const meeting = await repositories.meetings.getById(meetingId);
  if (meeting === null) {
    throw new AppError('NOT_FOUND', 'Rapat tidak ditemukan.');
  }

  const [summary, decisions, actionItems, segments] = await Promise.all([
    repositories.summaries.get(meetingId),
    repositories.decisions.listByMeeting(meetingId),
    repositories.actionItems.listByMeeting(meetingId),
    repositories.transcript.listByMeeting(meetingId),
  ]);
  if (summary === null && segments.length === 0) {
    throw new AppError('AI_FAILED', 'Transkrip dan ringkasan belum tersedia.');
  }

  const generated = generateMinutes({
    meeting,
    summary,
    decisions,
    actionItems,
    templateId: templateId ?? meeting.minutesTemplateId ?? 'umum',
  });

  await repositories.minutes.save(generated);
  await repositories.meetings.update(meetingId, { minutesTemplateId: generated.templateId });
  return generated;
}
