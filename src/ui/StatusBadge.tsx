import type { MeetingStatus } from '../core/types/entities';

const STATUS_STYLE: Record<MeetingStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draf', className: 'bg-slate-100 text-slate-600' },
  RECORDING: { label: 'Merekam', className: 'bg-danger/10 text-danger' },
  SAVING_AUDIO: { label: 'Menyimpan', className: 'bg-brand/10 text-brand' },
  TRANSCRIPTION_PENDING: { label: 'Menyiapkan', className: 'bg-brand/10 text-brand' },
  PROCESSING: { label: 'Diproses', className: 'bg-brand/10 text-brand' },
  TRANSCRIBING: { label: 'Transkripsi', className: 'bg-brand/10 text-brand' },
  TRANSCRIPT_READY: { label: 'Transkrip siap', className: 'bg-brand/10 text-brand' },
  SUMMARIZING: { label: 'Merangkum', className: 'bg-brand/10 text-brand' },
  GENERATING_MINUTES: { label: 'Notulen', className: 'bg-brand/10 text-brand' },
  COMPLETED: { label: 'Selesai', className: 'bg-success/10 text-success' },
  PROCESSING_ERROR: { label: 'Gagal', className: 'bg-danger/10 text-danger' },
  ERROR: { label: 'Gagal', className: 'bg-danger/10 text-danger' },
  ARCHIVED: { label: 'Arsip', className: 'bg-slate-100 text-slate-500' },
};

export interface StatusBadgeProps {
  status: MeetingStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${style.className}`}
    >
      {style.label}
    </span>
  );
}
