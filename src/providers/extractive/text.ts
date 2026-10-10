/**
 * Utilitas teks Bahasa Indonesia untuk ekstraksi ringkasan (Batch 09).
 * Murni, deterministik — tanpa model & tanpa jaringan.
 */

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+|\n+/;

/** Pecah teks menjadi kalimat (boundary: titik/seru/tanya + spasi atau baris baru). */
export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** Kata umum Indonesia yang tidak membawa makna topik/keputusan. */
const STOPWORDS = new Set([
  'ada',
  'adalah',
  'agar',
  'akan',
  'antara',
  'apa',
  'adanya',
  'anda',
  'atau',
  'begitu',
  'bisa',
  'boleh',
  'dalam',
  'dapat',
  'dari',
  'dekat',
  'demi',
  'demikian',
  'dengan',
  'di',
  'dia',
  'ini',
  'itu',
  'juga',
  'jika',
  'karena',
  'kami',
  'karena',
  'ke',
  'kepada',
  'ketika',
  'kurang',
  'lagi',
  'lanjut',
  'lebih',
  'makanya',
  'maka',
  'mereka',
  'perlu',
  'pada',
  'para',
  'pun',
  'saja',
  'sangat',
  'saya',
  'sudah',
  'supaya',
  'tapi',
  'tanpa',
  'telah',
  'tentang',
  'tersebut',
  'tidak',
  'untuk',
  'yang',
  'serta',
  'hingga',
  'sampai',
  'oleh',
  'sebagai',
  'adapun',
  'bahkan',
  'bila',
  'kalau',
  'lalu',
  'kemudian',
  'kini',
  'nanti',
  'semua',
  'setiap',
  'sebelum',
  'sesudah',
  'siapa',
  'kapan',
  'bagaimana',
  'mengapa',
  'kenapa',
]);

/** Normalisasi kata: huruf kecil, tanpa tanda baca ujung. */
export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}

export interface WordToken {
  word: string;
  /** index token dalam kalimat (untuk menjaga urutan bigram asli) */
  index: number;
}

/** Tokenisasi kata (hanya huruf/angka) — kata berhenti tetap dipertahankan di posisinya. */
export function tokenizeWords(text: string): WordToken[] {
  const raw = text.split(/\s+/).filter((token) => token.length > 0);
  const words: WordToken[] = [];
  for (const token of raw) {
    const word = normalizeToken(token);
    if (word.length > 0) words.push({ word, index: words.length });
  }
  return words;
}

/** Kata bermakna (bukan kata berhenti, panjang ≥ 3) untuk skoring salience. */
export function contentWords(tokens: WordToken[]): string[] {
  return tokens.map((token) => token.word).filter((word) => word.length >= 3 && !isStopword(word));
}

export function countBy(words: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

/** Rapikan spasi ganda hasil gabungan. */
export function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
