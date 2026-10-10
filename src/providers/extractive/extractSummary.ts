/**
 * Pipeline ekstraksi ringkasan dari transkrip (Batch 09) — murni & offline.
 *
 * Mengikuti alur PRD §15 (Transcript → Segment Summary → Global Summary →
 * Decision / Action Item / PIC / Deadline extraction) dengan teknik EKSTRAKTIF:
 * setiap keluaran adalah KALIMAT ASLI dari transkrip beserta timestamp sumber —
 * tidak ada kalimat baru yang disusun (anti-hallucination bawaan).
 */
import type { AISummaryResult, SummaryInput, TraceableItem } from '../../core/types/providers';
import type { TranscriptSegment } from '../../core/types/entities';
import { contentWords, countBy, splitSentences, tidy, tokenizeWords } from './text';
import { extractDeadline, isAction, isDecision, isQuestion, isUndecided } from './patterns';

const MAX_LIST_ITEMS = 10;
const MAX_TOPICS = 5;
const SUMMARY_SENTENCE_MIN = 1;
const SUMMARY_SENTENCE_MAX = 4;
const SUMMARY_SENTENCE_RATIO = 0.15;

const UNDECIDED_FALLBACK = 'Tidak disebutkan dalam rapat.';

export interface SentenceSource {
  text: string;
  segmentId: string;
  startTime: number;
  /** posisi kalimat dalam rapat (untuk skoring & output berurutan) */
  order: number;
}

/** Pecah transkrip jadi kalimat yang tetap terhubung ke segmen sumbernya. */
export function collectSentences(segments: TranscriptSegment[]): SentenceSource[] {
  const ordered = [...segments].sort((a, b) => a.sequence - b.sequence);
  const sentences: SentenceSource[] = [];
  for (const segment of ordered) {
    for (const text of splitSentences(segment.text)) {
      sentences.push({
        text,
        segmentId: segment.id,
        startTime: segment.startTime,
        order: sentences.length,
      });
    }
  }
  return sentences;
}

/**
 * Skor salience sederhana: frekuensi kata bermakna dibagi akar panjang kalimat
 * (kalimat dengan istilah kunci berulang menang; kalimat panjang tak bermakna kalah).
 */
function salience(sentence: SentenceSource, documentFrequency: Map<string, number>): number {
  const words = contentWords(tokenizeWords(sentence.text));
  if (words.length === 0) return 0;
  const counts = countBy(words);
  let score = 0;
  for (const [word, count] of counts) {
    // df rendah = kata spesifik; kata yang muncul di semua kalimat dianggap generik.
    const idf = Math.log(
      1 + (documentFrequency.size + 1) / (1 + (documentFrequency.get(word) ?? 1)),
    );
    score += count * idf;
  }
  return score / Math.sqrt(words.length);
}

/** Paragraf ringkasan: kalimat paling representatif, diurut sesuai timeline. */
function buildSummary(sentences: SentenceSource[], documentFrequency: Map<string, number>): string {
  if (sentences.length === 0) return UNDECIDED_FALLBACK;
  const wanted = Math.min(
    SUMMARY_SENTENCE_MAX,
    Math.max(SUMMARY_SENTENCE_MIN, Math.round(sentences.length * SUMMARY_SENTENCE_RATIO)),
  );
  const top = [...sentences]
    .map((sentence) => ({ sentence, score: salience(sentence, documentFrequency) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.sentence.order - b.sentence.order)
    .slice(0, wanted)
    .sort((a, b) => a.sentence.order - b.sentence.order)
    .map((entry) => entry.sentence.text);
  if (top.length === 0) return UNDECIDED_FALLBACK;
  return tidy(top.join(' '));
}

/**
 * Pokok pembahasan: frasa dua kata bermakna yang bersebelahan dalam transkrip,
 * diurut frekuensi (fallback: kata bermakna tersering).
 */
function buildTopics(sentences: SentenceSource[]): string[] {
  const bigrams = new Map<string, number>();
  const singles = new Map<string, number>();
  for (const sentence of sentences) {
    const tokens = tokenizeWords(sentence.text);
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      const a = tokens[i]!;
      const b = tokens[i + 1]!;
      if (a.index + 1 !== b.index) continue; // harus bersebelahan di teks asli
      const wordA = a.word;
      const wordB = b.word;
      const aOk = wordA.length >= 3;
      const bOk = wordB.length >= 3;
      if (!aOk && !bOk) continue;
      if (aOk && bOk) {
        const key = `${wordA} ${wordB}`;
        bigrams.set(key, (bigrams.get(key) ?? 0) + 1);
      }
      singles.set(wordA, (singles.get(wordA) ?? 0) + 1);
    }
    const last = tokens[tokens.length - 1];
    if (last && last.word.length >= 3) singles.set(last.word, (singles.get(last.word) ?? 0) + 1);
  }

  const topics: string[] = [];
  for (const [phrase, count] of [...bigrams].sort((a, b) => b[1] - a[1])) {
    if (count < 2 && topics.length >= 2) continue; // butuh pengulangan bila list sudah cukup
    topics.push(phrase);
    if (topics.length >= MAX_TOPICS) break;
  }
  if (topics.length === 0) {
    for (const [word] of [...singles].sort((a, b) => b[1] - a[1])) {
      topics.push(word);
      if (topics.length >= MAX_TOPICS) break;
    }
  }
  return topics;
}

/** PIC: nama pembicara yang disebut literal di dalam kalimat. */
function detectAssignee(sentence: string, speakerNames: string[]): string | undefined {
  const lower = sentence.toLowerCase();
  // Nama terpanjang dulu agar "Kepala Sekolah" menang atas potongan pendeknya.
  const sorted = [...speakerNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const needle = name.trim().toLowerCase();
    if (needle.length >= 3 && lower.includes(needle)) return name;
  }
  return undefined;
}

function toTraceable(sentence: SentenceSource): TraceableItem {
  return {
    content: tidy(sentence.text),
    sourceTimestamp: sentence.startTime,
    sourceSegmentId: sentence.segmentId,
  };
}

/** Pipeline ekstraktif — hasil murni dari transkrip yang diberikan. */
export function summarizeExtractive(input: SummaryInput): AISummaryResult {
  const sentences = collectSentences(input.segments);
  const documentFrequency = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of new Set(contentWords(tokenizeWords(sentence.text)))) {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    }
  }

  const speakerNames = input.speakers.map((speaker) => speaker.displayName);
  const decisions: TraceableItem[] = [];
  const questions: TraceableItem[] = [];
  const actionItems: AISummaryResult['actionItems'] = [];
  const undecided: string[] = [];

  for (const sentence of sentences) {
    if (isUndecided(sentence.text)) {
      const content = tidy(sentence.text);
      if (undecided.length < MAX_LIST_ITEMS && !undecided.includes(content)) {
        undecided.push(content);
      }
      continue; // "belum disepakati" bukan keputusan
    }
    if (isDecision(sentence.text) && decisions.length < MAX_LIST_ITEMS) {
      decisions.push(toTraceable(sentence));
    }
    if (isAction(sentence.text) && actionItems.length < MAX_LIST_ITEMS) {
      actionItems.push({
        task: tidy(sentence.text),
        assignee: detectAssignee(sentence.text, speakerNames),
        deadline: extractDeadline(sentence.text) ?? undefined,
        sourceTimestamp: sentence.startTime,
        sourceSegmentId: sentence.segmentId,
      });
    }
    if (isQuestion(sentence.text) && questions.length < MAX_LIST_ITEMS) {
      questions.push(toTraceable(sentence));
    }
  }

  return {
    summary: buildSummary(sentences, documentFrequency),
    topics: buildTopics(sentences),
    decisions,
    actionItems,
    questions,
    undecided: undecided.length > 0 ? undecided : [UNDECIDED_FALLBACK],
  };
}
