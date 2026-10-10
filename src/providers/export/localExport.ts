/**
 * Provider ekspor lokal (Batch 11) — membuat berkas NYATA di perangkat:
 * PDF (penulis sendiri), DOCX/XLSX (OOXML dalam ZIP STORE), TXT (UTF-8).
 * Tanpa jaringan & tanpa dependensi ekstra; format tak didukung → jujur lempar
 * PROVIDER_UNAVAILABLE.
 */
import { AppError } from '../../core/errors/AppError';
import type { ExportFormat } from '../../core/types/entities';
import type { ExportProvider, ExportRequest, ExportResult } from '../../core/types/providers';
import { createDocx } from '../../modules/export/format/docx';
import { createPdf } from '../../modules/export/format/pdf';
import { createXlsx } from '../../modules/export/format/xlsx';
import { exportFileName } from '../../modules/export/contentBuilder';

const SUPPORTED: readonly ExportFormat[] = ['PDF', 'DOCX', 'TXT', 'XLSX'];

const MIME: Record<string, string> = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TXT: 'text/plain;charset=utf-8',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export class LocalExportProvider implements ExportProvider {
  readonly id = 'local-export';

  supports(format: ExportFormat): boolean {
    return SUPPORTED.includes(format);
  }

  async export(request: ExportRequest): Promise<ExportResult> {
    if (!this.supports(request.format)) {
      throw new AppError('PROVIDER_UNAVAILABLE', `Format ${request.format} belum didukung.`, {
        context: { format: request.format },
      });
    }

    let blob: Blob;
    switch (request.format) {
      case 'PDF':
        blob = createPdf(request.content);
        break;
      case 'DOCX':
        blob = createDocx(request.content);
        break;
      case 'XLSX':
        blob = createXlsx(request.tables ?? [], request.content);
        break;
      case 'TXT':
        blob = new Blob([request.content], { type: MIME.TXT });
        break;
      default:
        throw new AppError('PROVIDER_UNAVAILABLE', 'Format tidak dikenal.');
    }

    return {
      blob,
      fileName: exportFileName(request.meeting, request.format),
      mimeType: MIME[request.format] ?? 'application/octet-stream',
    };
  }
}
