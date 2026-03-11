// ReadStar — Full Diagnostic Engine
// Needleman-Wunsch alignment, extended miscue taxonomy, weighted accuracy,
// Betts criteria, reading pattern detection with instructional recommendations.

import { levenshtein } from './scoring';
import {
  phoneticallySimilar,
  visuallySimilar,
  semanticallySimilar,
  isFunctionWord,
  samePOS,
  hasConsonantBlend,
  hasDigraph,
  getPhonemeProfile,
  getGradeBenchmark,
} from './phonetics';
import type { PauseInfo } from './acousticAnalysis';
import { v4 as uuidv4 } from 'uuid';

// ─── Error Subtype Taxonomy ──────────────────────────────────────────────────

export type MiscueSubtype =
  | 'VISUAL_SUBSTITUTION'
  | 'SEMANTIC_SUBSTITUTION'
  | 'SYNTACTIC_SUBSTITUTION'
  | 'PHONETIC_SUBSTITUTION'
  | 'FUNCTION_WORD_OMISSION'
  | 'CONTENT_WORD_OMISSION'
  | 'PHRASE_OMISSION'
  | 'LINE_OMISSION'
  | 'ARTICLE_INSERTION'
  | 'FILLER_INSERTION'
  | 'WORD_INVENTION'
  | 'SINGLE_WORD_REPETITION'
  | 'PHRASE_REPETITION'
  | 'SENTENCE_REPETITION'
  | 'REPETITION_WITH_CORRECTION'
  | 'REPETITION_WITHOUT_CORRECTION'
  | 'SUCCESSFUL_SELF_CORRECTION'
  | 'UNSUCCESSFUL_SELF_CORRECTION'
  | 'INITIAL_CONSONANT_ERROR'
  | 'FINAL_CONSONANT_ERROR'
  | 'MEDIAL_VOWEL_ERROR'
  | 'CONSONANT_BLEND_ERROR'
  | 'DIGRAPH_ERROR'
  | 'REVERSAL'
  | 'DIALECT_VARIANT';

export type MiscuePrimaryType =
  | 'substitution'
  | 'omission'
  | 'insertion'
  | 'repetition'
  | 'self-correction'
  | 'mispronunciation'
  | 'reversal';

export interface Miscue {
  id: string;
  subtype: MiscueSubtype;
  primaryType: MiscuePrimaryType;
  expectedWord: string;
  spokenWord: string;
  position: number;
  weight: number;
  syntacticAcceptable: 'yes' | 'partial' | 'no';
  semanticAcceptable: 'yes' | 'partial' | 'no';
  meaningChanged: boolean;
  timestampMs: number;
}

export interface AlignedPair {
  op: 'MATCH' | 'SUBSTITUTE' | 'OMIT' | 'INSERT';
  expected: string;
  spoken: string;
  position: number;
}

export interface SelfCorrectionEvent {
  position: number;
  attempt: string;
  finalWord: string;
  successful: boolean;
}

export interface PhonemeError {
  expectedPhoneme: string;
  spokenPhoneme: string;
  word: string;
  position: number;
}

export type BettsCriteria =
  | 'independent'
  | 'instructional'
  | 'frustration-borderline'
  | 'frustration';

export type NAEPFluencyLevel = 1 | 2 | 3 | 4;

export type ReadingPatternId =
  | 'word-by-word'
  | 'speed-accuracy-tradeoff'
  | 'avoidant-reader'
  | 'meaning-seeker'
  | 'decoder-no-meaning'
  | 'self-monitor'
  | 'sight-word-guesser'
  | 'phrase-chunker'
  | 'fatigue-pattern'
  | 'consonant-blend-struggler';

export type PatternSeverity = 'positive' | 'watch' | 'concern' | 'high';

export interface PatternResult {
  id: ReadingPatternId;
  severity: PatternSeverity;
  label: string;
  description: string;
  recommendation: string;
}

// ─── Error Weight Matrix ─────────────────────────────────────────────────────

export const ERROR_WEIGHTS: Record<MiscueSubtype, number> = {
  CONTENT_WORD_OMISSION: 1.0,
  PHRASE_OMISSION: 1.5,
  LINE_OMISSION: 2.0,
  SEMANTIC_SUBSTITUTION: 1.0,
  VISUAL_SUBSTITUTION: 0.7,
  SYNTACTIC_SUBSTITUTION: 0.6,
  PHONETIC_SUBSTITUTION: 0.6,
  FUNCTION_WORD_OMISSION: 0.3,
  WORD_INVENTION: 0.8,
  ARTICLE_INSERTION: 0.2,
  FILLER_INSERTION: 0.1,
  SINGLE_WORD_REPETITION: 0.4,
  PHRASE_REPETITION: 0.5,
  SENTENCE_REPETITION: 0.6,
  REPETITION_WITH_CORRECTION: -0.1,
  REPETITION_WITHOUT_CORRECTION: 0.4,
  SUCCESSFUL_SELF_CORRECTION: -0.3,
  UNSUCCESSFUL_SELF_CORRECTION: 0.3,
  INITIAL_CONSONANT_ERROR: 0.5,
  FINAL_CONSONANT_ERROR: 0.4,
  MEDIAL_VOWEL_ERROR: 0.5,
  CONSONANT_BLEND_ERROR: 0.6,
  DIGRAPH_ERROR: 0.5,
  REVERSAL: 0.7,
  DIALECT_VARIANT: 0.0,
};

const DIALECT_VARIANTS = new Map<string, string[]>([
  ['going', ['gonna']], ['want', ['wanna']], ['got', ['gotta']],
  ['kind', ['kinda']], ['out', ['outta']], ['sort', ['sorta']],
  ['because', ['cuz', 'cos']], ['probably', ['prolly']],
  ['supposed', ['sposta']], ['used', ['usta']], ['let', ['lemme']],
]);

const FILLER_WORDS = new Set(['um', 'uh', 'er', 'ah', 'like', 'hmm', 'oh', 'okay', 'well']);
const ARTICLES = new Set(['a', 'an', 'the']);

// ─── Needleman-Wunsch Global Alignment ───────────────────────────────────────

function alignTranscriptToExpected(expected: string[], spoken: string[]): AlignedPair[] {
  const n = expected.length;
  const m = spoken.length;

  const dp: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match = expected[i - 1] === spoken[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + match,
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
      );
    }
  }

  // Traceback
  const alignment: AlignedPair[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (
      i > 0 && j > 0 &&
      dp[i][j] === dp[i - 1][j - 1] + (expected[i - 1] === spoken[j - 1] ? 0 : 1)
    ) {
      const op = expected[i - 1] === spoken[j - 1] ? 'MATCH' : 'SUBSTITUTE';
      alignment.unshift({ op, expected: expected[i - 1] ?? '', spoken: spoken[j - 1] ?? '', position: i - 1 });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      alignment.unshift({ op: 'OMIT', expected: expected[i - 1] ?? '', spoken: '', position: i - 1 });
      i--;
    } else {
      alignment.unshift({ op: 'INSERT', expected: '', spoken: spoken[j - 1] ?? '', position: j - 1 });
      j--;
    }
  }

  return alignment;
}

// ─── Error Classification ────────────────────────────────────────────────────

function classifySubstitution(expected: string, spoken: string): MiscueSubtype {
  const e = expected.toLowerCase();
  const s = spoken.toLowerCase();

  const dialects = DIALECT_VARIANTS.get(e);
  if (dialects?.includes(s)) return 'DIALECT_VARIANT';

  if (phoneticallySimilar(e, s)) return 'PHONETIC_SUBSTITUTION';
  if (visuallySimilar(e, s)) return 'VISUAL_SUBSTITUTION';
  if (semanticallySimilar(e, s)) return 'SEMANTIC_SUBSTITUTION';
  if (samePOS(e, s)) return 'SYNTACTIC_SUBSTITUTION';

  const eP = getPhonemeProfile(e);
  const sP = getPhonemeProfile(s);
  if (eP.initial[0] !== sP.initial[0]) return 'INITIAL_CONSONANT_ERROR';
  if (eP.final.slice(-1) !== sP.final.slice(-1)) return 'FINAL_CONSONANT_ERROR';
  if (eP.hasBlend && !sP.hasBlend) return 'CONSONANT_BLEND_ERROR';
  if (eP.hasDigraph && !sP.hasDigraph) return 'DIGRAPH_ERROR';

  return 'VISUAL_SUBSTITUTION';
}

function classifyMispronunciation(expected: string, spoken: string): MiscueSubtype {
  const e = expected.toLowerCase();
  const s = spoken.toLowerCase();
  const eVowels = (e.match(/[aeiou]/g) ?? []).join('');
  const sVowels = (s.match(/[aeiou]/g) ?? []).join('');

  if (e[0] !== s[0]) return 'INITIAL_CONSONANT_ERROR';
  if (e.slice(-1) !== s.slice(-1)) return 'FINAL_CONSONANT_ERROR';
  if (eVowels !== sVowels) return 'MEDIAL_VOWEL_ERROR';

  const eP = getPhonemeProfile(e);
  const sP = getPhonemeProfile(s);
  if (eP.hasBlend && !sP.hasBlend) return 'CONSONANT_BLEND_ERROR';
  if (eP.hasDigraph && !sP.hasDigraph) return 'DIGRAPH_ERROR';

  return 'PHONETIC_SUBSTITUTION';
}

function computeMiscueQuality(
  expected: string,
  spoken: string,
  primaryType: MiscuePrimaryType,
): { syntacticAcceptable: 'yes' | 'partial' | 'no'; semanticAcceptable: 'yes' | 'partial' | 'no'; meaningChanged: boolean } {
  if (primaryType === 'omission') {
    const isFn = isFunctionWord(expected);
    return {
      syntacticAcceptable: isFn ? 'partial' : 'no',
      semanticAcceptable: isFn ? 'yes' : 'partial',
      meaningChanged: !isFn,
    };
  }
  if (primaryType === 'insertion') {
    const isFn = isFunctionWord(spoken);
    return {
      syntacticAcceptable: isFn ? 'yes' : 'partial',
      semanticAcceptable: isFn ? 'yes' : 'partial',
      meaningChanged: !isFn,
    };
  }
  if (primaryType === 'substitution' || primaryType === 'mispronunciation') {
    const semSim = semanticallySimilar(expected, spoken);
    const posSame = samePOS(expected, spoken);
    return {
      syntacticAcceptable: posSame ? 'yes' : 'partial',
      semanticAcceptable: semSim ? 'yes' : 'no',
      meaningChanged: !semSim,
    };
  }
  return { syntacticAcceptable: 'yes', semanticAcceptable: 'yes', meaningChanged: false };
}

// ─── Full Miscue Analysis ────────────────────────────────────────────────────

export function runFullMiscueAnalysis(
  expectedText: string,
  transcriptText: string,
): {
  miscues: Miscue[];
  weightedAccuracy: number;
  selfCorrections: SelfCorrectionEvent[];
  phonemeErrors: PhonemeError[];
  alignedPairs: AlignedPair[];
} {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);

  const expected = normalize(expectedText);
  const spoken = normalize(transcriptText);
  const now = Date.now();
  const miscues: Miscue[] = [];
  const selfCorrections: SelfCorrectionEvent[] = [];
  const phonemeErrors: PhonemeError[] = [];

  const alignedPairs = alignTranscriptToExpected(expected, spoken);

  // Detect repetitions from spoken sequence
  for (let i = 1; i < spoken.length; i++) {
    if (spoken[i] === spoken[i - 1]) {
      const isCorrection = i + 1 < spoken.length && spoken[i + 1] !== spoken[i];
      const subtype: MiscueSubtype = isCorrection ? 'REPETITION_WITH_CORRECTION' : 'SINGLE_WORD_REPETITION';
      miscues.push({
        id: uuidv4(), subtype, primaryType: 'repetition',
        expectedWord: spoken[i] ?? '', spokenWord: spoken[i] ?? '',
        position: i, weight: ERROR_WEIGHTS[subtype],
        syntacticAcceptable: 'yes', semanticAcceptable: 'yes', meaningChanged: false,
        timestampMs: now,
      });
    }
  }

  // Detect filler insertions from spoken words
  spoken.forEach((w, pos) => {
    if (FILLER_WORDS.has(w) && !expected.includes(w)) {
      miscues.push({
        id: uuidv4(), subtype: 'FILLER_INSERTION', primaryType: 'insertion',
        expectedWord: '', spokenWord: w,
        position: pos, weight: ERROR_WEIGHTS.FILLER_INSERTION,
        syntacticAcceptable: 'yes', semanticAcceptable: 'yes', meaningChanged: false,
        timestampMs: now,
      });
    }
  });

  // Process alignment pairs for omissions, insertions, substitutions
  let phraseOmitCount = 0;
  let lastOmitPos = -2;

  for (let idx = 0; idx < alignedPairs.length; idx++) {
    const pair = alignedPairs[idx];
    if (!pair || pair.op === 'MATCH') continue;

    if (pair.op === 'OMIT') {
      const isFn = isFunctionWord(pair.expected);
      const isConsecutive = pair.position === lastOmitPos + 1;
      if (isConsecutive) phraseOmitCount++;
      else phraseOmitCount = 1;
      lastOmitPos = pair.position;

      const subtype: MiscueSubtype = phraseOmitCount >= 2
        ? 'PHRASE_OMISSION'
        : isFn ? 'FUNCTION_WORD_OMISSION' : 'CONTENT_WORD_OMISSION';

      const quality = computeMiscueQuality(pair.expected, '', 'omission');
      miscues.push({
        id: uuidv4(), subtype, primaryType: 'omission',
        expectedWord: pair.expected, spokenWord: '',
        position: pair.position, weight: ERROR_WEIGHTS[subtype],
        ...quality, timestampMs: now,
      });
    }

    if (pair.op === 'INSERT') {
      const w = pair.spoken;
      const isArticle = ARTICLES.has(w);
      const isFiller = FILLER_WORDS.has(w);
      const subtype: MiscueSubtype = isArticle ? 'ARTICLE_INSERTION'
        : isFiller ? 'FILLER_INSERTION'
        : 'WORD_INVENTION';
      const quality = computeMiscueQuality('', w, 'insertion');
      miscues.push({
        id: uuidv4(), subtype, primaryType: 'insertion',
        expectedWord: '', spokenWord: w,
        position: pair.position, weight: ERROR_WEIGHTS[subtype],
        ...quality, timestampMs: now,
      });
    }

    if (pair.op === 'SUBSTITUTE') {
      const dist = levenshtein(pair.expected, pair.spoken);
      let primaryType: MiscuePrimaryType;
      let subtype: MiscueSubtype;

      if (dist <= 2 && dist > 0) {
        primaryType = 'mispronunciation';
        subtype = classifyMispronunciation(pair.expected, pair.spoken);
        const eP = getPhonemeProfile(pair.expected);
        phonemeErrors.push({
          expectedPhoneme: eP.initial,
          spokenPhoneme: getPhonemeProfile(pair.spoken).initial,
          word: pair.expected,
          position: pair.position,
        });
      } else {
        primaryType = 'substitution';
        subtype = classifySubstitution(pair.expected, pair.spoken);
      }

      const quality = computeMiscueQuality(pair.expected, pair.spoken, primaryType);
      miscues.push({
        id: uuidv4(), subtype, primaryType,
        expectedWord: pair.expected, spokenWord: pair.spoken,
        position: pair.position, weight: ERROR_WEIGHTS[subtype],
        ...quality, timestampMs: now,
      });
    }
  }

  // Detect reversals
  for (let i = 0; i < alignedPairs.length - 1; i++) {
    const a = alignedPairs[i];
    const b = alignedPairs[i + 1];
    if (!a || !b) continue;
    if (
      a.op !== 'OMIT' && b.op !== 'OMIT' &&
      a.expected && b.expected &&
      a.spoken === b.expected && b.spoken === a.expected
    ) {
      miscues.push({
        id: uuidv4(), subtype: 'REVERSAL', primaryType: 'reversal',
        expectedWord: `${a.expected} ${b.expected}`,
        spokenWord: `${b.expected} ${a.expected}`,
        position: a.position, weight: ERROR_WEIGHTS.REVERSAL,
        syntacticAcceptable: 'no', semanticAcceptable: 'partial', meaningChanged: true,
        timestampMs: now,
      });
    }
  }

  // Weighted accuracy
  const totalWords = expected.length;
  const totalWeight = miscues
    .filter(m => m.subtype !== 'DIALECT_VARIANT')
    .reduce((sum, m) => sum + Math.max(0, m.weight), 0);
  const weightedAccuracy = totalWords > 0
    ? Math.max(0, ((totalWords - totalWeight) / totalWords) * 100)
    : 100;

  return {
    miscues,
    weightedAccuracy: Math.round(weightedAccuracy * 10) / 10,
    selfCorrections,
    phonemeErrors,
    alignedPairs,
  };
}

// ─── Betts Criteria ──────────────────────────────────────────────────────────

export function getBettsCriteria(weightedAccuracy: number): BettsCriteria {
  if (weightedAccuracy >= 98) return 'independent';
  if (weightedAccuracy >= 95) return 'instructional';
  if (weightedAccuracy >= 90) return 'frustration-borderline';
  return 'frustration';
}

// ─── Pattern Meta ────────────────────────────────────────────────────────────

const PATTERN_META: Record<ReadingPatternId, {
  label: string; description: string; recommendation: string; severity: PatternSeverity
}> = {
  'word-by-word': {
    label: 'Word-by-Word Reader',
    description: 'Student reads one word at a time with frequent pauses between words.',
    recommendation: "Use repeated reading, reader's theatre, and echo reading to build automaticity.",
    severity: 'concern',
  },
  'speed-accuracy-tradeoff': {
    label: 'Speed-Accuracy Trade-off',
    description: 'Student reads faster than grade level but sacrifices accuracy.',
    recommendation: 'Use "read it right" activities and phrased reading with expression focus.',
    severity: 'watch',
  },
  'avoidant-reader': {
    label: 'Avoidant Reader',
    description: 'Frequent long pauses and sentence restarts suggest anxiety or low confidence.',
    recommendation: 'Build confidence with high-success-rate texts. Use partner reading and positive reinforcement.',
    severity: 'high',
  },
  'meaning-seeker': {
    label: 'Meaning-Seeker',
    description: 'Most errors preserve meaning — student reads for comprehension but may need phonics support.',
    recommendation: 'Maintain comprehension focus but add targeted phonics instruction for decoding accuracy.',
    severity: 'watch',
  },
  'decoder-no-meaning': {
    label: 'Decoder Without Meaning',
    description: "Student decodes accurately but errors don't preserve meaning — may lack comprehension strategies.",
    recommendation: 'Add explicit comprehension strategies: predicting, visualizing, questioning.',
    severity: 'concern',
  },
  'self-monitor': {
    label: 'Active Self-Monitor',
    description: 'High self-correction rate shows excellent metacognitive reading awareness.',
    recommendation: 'Reinforce this positive behavior. Challenge with slightly harder texts.',
    severity: 'positive',
  },
  'sight-word-guesser': {
    label: 'Sight-Word Guesser',
    description: 'High insertion rate with visual substitutions suggests guessing from initial letters.',
    recommendation: 'Systematic phonics instruction: teach reading through whole words.',
    severity: 'concern',
  },
  'phrase-chunker': {
    label: 'Phrase Chunker',
    description: 'Strong phrasing and expression indicate excellent reading fluency.',
    recommendation: 'Consider leveling up to more challenging texts. Use for peer modeling.',
    severity: 'positive',
  },
  'fatigue-pattern': {
    label: 'Fatigue / Stamina Issue',
    description: 'Accuracy or WPM drops significantly in the second half of the session.',
    recommendation: 'Shorten sessions, build stamina gradually. Check for vision or attention issues.',
    severity: 'watch',
  },
  'consonant-blend-struggler': {
    label: 'Consonant Blend Difficulty',
    description: 'Consistent errors on words with consonant blends (bl, cr, str, etc.).',
    recommendation: 'Targeted phonics: blend and digraph instruction with word sorting activities.',
    severity: 'concern',
  },
};

export interface PatternDetectionInput {
  interWordGapMean: number;
  longestFluencyRun: number;
  wpm: number;
  grade: number;
  accuracy: number;
  pauseMap: PauseInfo[];
  wordCount: number;
  miscues: Miscue[];
  selfCorrectionCount: number;
  prosodyScore: number;
  accuracyFirstHalf: number;
  accuracySecondHalf: number;
}

export function detectReadingPatterns(input: PatternDetectionInput): PatternResult[] {
  const {
    interWordGapMean, longestFluencyRun, wpm, grade, accuracy,
    pauseMap, wordCount, miscues, selfCorrectionCount,
    prosodyScore, accuracyFirstHalf, accuracySecondHalf,
  } = input;

  const patterns: PatternResult[] = [];
  const benchmark = getGradeBenchmark(grade);
  const wpmRatio = benchmark.proficient > 0 ? wpm / benchmark.proficient : 0;
  const pauseFrequency = wordCount > 0 ? (pauseMap.length / wordCount) * 100 : 0;
  const breakdownPauses = pauseMap.filter(p => p.type === 'breakdown').length;

  const semanticMiscues = miscues.filter(m => m.semanticAcceptable !== 'no');
  const semanticRatio = miscues.length > 0 ? semanticMiscues.length / miscues.length : 0;
  const insertions = miscues.filter(m => m.primaryType === 'insertion').length;
  const visualSubs = miscues.filter(m => m.subtype === 'VISUAL_SUBSTITUTION').length;
  const totalScoredErrors = miscues.filter(m => m.weight > 0).length;
  const selfCorrectionRate = (totalScoredErrors + selfCorrectionCount) > 0
    ? selfCorrectionCount / (totalScoredErrors + selfCorrectionCount) : 0;
  const blendErrors = miscues.filter(m =>
    m.subtype === 'CONSONANT_BLEND_ERROR' || m.subtype === 'DIGRAPH_ERROR',
  ).length;

  const add = (id: ReadingPatternId) => patterns.push({ id, ...PATTERN_META[id] });

  if (interWordGapMean > 400 && longestFluencyRun < 4) add('word-by-word');
  if (wpmRatio > 1.2 && accuracy < 85) add('speed-accuracy-tradeoff');
  if (breakdownPauses >= 3) add('avoidant-reader');
  if (miscues.length >= 3 && semanticRatio > 0.7) add('meaning-seeker');
  if (miscues.length >= 3 && semanticRatio < 0.3) add('decoder-no-meaning');
  if (selfCorrectionRate > 0.25) add('self-monitor');
  if (insertions > 2 && visualSubs > 2) add('sight-word-guesser');
  if (prosodyScore > 75 && longestFluencyRun > 6) add('phrase-chunker');
  if (accuracyFirstHalf - accuracySecondHalf > 15) add('fatigue-pattern');
  if (wordCount > 0 && blendErrors / wordCount > 0.2) add('consonant-blend-struggler');

  return patterns;
}

export function computeLongestFluencyRun(pauseMap: PauseInfo[], wordCount: number): number {
  if (wordCount === 0) return 0;
  const longPauses = pauseMap.filter(p => p.duration > 400).length;
  if (longPauses === 0) return wordCount;
  return Math.max(1, Math.floor(wordCount / (longPauses + 1)));
}

export function extractPhonemeTargets(phonemeErrors: PhonemeError[]): string[] {
  const targets = new Set<string>();
  phonemeErrors.forEach(e => {
    if (e.expectedPhoneme && e.expectedPhoneme.length >= 1) targets.add(e.expectedPhoneme);
  });
  return Array.from(targets).filter(Boolean);
}
