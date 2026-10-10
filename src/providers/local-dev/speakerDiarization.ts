import { AppError } from '../../core/errors/AppError';
import type {
  SpeakerDiarizationProvider,
  DiarizationRequest,
  SpeakerSegment,
} from '../../core/types/providers';

/**
 * Provider lokal tanpa mesin diarization.
 * Jujur: tidak mengarang identitas pembicara.
 * Pembicara akan muncul dari provider nyata (Batch 08) atau dari transkrip.
 */
export class LocalDevSpeakerDiarizationProvider implements SpeakerDiarizationProvider {
  readonly id = 'local-dev';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async identifySegments(request: DiarizationRequest): Promise<SpeakerSegment[]> {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `Diarization menunggu diproses: provider "${this.id}" belum dikonfigurasi untuk chunk #${request.chunk.sequence}.`,
      {
        retryable: true,
        context: { meetingId: request.chunk.meetingId, chunkSequence: request.chunk.sequence },
      },
    );
  }
}
