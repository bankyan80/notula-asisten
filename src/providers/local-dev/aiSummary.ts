import { AppError } from '../../core/errors/AppError';
import type {
  AISummarizationProvider,
  AISummaryResult,
  SummaryInput,
} from '../../core/types/providers';

/**
 * Provider lokal tanpa mesin AI.
 * Jujur: TIDAK menghasilkan ringkasan palsu.
 * Batch 09 menambahkan provider ekstraktif lokal (berbasis transkrip, offline)
 * dan provider server opsional.
 */
export class LocalDevAISummarizationProvider implements AISummarizationProvider {
  readonly id = 'local-dev';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async summarize(input: SummaryInput): Promise<AISummaryResult> {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `Ringkasan menunggu diproses: provider AI "${this.id}" belum dikonfigurasi untuk rapat ${input.meeting.id}.`,
      {
        retryable: true,
        context: { meetingId: input.meeting.id, segments: input.segments.length },
      },
    );
  }
}
