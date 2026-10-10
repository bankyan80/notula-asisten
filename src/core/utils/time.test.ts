import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDateId,
  formatDateIdShort,
  formatMinutesSeconds,
  parseClock,
  percentage,
} from './time';

describe('formatClock', () => {
  it('format detik ke hh:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(47)).toBe('00:00:47');
    expect(formatClock(5076)).toBe('01:24:36');
    expect(formatClock(3600)).toBe('01:00:00');
  });

  it('aman terhadap nilai tidak valid', () => {
    expect(formatClock(-5)).toBe('00:00:00');
    expect(formatClock(Number.NaN)).toBe('00:00:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('00:00:00');
  });
});

describe('formatMinutesSeconds', () => {
  it('format ke mm:ss', () => {
    expect(formatMinutesSeconds(15)).toBe('00:15');
    expect(formatMinutesSeconds(2535)).toBe('42:15');
  });
});

describe('parseClock', () => {
  it('mendukung hh:mm:ss, mm:ss, dan detik', () => {
    expect(parseClock('01:24:36')).toBe(5076);
    expect(parseClock('42:15')).toBe(2535);
    expect(parseClock('47')).toBe(47);
  });

  it('mengembalikan null untuk input tidak valid', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('1:2:3:4')).toBeNull();
    expect(parseClock('12:xx')).toBeNull();
  });
});

describe('format tanggal Indonesia', () => {
  it('format tanggal panjang dan pendek', () => {
    expect(formatDateId('2026-10-07')).toBe('7 Oktober 2026');
    expect(formatDateIdShort('2026-10-07')).toBe('7 Okt 2026');
  });

  it('mengembalikan input apa adanya bila format salah', () => {
    expect(formatDateId('07/10/2026')).toBe('07/10/2026');
  });
});

describe('percentage', () => {
  it('menghitung persentase bicara', () => {
    expect(percentage(42 * 60 + 15, 124 * 60)).toBeCloseTo(34, 0);
    expect(percentage(10, 0)).toBe(0);
  });
});
