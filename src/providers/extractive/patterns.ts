/**
 * Pola kalimat Bahasa Indonesia untuk ekstraksi keputusan / tindak lanjut /
 * pertanyaan / hal yang belum diputuskan (Batch 09).
 *
 * Prinsip anti-hallucination: pola HANYA memilih kalimat yang benar-benar ada
 * dalam transkrip — tidak pernah menyusun kalimat baru.
 */

/** Keputusan: rapat menetapkan sesuatu. */
const DECISION_PATTERN = new RegExp(
  [
    '\\bdisepakati\\b',
    '\\bdiputuskan\\b',
    '\\bdisetujui\\b',
    '\\bditetapkan\\b',
    '\\bdisejujuri\\b',
    '\\bsepakat\\b',
    '\\bkesepakatan\\b',
    '\\bhasil rapat\\b',
    '\\brapat (?:menyetujui|menetapkan|memutuskan)\\b',
    '\\bdisepakati bersama\\b',
    '\\bfinal\\b',
    '\\bdisahkan\\b',
  ].join('|'),
  'i',
);

/** Tindak lanjut: ada pekerjaan konkret yang harus dikerjakan. */
const ACTION_VERBS = [
  'mengirim',
  'mengirimkan',
  'membuat',
  'menyusun',
  'mengisi',
  'memverifikasi',
  'menghubungi',
  'menyelesaikan',
  'menindaklanjuti',
  'menyiapkan',
  'memperbaiki',
  'mengupdate',
  'memperbarui',
  'memberikan',
  'melaporkan',
  'mengumpulkan',
  'mendata',
  'memastikan',
  'menjadwalkan',
  'merapikan',
  'mensosialisasikan',
  'memfasilitasi',
  'memonitor',
  'mengawasi',
  'mengecek',
  'mengkonfirmasi',
  'mengonfirmasi',
  'menginput',
  'menginputkan',
].join('|');

const ACTION_PATTERN = new RegExp(
  [
    `\\b(?:akan|mesti|harus|perlu)\\s+(?:${ACTION_VERBS})\\b`,
    '\\bmenindaklanjuti\\b',
    '\\btindak lanjut\\b',
    '\\bditugaskan\\b',
    '\\btugas (?:untuk|kepada|adalah)\\b',
    '\\bpic (?:adalah|untuk|dari)\\b',
    '\\bbatas waktu\\b',
  ].join('|'),
  'i',
);

/** Belum diputuskan / masih tertunda. Urutan evaluasi: pola ini lebih dulu. */
const UNDECIDED_PATTERN = new RegExp(
  [
    '\\bbelum (?:disepakati|diputuskan|disetujui|difinalkan|final|ada keputusan)\\b',
    '\\bperlu (?:dibahas|diputuskan|diselesaikan|dikonfirmasi)\\b',
    '\\bmenunggu (?:keputusan|konfirmasi|hasil|jawaban|persetujuan)\\b',
    '\\bmasih (?:menunggu|dalam diskusi|perlu|proses)\\b',
    '\\bdibahas (?:lagi|kembali|lebih lanjut)\\b',
    '\\bdiskusi (?:lanjutan|lebih lanjut)\\b',
    '\\btunda (?:keputusan|persetujuan)\\b',
    '\\bbelum final\\b',
    '\\bmenunggu arahan\\b',
  ].join('|'),
  'i',
);

const QUESTION_WORD_PATTERN = new RegExp(
  '\\b(?:apakah|bagaimana|kapan|mengapa|siapa|berapa|akah)\\b',
  'i',
);

/** Deadline: tanggal/hari umum dalam Bahasa Indonesia. */
const DEADLINE_PATTERN = new RegExp(
  [
    '\\bbesok\\b',
    '\\bhari ini\\b',
    '\\bminggu depan\\b',
    '\\bbulan depan\\b',
    '\\b(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu)\\b',
    '\\b\\d{1,2}\\s+(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\\b',
    '\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b',
    '\\b\\d{4}-\\d{2}-\\d{2}\\b',
  ].join('|'),
  'i',
);

export function isDecision(sentence: string): boolean {
  return DECISION_PATTERN.test(sentence) && !UNDECIDED_PATTERN.test(sentence);
}

export function isAction(sentence: string): boolean {
  return ACTION_PATTERN.test(sentence) && !UNDECIDED_PATTERN.test(sentence);
}

export function isUndecided(sentence: string): boolean {
  return UNDECIDED_PATTERN.test(sentence);
}

export function isQuestion(sentence: string): boolean {
  return sentence.includes('?') || QUESTION_WORD_PATTERN.test(sentence);
}

/** Ambil potongan deadline pertama pada kalimat, atau null. */
export function extractDeadline(sentence: string): string | null {
  const match = DEADLINE_PATTERN.exec(sentence);
  return match ? match[0] : null;
}
