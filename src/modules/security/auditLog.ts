/**
 * Audit log lokal (PRD §26 "audit log", format PRD §48: User/Action/Meeting/
 * Timestamp/Device). Disimpan di localStorage per perangkat — tanpa backend
 * (versi organisasi dengan log terpusat ditunda, lihat IMPLEMENTATION-PLAN).
 * Hanya mencatat aksi destruktif & ekspor; kegagalan menulis tidak pernah
 * merusak alur utama aplikasi.
 */

const STORAGE_KEY = 'notula-audit-log';
const MAX_EVENTS = 500;

export interface AuditEvent {
  id: string;
  action: string;
  meetingId?: string;
  meetingTitle?: string;
  timestamp: string;
  device: string;
}

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Tidak diketahui';
  const platform = navigator.platform;
  return platform !== '' ? platform : 'Perangkat web';
}

function readEvents(): AuditEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AuditEvent =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as AuditEvent).action === 'string' &&
        typeof (item as AuditEvent).timestamp === 'string',
    );
  } catch {
    return []; // JSON korup → mulai kosong, bukan crash
  }
}

function writeEvents(events: AuditEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Kuota penuh → audit log tidak menghalangi aksi utama.
  }
}

/** Catat satu aksi. Aman dipanggil dari mana pun (tidak pernah melempar). */
export function recordAuditEvent(
  action: string,
  detail?: { meetingId?: string; meetingTitle?: string },
): void {
  const event: AuditEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    meetingId: detail?.meetingId,
    meetingTitle: detail?.meetingTitle,
    timestamp: new Date().toISOString(),
    device: deviceLabel(),
  };
  const events = readEvents();
  events.push(event);
  writeEvents(events.slice(-MAX_EVENTS));
}

/** Riwayat audit, terbaru di depan. */
export function listAuditEvents(): AuditEvent[] {
  return readEvents().reverse();
}

export function clearAuditEvents(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // abaikan
  }
}
