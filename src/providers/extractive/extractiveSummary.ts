/**
 * Provider ringkasan AI ekstraktif lokal (Batch 09).
 *
 * Nyata & offline: ekstraksi kalimat, frasa, keputusan, PIC, dan deadline
 * LANGSUNG dari transkrip — bukan LLM, tanpa jaringan, tanpa API key.
 * Setiap keputusan/tindak lanjut membawa timestamp segmen sumber (traceability),
 * diverifikasi ulang oleh `validateSummaryResult` (guard anti-hallucination).
 */
import type {
  AISummarizationProvider,
  AISummaryResult,
  SummaryInput,
} from '../../core/types/providers';
import { summarizeExtractive } from './extractSummary';
import { validateSummaryResult } from './guard';

export class ExtractiveAISummarizationProvider implements AISummarizationProvider {
  readonly id = 'extractive';

  async isAvailable(): Promise<boolean> {
    // Offline penuh — selalu tersedia selama transkrip ada (dikonsumsi UI).
    return true;
  }

  async summarize(input: SummaryInput): Promise<AISummaryResult> {
    return validateSummaryResult(summarizeExtractive(input), input.segments);
  }
}
