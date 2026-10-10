/**
 * Utilitas waktu — SEMUA durasi/posisi dalam detik pada timeline rapat,
 * bukan epoch dan bukan waktu request.
 */

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const MONTHS_ID_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

/** Format detik → jam:menit:detik (00:00:47 / 01:24:36). */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00:00';
  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

/** Format menit:detik (42:15). */
export function formatMinutesSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const whole = Math.floor(totalSeconds);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Parse "01:24:36" | "24:36" | "47" → detik. Bila tidak valid → null. */
export function parseClock(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parts = trimmed.split(':');
  if (parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return total;
}

/** ISO date (yyyy-MM-dd) → "7 Oktober 2026". */
export function formatDateId(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  const monthName = MONTHS_ID[monthIndex];
  if (!monthName) return isoDate;
  return `${Number(day)} ${monthName} ${year}`;
}

/** ISO date (yyyy-MM-dd) → "7 Okt 2026". */
export function formatDateIdShort(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  const monthName = MONTHS_ID_SHORT[Number(month) - 1];
  if (!monthName) return isoDate;
  return `${Number(day)} ${monthName} ${year}`;
}

/** ISO date-time → "09:00" (locale Asia/Jakarta by default perangkat). */
export function formatTimeId(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** Persentase bicara (0–100) dengan 1 desimal. */
export function percentage(partSeconds: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;
  return Math.round((partSeconds / totalSeconds) * 1000) / 10;
}

/** Timestamp detik saat ini (epoch) — untuk createdAt bila perlu. */
export function nowIso(): string {
  return new Date().toISOString();
}
