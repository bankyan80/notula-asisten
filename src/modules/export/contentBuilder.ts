/**
 * Penyusun konten ekspor (Batch 11, PRD §19):
 * - PDF/DOCX → dokumen notulen lengkap (§19.1: identitas, peserta, ringkasan,
 *   pembahasan, keputusan, tugas, PIC, deadline).
 * - TXT      → transkrip sederhana dengan timestamp (§19.3).
 * - XLSX     → tabel tindak lanjut, keputusan, dan pembicara (§19 + hint UI).
 * Semua isi berasal dari data rapat — tidak ada kalimat yang dikarang.
 */
import type {
  ActionItem,
  ActionItemStatus,
  Decision,
  ExportFormat,
  Meeting,
  Minutes,
  Speaker,
  Summary,
  TranscriptSegment,
} from '../../core/types/entities';
import type { ExportRequest } from '../../core/types/providers';
import { formatClock, formatDateId, formatTimeId, percentage } from '../../core/utils/time';
import { generateMinutes } from '../minutes/generator';
import type { ExportTable } from './format/xlsx';

const UNDISCLOSED = 'Tidak disebutkan dalam rapat.';

export interface ExportData {
  meeting: Meeting;
  minutes: Minutes | null;
  summary: Summary | null;
  segments: TranscriptSegment[];
  decisions: Decision[];
  actionItems: ActionItem[];
  speakers: Speaker[];
}

const STATUS_LABELS: Record<ActionItemStatus, string> = {
  OPEN: 'Terbuka',
  IN_PROGRESS: 'Berjalan',
  DONE: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

function meetingIdentityLines(meeting: Meeting): string[] {
  const lines = [
    'NOTULEN RAPAT',
    '',
    `Judul: ${meeting.title}`,
    `Tanggal: ${formatDateId(meeting.date)}`,
    `Waktu: ${meeting.startTime ? formatTimeId(meeting.startTime) : UNDISCLOSED}`,
    `Tempat: ${meeting.location && meeting.location.trim() !== '' ? meeting.location : UNDISCLOSED}`,
    `Durasi: ${formatClock(meeting.durationSeconds)}`,
    `Peserta: ${meeting.participants.length > 0 ? meeting.participants.join(', ') : UNDISCLOSED}`,
    '',
  ];
  return lines;
}

function documentSections(data: ExportData): string[] {
  const { meeting, minutes, summary, decisions, actionItems } = data;

  // Bila notulen sudah dibuat, ikuti strukturnya (PRD §17/§18).
  const sections =
    minutes ??
    generateMinutes({
      meeting,
      summary,
      decisions,
      actionItems,
      templateId: meeting.minutesTemplateId,
    });

  const lines: string[] = [];
  if (summary && summary.content.trim() !== '') {
    lines.push('RINGKASAN', summary.content, '');
  }
  for (const section of sections.sections) {
    lines.push(section.title);
    if (section.lines.length === 0) {
      lines.push(UNDISCLOSED);
    } else {
      for (const line of section.lines) lines.push(`- ${line}`);
    }
    lines.push('');
  }
  return lines;
}

/** Dokumen lengkap utk PDF & DOCX (PRD §19.1). */
export function buildDocumentText(data: ExportData): string {
  return [...meetingIdentityLines(data.meeting), ...documentSections(data)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Transkrip sederhana utk TXT (PRD §19.3): timestamp — pembicara, lalu teks. */
export function buildTranscriptText(data: ExportData): string {
  const speakerNames = new Map(data.speakers.map((speaker) => [speaker.id, speaker.displayName]));
  const lines: string[] = [`${data.meeting.title} — ${formatDateId(data.meeting.date)}`, ''];
  const ordered = [...data.segments].sort((a, b) => a.sequence - b.sequence);
  for (const segment of ordered) {
    const name = segment.speakerId ? speakerNames.get(segment.speakerId) : undefined;
    lines.push(`${formatClock(segment.startTime)}${name ? ` — ${name}` : ''}`);
    lines.push(segment.text);
    lines.push('');
  }
  return lines.join('\n').trim();
}

/** Tabel XLSX: tindak lanjut (dengan PIC/deadline), keputusan, pembicara. */
export function buildExportTables(data: ExportData): ExportTable[] {
  const totalSpeaking = data.speakers.reduce((sum, speaker) => sum + speaker.durationSeconds, 0);

  const actionRows: string[][] = [
    ['Tugas', 'PIC', 'Deadline', 'Status', 'Sumber'],
    ...data.actionItems.map((item) => [
      item.task,
      item.assignee ?? UNDISCLOSED,
      item.deadline ?? UNDISCLOSED,
      STATUS_LABELS[item.status] ?? item.status,
      item.sourceTimestamp !== undefined ? formatClock(item.sourceTimestamp) : UNDISCLOSED,
    ]),
  ];

  const decisionRows: string[][] = [
    ['Keputusan', 'Sumber'],
    ...data.decisions.map((decision) => [decision.content, formatClock(decision.sourceTimestamp)]),
  ];

  const speakerRows: string[][] = [
    ['Pembicara', 'Durasi', 'Jumlah Segmen', 'Persentase'],
    ...data.speakers.map((speaker) => [
      speaker.displayName,
      formatClock(speaker.durationSeconds),
      String(speaker.segmentCount),
      `${percentage(speaker.durationSeconds, totalSpeaking)}%`,
    ]),
  ];

  return [
    { name: 'Tindak Lanjut', rows: actionRows },
    { name: 'Keputusan', rows: decisionRows },
    { name: 'Pembicara', rows: speakerRows },
  ];
}

export function exportFileName(meeting: Meeting, format: ExportFormat): string {
  const cleanTitle =
    meeting.title
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'Rapat';
  const extension = format.toLowerCase();
  return `${cleanTitle} ${meeting.date}.${extension}`;
}

/** Susun permintaan ekspor sesuai format (PRD §19). */
export function buildExportRequest(format: ExportFormat, data: ExportData): ExportRequest {
  if (format === 'TXT') {
    return {
      meeting: data.meeting,
      format,
      content: buildTranscriptText(data),
    };
  }
  if (format === 'XLSX') {
    return {
      meeting: data.meeting,
      format,
      content: `${data.meeting.title} — ${formatDateId(data.meeting.date)}`,
      tables: buildExportTables(data),
    };
  }
  // PDF & DOCX: dokumen notulen lengkap.
  return {
    meeting: data.meeting,
    format,
    content: buildDocumentText(data),
  };
}
