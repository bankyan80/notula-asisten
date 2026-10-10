import { AppError } from '../../core/errors/AppError';
import type { SpeechToTextProvider, TranscribeRequest } from '../../core/types/providers';
import type { TranscriptSegment } from '../../core/types/entities';

/**
 * Provider lokal tanpa mesin STT.
 * Jujur: TIDAK mengarang transkrip. Chunk ditandai menunggu diproses
 * oleh provider nyata (Batch 06: Web Speech / server) sehingga audio tetap aman.
 */
export class LocalDevSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = 'local-dev';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async transcribeChunk(request: TranscribeRequest): Promise<TranscriptSegment[]> {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `Transkripsi menunggu diproses: provider speech-to-text "${this.id}" belum dikonfigurasi untuk chunk #${request.chunk.sequence}.`,
      {
        retryable: true,
        context: { meetingId: request.chunk.meetingId, chunkSequence: request.chunk.sequence },
      },
    );
  }
}
