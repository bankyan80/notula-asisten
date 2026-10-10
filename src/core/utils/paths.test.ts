import { describe, expect, it } from 'vitest';
import { AppError } from '../errors/AppError';
import { audioChunkPath, meetingFilePath, meetingRoot, parseMeetingPath } from './paths';

describe('meeting paths', () => {
  it('membangun root rapat dan path file per jenis', () => {
    expect(meetingRoot('abc-123')).toBe('Meetings/abc-123');
    expect(meetingFilePath('abc-123', 'transcript', 'segments.json')).toBe(
      'Meetings/abc-123/transcript/segments.json',
    );
    expect(meetingFilePath('abc-123', 'exports', 'notulen.pdf')).toBe(
      'Meetings/abc-123/exports/notulen.pdf',
    );
  });

  it('chunk audio bernomor 6 digit mulai dari 1', () => {
    expect(audioChunkPath('abc-123', 1)).toBe('Meetings/abc-123/audio/000001.m4a');
    expect(audioChunkPath('abc-123', 42)).toBe('Meetings/abc-123/audio/000042.m4a');
  });

  it('menolak path traversal dan input tidak aman', () => {
    expect(() => meetingRoot('../etc')).toThrow(AppError);
    expect(() => meetingFilePath('ok-id', 'audio', '../../x')).toThrow(AppError);
    expect(() => audioChunkPath('ok-id', 0)).toThrow(AppError);
    expect(() => audioChunkPath('ok-id', 1.5)).toThrow(AppError);
  });

  it('parse mengembalikan bagian path atau null untuk path asing', () => {
    expect(parseMeetingPath('Meetings/abc-123/audio/000001.m4a')).toEqual({
      meetingId: 'abc-123',
      kind: 'audio',
      fileName: '000001.m4a',
    });
    expect(parseMeetingPath('Downloads/rapat.pdf')).toBeNull();
    expect(parseMeetingPath('Meetings/abc-123/other/file.txt')).toBeNull();
    expect(parseMeetingPath('Meetings/../audio/000001.m4a')).toBeNull();
  });
});
