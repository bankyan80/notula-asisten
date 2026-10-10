import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuditEvents, listAuditEvents, recordAuditEvent } from './auditLog';

beforeEach(() => {
  clearAuditEvents();
});

describe('auditLog (PRD §26/§48)', () => {
  it('mencatat aksi dengan timestamp, perangkat, dan konteks rapat', () => {
    recordAuditEvent('Ekspor PDF', { meetingId: 'm1', meetingTitle: 'Rapat X' });

    const [event] = listAuditEvents();
    expect(event.action).toBe('Ekspor PDF');
    expect(event.meetingId).toBe('m1');
    expect(event.meetingTitle).toBe('Rapat X');
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false);
    expect(event.device.length).toBeGreaterThan(0);
  });

  it('riwayat terbaru di depan dan dibatasi 500 entri', () => {
    for (let index = 0; index < 505; index += 1) {
      recordAuditEvent(`Aksi ${index}`);
    }

    const events = listAuditEvents();
    expect(events.length).toBe(500);
    expect(events[0]?.action).toBe('Aksi 504');
    expect(events.at(-1)?.action).toBe('Aksi 5');
  });

  it('localStorage korup → mulai kosong tanpa crash, aksi berikutnya tetap tercatat', () => {
    localStorage.setItem('notula-audit-log', '{rusak-bukan-json');

    expect(listAuditEvents()).toEqual([]);

    recordAuditEvent('Aksi sesudah korup');
    expect(listAuditEvents()[0]?.action).toBe('Aksi sesudah korup');
  });

  it('membersihkan riwayat', () => {
    recordAuditEvent('A');
    clearAuditEvents();
    expect(listAuditEvents()).toEqual([]);
  });
});
