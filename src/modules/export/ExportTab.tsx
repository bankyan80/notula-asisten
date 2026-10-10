import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../core/hooks/useAsync';
import { useRepositories } from '../../app/useRepositories';
import { useToastStore } from '../../app/toastStore';
import { friendlyMessage } from '../../core/errors/AppError';
import { createId } from '../../core/utils/id';
import { meetingFilePath } from '../../core/utils/paths';
import { nowIso } from '../../core/utils/time';
import type { ExportFormat } from '../../core/types/entities';
import { getExportProvider, getStorageProvider } from '../../providers';
import { Button } from '../../ui';
import { removeMeetingFiles } from '../storage/meetingFiles';
import {
  MEETING_DATA_KIND_LABEL,
  deleteMeetingDataKind,
  type MeetingDataKind,
} from '../storage/manageMeetingData';
import { recordAuditEvent } from '../security/auditLog';
import { buildExportRequest } from './contentBuilder';
import { triggerDownload } from './download';

const FORMATS: Array<{ format: ExportFormat; label: string }> = [
  { format: 'PDF', label: 'PDF' },
  { format: 'DOCX', label: 'DOCX' },
  { format: 'TXT', label: 'TXT' },
  { format: 'XLSX', label: 'XLSX' },
];

export function ExportTab() {
  const { meetingId = '' } = useParams();
  const repositories = useRepositories();
  const navigate = useNavigate();
  const showToast = useToastStore((state) => state.showToast);
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);

  const { data: meeting } = useAsync(
    () => repositories.meetings.getById(meetingId),
    [repositories, meetingId],
  );
  const { data: minutes } = useAsync(
    () => repositories.minutes.get(meetingId),
    [repositories, meetingId],
  );
  const { data: summary, reload: reloadSummary } = useAsync(
    () => repositories.summaries.get(meetingId),
    [repositories, meetingId],
  );
  const { data: segments, reload: reloadSegments } = useAsync(
    () => repositories.transcript.listByMeeting(meetingId),
    [repositories, meetingId],
  );

  const hasContent = Boolean(minutes || summary || (segments?.length ?? 0) > 0);

  const handleExport = async (format: ExportFormat): Promise<void> => {
    if (!meeting) {
      showToast('Rapat tidak ditemukan.');
      return;
    }
    setBusyFormat(format);
    try {
      const provider = getExportProvider();
      if (!provider.supports(format)) {
        showToast(`Format ${format} belum didukung.`);
        return;
      }
      const [
        loadedMinutes,
        loadedSummary,
        loadedSegments,
        loadedDecisions,
        loadedItems,
        loadedSpeakers,
      ] = await Promise.all([
        repositories.minutes.get(meetingId),
        repositories.summaries.get(meetingId),
        repositories.transcript.listByMeeting(meetingId),
        repositories.decisions.listByMeeting(meetingId),
        repositories.actionItems.listByMeeting(meetingId),
        repositories.speakers.listByMeeting(meetingId),
      ]);
      const request = buildExportRequest(format, {
        meeting,
        minutes: loadedMinutes,
        summary: loadedSummary,
        segments: loadedSegments,
        decisions: loadedDecisions,
        actionItems: loadedItems,
        speakers: loadedSpeakers,
      });
      const result = await provider.export(request);
      const entryId = createId();
      const extension = format.toLowerCase();
      const plannedPath = meetingFilePath(
        meetingId,
        'exports',
        `${meeting.date}-${extension}-${entryId.slice(0, 8)}.${extension}`,
      );
      let localPath = '';
      try {
        localPath = await getStorageProvider().writeBlob(plannedPath, result.blob);
      } catch {
        // OPFS tidak tersedia
      }
      await repositories.exports.add({
        id: entryId,
        meetingId,
        format,
        fileName: result.fileName,
        localPath,
        byteSize: result.blob.size,
        createdAt: nowIso(),
      });
      triggerDownload(result.blob, result.fileName);
      recordAuditEvent(`Ekspor ${format}`, { meetingId, meetingTitle: meeting.title });
      showToast(`File ${result.fileName} berhasil diunduh.`);
    } catch (error) {
      showToast(friendlyMessage(error));
    } finally {
      setBusyFormat(null);
    }
  };

  const handleDelete = async (): Promise<void> => {
    const confirmed = window.confirm(
      'Hapus rapat ini beserta audio, transkrip, dan hasil AI? Tindakan ini tidak dapat dibatalkan.',
    );
    if (!confirmed) return;
    try {
      await Promise.all([repositories.meetings.delete(meetingId), removeMeetingFiles(meetingId)]);
      recordAuditEvent('Hapus rapat dan seluruh data', {
        meetingId,
        meetingTitle: meeting?.title,
      });
      showToast('Rapat dan seluruh datanya dihapus.');
      void navigate('/rapat');
    } catch {
      showToast('Gagal menghapus rapat.');
    }
  };

  const handleDeleteKind = async (kind: MeetingDataKind): Promise<void> => {
    const label = MEETING_DATA_KIND_LABEL[kind];
    const confirmed = window.confirm(
      `Hapus ${label} rapat ini? Rapat beserta data lain tetap tersimpan. Tindakan ini tidak dapat dibatalkan.`,
    );
    if (!confirmed) return;
    try {
      const removed = await deleteMeetingDataKind(repositories, meetingId, kind);
      recordAuditEvent(`Hapus ${label} rapat`, { meetingId, meetingTitle: meeting?.title });
      if (removed === 0) {
        showToast(`Tidak ada ${label} yang tersimpan untuk rapat ini.`);
      } else {
        showToast(`${label[0].toUpperCase()}${label.slice(1)} rapat dihapus.`);
      }
      void reloadSummary();
      void reloadSegments();
    } catch (error) {
      showToast(friendlyMessage(error));
    }
  };

  return (
    <div>
      {/* Format buttons */}
      {!hasContent && (
        <p className="mb-4 text-base leading-relaxed text-muted">
          Belum ada hasil rapat untuk diekspor. Ekspor tersedia setelah notulen atau ringkasan
          dibuat.
        </p>
      )}
      <div className="mb-8 grid grid-cols-2 gap-3">
        {FORMATS.map((item) => (
          <Button
            key={item.format}
            variant="secondary"
            disabled={!hasContent || busyFormat !== null}
            onClick={() => void handleExport(item.format)}
          >
            {busyFormat === item.format ? 'Mengekspor…' : item.label}
          </Button>
        ))}
      </div>

      {/* Delete section */}
      <div className="rounded-2xl bg-white p-4">
        <h3 className="text-lg font-bold text-ink">Kelola Data</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Hapus sebagian data atau hapus rapat beserta seluruh datanya.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button
            variant="secondary"
            disabled={!meeting}
            onClick={() => void handleDeleteKind('audio')}
          >
            🎵 Audio
          </Button>
          <Button
            variant="secondary"
            disabled={!meeting}
            onClick={() => void handleDeleteKind('transcript')}
          >
            📝 Transkrip
          </Button>
          <Button
            variant="secondary"
            disabled={!meeting}
            onClick={() => void handleDeleteKind('ai')}
          >
            🤖 AI
          </Button>
        </div>
        <Button variant="danger" block className="mt-3" onClick={() => void handleDelete()}>
          🗑 Hapus Rapat &amp; Semua Data
        </Button>
      </div>
    </div>
  );
}
