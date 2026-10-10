import { describe, expect, it } from 'vitest';
import {
  contentWords,
  countBy,
  isStopword,
  normalizeToken,
  splitSentences,
  tidy,
  tokenizeWords,
} from './text';

describe('splitSentences', () => {
  it('memecah pada titik/seru/tanya yang diikuti spasi', () => {
    expect(splitSentences('Rapat dimulai. Semua hadir! Ada pertanyaan?')).toEqual([
      'Rapat dimulai.',
      'Semua hadir!',
      'Ada pertanyaan?',
    ]);
  });

  it('membuang baris kosong dan mempertahankan isi baris', () => {
    expect(splitSentences('Baris satu\n\nBaris dua.')).toEqual(['Baris satu', 'Baris dua.']);
  });
});

describe('tokenize & stopword', () => {
  it('normalisasi huruf kecil dan membuang tanda baca pada token', () => {
    expect(normalizeToken('Data!')).toBe('data');
  });

  it('kata berhenti dikenali', () => {
    expect(isStopword('yang')).toBe(true);
    expect(isStopword('verifikasi')).toBe(false);
  });

  it('contentWords hanya menyisakan kata bermakna', () => {
    const words = contentWords(tokenizeWords('yang data diverifikasi di sekolah'));
    expect(words).toEqual(['data', 'diverifikasi', 'sekolah']);
  });

  it('countBy menghitung frekuensi', () => {
    expect(countBy(['data', 'data', 'rekap'])).toEqual(
      new Map([
        ['data', 2],
        ['rekap', 1],
      ]),
    );
  });
});

describe('tidy', () => {
  it('merapikan spasi ganda', () => {
    expect(tidy('  banyak   spasi \n')).toBe('banyak spasi');
  });
});
