/**
 * Generator notulen otomatis (Batch 10) — PRD §17.
 *
 * Murni & jujur: setiap baris berasal dari data rapat yang ada
 * (deskripsi agenda, ringkasan, keputusan, tindak lanjut, PIC, deadline,
 * hal yang belum diputuskan) — tidak ada kalimat yang dikarang.
 * Section kosong dibiarkan `lines: []` (UI menampilkan "Tidak disebutkan
 * dalam rapat.").
 */
import type {
  ActionItem,
  Decision,
  Meeting,
  Minutes,
  MinutesSection,
  Summary,
} from '../../core/types/entities';
import { createId } from '../../core/utils/id';
import { formatClock, nowIso } from '../../core/utils/time';
import { getMinutesTemplate, MINUTES_SECTION_ORDER, type MinutesSectionKey } from './templates';

export interface MinutesInput {
  meeting: Meeting;
  summary: Summary | null;
  decisions: Decision[];
  actionItems: ActionItem[];
  /** id template (string bebas; tidak dikenal → fallback "Notulen Umum") */
  templateId?: string;
}

function buildLines(key: MinutesSectionKey, input: MinutesInput): string[] {
  const { meeting, summary, decisions, actionItems } = input;
  switch (key) {
    case 'agenda':
      // Agenda hanya dari catatan rapat — tanpa deskripsi → kosong (jujur).
      return meeting.description != null && meeting.description.trim() !== ''
        ? meeting.description
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        : [];

    case 'pembahasan':
      if (summary && summary.topics.length > 0) return summary.topics;
      if (summary && summary.content.trim() !== '') return [summary.content];
      return [];

    case 'keputusan':
      return decisions.map(
        (decision) => `${decision.content} (sumber: ${formatClock(decision.sourceTimestamp)})`,
      );

    case 'tindakLanjut':
      return actionItems.map((item) =>
        item.sourceTimestamp !== undefined
          ? `${item.task} (sumber: ${formatClock(item.sourceTimestamp)})`
          : item.task,
      );

    case 'penanggungJawab':
      return actionItems
        .filter((item) => item.assignee != null && item.assignee.trim() !== '')
        .map((item) => `${item.assignee} — ${item.task}`);

    case 'deadline':
      return actionItems
        .filter((item) => item.deadline != null && item.deadline.trim() !== '')
        .map((item) => `${item.deadline} — ${item.task}`);

    case 'catatan':
      return summary ? summary.undecided : [];
  }
}

/** Susun notulen terstruktur PRD §17 dengan judul sesuai template §18. */
export function generateMinutes(input: MinutesInput): Minutes {
  const template = getMinutesTemplate(input.templateId ?? 'umum');
  const timestamp = nowIso();
  const sections: MinutesSection[] = MINUTES_SECTION_ORDER.map((key) => ({
    key,
    title: template.titles[key],
    lines: buildLines(key, input),
  }));

  return {
    id: createId(),
    meetingId: input.meeting.id,
    templateId: template.id,
    sections,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
