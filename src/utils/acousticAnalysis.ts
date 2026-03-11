// ReadStar — Acoustic Signal Analysis
// Pause detection, speech rate metrics, volume analysis from PCM samples.

import { countSyllablesInText, getGradeBenchmark } from './phonetics';

export interface PauseInfo {
  startMs: number;
  endMs: number;
  duration: number;
  type: 'micro' | 'hesitation' | 'extended' | 'breakdown';
  precedingWord: string;
  followingWord: string;
  sentencePosition: 'beginning' | 'middle' | 'end';
}

export interface SpeechRateMetrics {
  articulationRate: number;   // words/min excluding pauses
  speechRate: number;         // words/min overall
  phonationRatio: number;     // 0-1
  syllableRate: number;       // syllables/sec during active speech
  interWordGapMean: number;   // ms
  interWordGapSD: number;     // ms
}

export interface VolumeMetrics {
  meanRMS: number;
  volumeSD: number;
  trailingOffDetected: boolean;
  mumblingWordCount: number;
  shoutingCount: number;
  normalizedMean: number;     // 0-100
}

export function calculateRMS(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce((acc, s) => acc + s * s, 0);
  return Math.sqrt(sum / samples.length);
}

export function detectPauses(
  samples: number[],
  sampleRate: number,
  words: string[],
  durationMs: number,
): PauseInfo[] {
  if (samples.length === 0 || durationMs === 0) return [];

  const windowMs = 50;
  const windowSamples = Math.floor((sampleRate * windowMs) / 1000);
  if (windowSamples === 0) return [];

  const silenceThreshold = 0.015;
  const pauses: PauseInfo[] = [];
  const rmsWindows: number[] = [];

  for (let i = 0; i < samples.length; i += windowSamples) {
    rmsWindows.push(calculateRMS(samples.slice(i, i + windowSamples)));
  }

  let silenceStart = -1;
  let consecutiveSilence = 0;

  for (let w = 0; w < rmsWindows.length; w++) {
    const timeMs = w * windowMs;
    if (rmsWindows[w] < silenceThreshold) {
      if (silenceStart < 0) silenceStart = timeMs;
      consecutiveSilence++;
    } else {
      if (consecutiveSilence >= 3 && silenceStart >= 0) {
        const endMs = timeMs;
        const duration = endMs - silenceStart;
        let type: PauseInfo['type'];
        if (duration >= 2000) type = 'breakdown';
        else if (duration >= 800) type = 'extended';
        else if (duration >= 400) type = 'hesitation';
        else type = 'micro';

        const ratio = silenceStart / durationMs;
        const sentencePosition: PauseInfo['sentencePosition'] =
          ratio < 0.2 ? 'beginning' : ratio > 0.8 ? 'end' : 'middle';

        const wordIdx = Math.floor(ratio * words.length);
        const precedingWord = wordIdx > 0 ? (words[wordIdx - 1] ?? '') : '';
        const followingWord = wordIdx < words.length ? (words[wordIdx] ?? '') : '';

        pauses.push({ startMs: silenceStart, endMs, duration, type, precedingWord, followingWord, sentencePosition });
      }
      silenceStart = -1;
      consecutiveSilence = 0;
    }
  }
  return pauses;
}

export function computeSpeechRateMetrics(
  wordCount: number,
  durationSec: number,
  pauseMap: PauseInfo[],
  transcript: string,
): SpeechRateMetrics {
  const totalPauseSec = pauseMap.reduce((sum, p) => sum + p.duration, 0) / 1000;
  const activeSec = Math.max(durationSec - totalPauseSec, 0.1);
  const phonationRatio = durationSec > 0 ? activeSec / durationSec : 1;

  const speechRate = durationSec > 0 ? (wordCount / durationSec) * 60 : 0;
  const articulationRate = activeSec > 0 ? (wordCount / activeSec) * 60 : 0;

  const syllableCount = countSyllablesInText(transcript);
  const syllableRate = activeSec > 0 ? syllableCount / activeSec : 0;

  const interWordGapMean = wordCount > 1
    ? (totalPauseSec * 1000) / Math.max(wordCount - 1, 1)
    : 0;
  const interWordGapSD = pauseMap.length > 1
    ? Math.sqrt(
        pauseMap.reduce((sum, p) => sum + Math.pow(p.duration - interWordGapMean, 2), 0) / pauseMap.length,
      )
    : 0;

  return {
    articulationRate: Math.round(articulationRate),
    speechRate: Math.round(speechRate),
    phonationRatio: Math.round(phonationRatio * 100) / 100,
    syllableRate: Math.round(syllableRate * 10) / 10,
    interWordGapMean: Math.round(interWordGapMean),
    interWordGapSD: Math.round(interWordGapSD),
  };
}

export function computeVolumeMetrics(samples: number[]): VolumeMetrics {
  if (samples.length === 0) {
    return { meanRMS: 0, volumeSD: 0, trailingOffDetected: false, mumblingWordCount: 0, shoutingCount: 0, normalizedMean: 0 };
  }

  const windowSize = 100;
  const rmsValues: number[] = [];
  for (let i = 0; i < samples.length; i += windowSize) {
    rmsValues.push(calculateRMS(samples.slice(i, i + windowSize)));
  }

  const meanRMS = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  const volumeSD = Math.sqrt(
    rmsValues.reduce((sum, v) => sum + Math.pow(v - meanRMS, 2), 0) / rmsValues.length,
  );

  const lastChunk = samples.slice(Math.floor(samples.length * 0.8));
  const lastRMS = calculateRMS(lastChunk);
  const trailingOffDetected = meanRMS > 0.01 && lastRMS < meanRMS * 0.6;

  let mumblingWordCount = 0;
  let shoutingCount = 0;
  for (const v of rmsValues) {
    if (meanRMS > 0.01 && v < meanRMS * 0.3) mumblingWordCount++;
    if (v > meanRMS * 2.0) shoutingCount++;
  }

  const normalizedMean = Math.min(100, Math.round(meanRMS * 1000));

  return { meanRMS, volumeSD, trailingOffDetected, mumblingWordCount, shoutingCount, normalizedMean };
}

export interface ProsodyScoreBreakdown {
  expression: number;
  phrasing: number;
  smoothness: number;
  pace: number;
  composite: number;
}

export function computeProsodyScore(
  volumeMetrics: VolumeMetrics,
  pauseMap: PauseInfo[],
  wpm: number,
  grade: number,
  expectedText: string,
): ProsodyScoreBreakdown {
  const benchmark = getGradeBenchmark(grade);

  // Expression: SD/mean ratio — higher = more expressive
  const expressionRatio = volumeMetrics.meanRMS > 0
    ? volumeMetrics.volumeSD / volumeMetrics.meanRMS
    : 0;
  const expression = Math.min(100, Math.round(expressionRatio * 400));

  // Phrasing: appropriate pauses relative to punctuation marks
  const punctuations = (expectedText.match(/[,;:.!?]/g) ?? []).length;
  const nonBreakdownPauses = pauseMap.filter(p => p.type !== 'breakdown').length;
  const phrasing = punctuations > 0
    ? Math.min(100, Math.round((nonBreakdownPauses / (punctuations + 1)) * 80))
    : 65;

  // Smoothness: inverse of long-pause density
  const longPauses = pauseMap.filter(p => p.duration > 400).length;
  const wordCount = expectedText.split(/\s+/).filter(Boolean).length;
  const pausePerWord = wordCount > 0 ? longPauses / wordCount : 0;
  const smoothness = Math.max(0, Math.round((1 - pausePerWord * 3) * 100));

  // Pace: WPM vs grade benchmark
  const targetWPM = benchmark.proficient;
  const paceRatio = targetWPM > 0 ? wpm / targetWPM : 0;
  let pace: number;
  if (paceRatio >= 0.8 && paceRatio <= 1.2) pace = 100;
  else if (paceRatio < 0.8) pace = Math.round(paceRatio * 125);
  else pace = Math.max(0, Math.round((2 - paceRatio) * 100));

  const composite = Math.round(
    expression * 0.25 + phrasing * 0.35 + smoothness * 0.25 + pace * 0.15,
  );

  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return {
    expression: clamp(expression),
    phrasing: clamp(phrasing),
    smoothness: clamp(smoothness),
    pace: clamp(pace),
    composite: clamp(composite),
  };
}

export function assignNAEPFluencyLevel(
  prosodyComposite: number,
  wpmRatio: number,
  pauseFrequency: number,  // pauses per 100 words
  longestFluencyRun: number,
): 1 | 2 | 3 | 4 {
  if (prosodyComposite >= 75 && wpmRatio >= 0.85 && pauseFrequency < 5) return 4;
  if (prosodyComposite >= 55 && wpmRatio >= 0.70 && pauseFrequency < 10) return 3;
  if (prosodyComposite >= 35 && wpmRatio >= 0.50) return 2;
  return 1;
}

// Downsample PCM samples to a manageable array for storage
export function downsampleWaveform(samples: number[], targetLength = 300): number[] {
  if (samples.length === 0) return [];
  if (samples.length <= targetLength) return Array.from(samples);
  const step = samples.length / targetLength;
  const result: number[] = [];
  for (let i = 0; i < targetLength; i++) {
    const idx = Math.floor(i * step);
    result.push(samples[idx] ?? 0);
  }
  return result;
}
