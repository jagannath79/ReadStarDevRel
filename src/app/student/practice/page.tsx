'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useRecording } from '@/hooks/useRecording';
import { useSpeechRecognition, speakText } from '@/hooks/useSpeechRecognition';
import {
  getSentencesByDifficulty, createSession, updateSession, saveRecording, addSentence,
  computeAndUpdateAnalytics, updateUser, getUserById,
  upsertPhonemeStats, upsertWordStats,
  type Sentence, type Session, type SentenceScore,
} from '@/db/indexeddb';
import { buildSentenceScore, computeSessionScore, computeStarsEarned, getEncouragementMessage } from '@/utils/scoring';
import {
  detectPauses, computeSpeechRateMetrics, computeVolumeMetrics,
  computeProsodyScore, assignNAEPFluencyLevel, downsampleWaveform,
} from '@/utils/acousticAnalysis';
import {
  runFullMiscueAnalysis, getBettsCriteria, detectReadingPatterns,
  computeLongestFluencyRun,
  type Miscue, type PatternResult, type BettsCriteria,
} from '@/utils/diagnostics';
import { getGradeBenchmark, phoneticallySimilar, visuallySimilar } from '@/utils/phonetics';
import type { PauseInfo, ProsodyScoreBreakdown, SpeechRateMetrics } from '@/utils/acousticAnalysis';
import BettsLevelBadge from '@/components/analysis/BettsLevelBadge';
import { FluencyLevelInline } from '@/components/analysis/FluencyLevelGauge';
import { PatternBadgeList } from '@/components/analysis/PatternBadge';
import ProsodyRadar from '@/components/analysis/ProsodyRadar';
import TranscriptAnnotator from '@/components/analysis/TranscriptAnnotator';
import WaveformPlayer from '@/components/analysis/WaveformPlayer';
import { v4 as uuidv4 } from 'uuid';
import { Mic, MicOff, Pause, Play, RefreshCw, Volume2, ChevronRight, Star, Check, ChevronDown, ChevronUp, Brain, Ear, Target, Sparkles } from 'lucide-react';

type Step = 'select' | 'custom-input' | 'reading' | 'sentence-review' | 'summary' | 'phonics-lab';
type Difficulty = 'simple' | 'medium' | 'complex';

const PHONICS_PATHWAYS = [
  {
    id: 'short-vowels',
    title: 'Short Vowel Builder',
    focus: 'Build automaticity with CVC words and short-vowel sound contrasts.',
    words: ['cat', 'bed', 'pig', 'hot', 'sun', 'lap', 'ten', 'sip'],
    sounds: ['/a/', '/e/', '/i/', '/o/', '/u/'],
  },
  {
    id: 'digraphs',
    title: 'Digraph Detective',
    focus: 'Practice common two-letter sound teams that often confuse learners.',
    words: ['ship', 'thin', 'whale', 'phone', 'chin', 'graph', 'thumb', 'shell'],
    sounds: ['/sh/', '/th/', '/wh/', '/ph/', '/ch/'],
  },
  {
    id: 'blends',
    title: 'Consonant Blend Sprint',
    focus: 'Strengthen segmenting and blending for initial and final consonant clusters.',
    words: ['frog', 'slide', 'black', 'train', 'stamp', 'plant', 'glad', 'crisp'],
    sounds: ['/fr/', '/sl/', '/bl/', '/tr/', '/st/', '/pl/', '/gl/', '/cr/'],
  },
] as const;

// Per-sentence extended analysis results (held in state between review and finishSession)
interface SentenceAnalysis {
  miscues: Miscue[];
  weightedAccuracy: number;
  betts: BettsCriteria;
  patterns: PatternResult[];
  prosodyScore: ProsodyScoreBreakdown | null;
  speechRateMetrics: SpeechRateMetrics | null;
  pauseMap: PauseInfo[];
  waveformSamples: number[];
  fluencyLevel: 1 | 2 | 3 | 4;
  selfCorrectionCount: number;
  phonemeErrors: { expectedPhoneme: string; word: string }[];
}

const DIFF_CONFIG = {
  simple:  { label: 'Simple',  emoji: '🌱', color: 'from-emerald-400 to-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', textColor: 'text-emerald-700',  badge: 'bg-emerald-100 text-emerald-700', stars: '⭐⭐',     desc: 'Short sentences, everyday words — perfect for warming up!',          grade: 'Grades 3–4' },
  medium:  { label: 'Medium',  emoji: '📘', color: 'from-amber-400 to-amber-600',    bg: 'bg-amber-50',    border: 'border-amber-200',   textColor: 'text-amber-700',    badge: 'bg-amber-100 text-amber-700',   stars: '⭐⭐⭐',   desc: 'Longer sentences with interesting topics — a good challenge!',       grade: 'Grades 4–5' },
  complex: { label: 'Complex', emoji: '🔬', color: 'from-red-400 to-red-600',        bg: 'bg-red-50',      border: 'border-red-200',     textColor: 'text-red-700',      badge: 'bg-red-100 text-red-700',       stars: '⭐⭐⭐⭐⭐', desc: 'Complex sentences with advanced vocabulary — for expert readers!', grade: 'Grades 5+' },
};

// ─── Waveform bars (live recording) ──────────────────────────────────────────
function LiveWaveform({ active, volume = 0 }: { active: boolean; volume?: number }) {
  return (
    <div className="flex items-center gap-1 h-8">
      {[...Array(7)].map((_, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-full transition-all ${active ? 'bg-red-500 waveform-bar' : 'bg-gray-300'}`}
          style={{ height: active ? `${Math.max(30, volume * 100 * (0.5 + (i % 3) * 0.2))}%` : '30%' }}
        />
      ))}
    </div>
  );
}

// ─── Word Highlighter ─────────────────────────────────────────────────────────
function HighlightedSentence({ sentence, transcript, interimTranscript, lang = 'en-US' }: {
  sentence: string; transcript: string; interimTranscript: string; lang?: string;
}) {
  const expectedWords = sentence.trim().split(/\s+/);
  const spokenWords = (transcript + ' ' + interimTranscript).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
  let spokenIdx = 0;
  return (
    <div className="text-3xl md:text-4xl leading-relaxed text-center font-display tracking-wide" style={{ fontFamily: 'Fraunces, serif' }}>
      {expectedWords.map((word, i) => {
        const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSpoken = spokenIdx < spokenWords.length && spokenWords[spokenIdx] === cleanWord;
        const isNext = spokenIdx === spokenWords.length && i === spokenWords.length;
        if (isSpoken) spokenIdx++;
        return (
          <button key={i} type="button" onClick={() => speakText(cleanWord, lang)}
            title="Click to hear pronunciation"
            className={`inline-block mx-1 transition-all duration-200 cursor-pointer hover:opacity-70 focus:outline-none rounded ${isSpoken ? 'word-correct scale-105' : isNext ? 'word-highlight' : 'text-gray-800'}`}>
            {word}
          </button>
        );
      })}
    </div>
  );
}

// ─── Score Circle ─────────────────────────────────────────────────────────────
function ScoreCircle({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size / 2) - 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 85 ? '#22A06B' : score >= 70 ? '#1B3A8C' : score >= 50 ? '#F5A623' : '#EF4444';
  return (
    <div className="relative inline-flex items-center justify-center count-up" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold" style={{ color }}>{Math.round(score)}</div>
        <div className="text-xs text-gray-400">score</div>
      </div>
    </div>
  );
}

// ─── Main Practice Component ──────────────────────────────────────────────────
export default function PracticePage() {
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('select');
  const [difficulty, setDifficulty] = useState<Difficulty>('simple');
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionId, setSessionId] = useState('');
  const [scores, setScores] = useState<SentenceScore[]>([]);
  const [sentenceAnalyses, setSentenceAnalyses] = useState<SentenceAnalysis[]>([]);
  const [sessionData, setSessionData] = useState<Session | null>(null);
  const [currentScore, setCurrentScore] = useState<SentenceScore | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<SentenceAnalysis | null>(null);
  const [isRecorded, setIsRecorded] = useState(false);
  const [loadingStart, setLoadingStart] = useState(false);
  const [error, setError] = useState('');
  const [customText, setCustomText] = useState('');
  const [isCustomSession, setIsCustomSession] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [phonicsQuery, setPhonicsQuery] = useState('');
  const [phonicsAttempt, setPhonicsAttempt] = useState('');

  const recording = useRecording();
  const speech = useSpeechRecognition(user?.language || 'en-US');

  const currentSentence = sentences[currentIdx];
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Start Session ────────────────────────────────────────────────────────────
  const startSession = useCallback(async (diff: Difficulty) => {
    if (!user) return;
    setLoadingStart(true);
    setError('');
    try {
      const allSents = await getSentencesByDifficulty(diff);
      if (allSents.length === 0) {
        setError('No sentences found for this difficulty. Please contact your teacher.');
        setLoadingStart(false);
        return;
      }
      const shuffled = [...allSents].sort(() => Math.random() - 0.5).slice(0, Math.min(5, allSents.length));
      const id = uuidv4();
      const session: Session = {
        id, studentId: user.id, difficulty: diff,
        startedAt: Date.now(), sentences: shuffled.map(s => s.id),
        scores: [], overallScore: 0, averageAccuracy: 0, averageWPM: 0,
        totalWordsRead: 0, starsEarned: 0, issues: [], completed: false,
      };
      await createSession(session);
      setSentences(shuffled);
      setSessionId(id);
      setSessionData(session);
      setCurrentIdx(0);
      setScores([]);
      setSentenceAnalyses([]);
      setIsRecorded(false);
      setCurrentScore(null);
      setCurrentAnalysis(null);
      setDifficulty(diff);
      setStep('reading');
    } catch {
      setError('Failed to start session. Please try again.');
    } finally {
      setLoadingStart(false);
    }
  }, [user]);

  // ── Start Custom Session ──────────────────────────────────────────────────────
  const startCustomSession = useCallback(async (text: string) => {
    if (!user) return;
    setLoadingStart(true);
    setError('');
    try {
      const rawSentences = text.trim()
        .split(/(?<=[.!?])\s+|\n+/)
        .map(s => s.trim())
        .filter(s => s.split(/\s+/).length >= 2);

      if (rawSentences.length === 0) {
        setError('No valid sentences found. Each sentence needs at least 2 words.');
        setLoadingStart(false);
        return;
      }

      const tempSentences: Sentence[] = rawSentences.slice(0, 10).map(t => ({
        id: uuidv4(),
        text: /[.!?]$/.test(t) ? t : t + '.',
        difficulty: 'medium' as const,
        topic: 'custom',
        gradeTarget: 4,
        wordCount: t.split(/\s+/).length,
        createdAt: Date.now(),
      }));

      await Promise.all(tempSentences.map(s => addSentence(s)));

      const id = uuidv4();
      const session: Session = {
        id, studentId: user.id, difficulty: 'medium',
        startedAt: Date.now(), sentences: tempSentences.map(s => s.id),
        scores: [], overallScore: 0, averageAccuracy: 0, averageWPM: 0,
        totalWordsRead: 0, starsEarned: 0, issues: [], completed: false,
      };
      await createSession(session);
      setSentences(tempSentences);
      setSessionId(id);
      setSessionData(session);
      setCurrentIdx(0);
      setScores([]);
      setSentenceAnalyses([]);
      setIsRecorded(false);
      setCurrentScore(null);
      setCurrentAnalysis(null);
      setDifficulty('medium');
      setIsCustomSession(true);
      setStep('reading');
    } catch {
      setError('Failed to start session. Please try again.');
    } finally {
      setLoadingStart(false);
    }
  }, [user]);

  // ── Stop & Analyze ────────────────────────────────────────────────────────────
  const stopAndAnalyze = useCallback(async () => {
    if (!user || !currentSentence || !sessionId) return;
    recording.stopRecording();
    speech.stopListening();

    // Poll blob ref (avoids React batching delay)
    const blob = await new Promise<Blob | null>((resolve) => {
      let tries = 0;
      const poll = () => {
        if (recording.blobRef.current) resolve(recording.blobRef.current);
        else if (tries++ < 25) setTimeout(poll, 60);
        else resolve(null);
      };
      setTimeout(poll, 120);
    });

    const transcript = speech.transcript || '';
    const duration = Math.max(recording.duration, 0.5);
    const durationMs = duration * 1000;
    const grade = user.grade ?? 4;

    // ── Build basic score ────────────────────────────────────────────────────
    const { score } = buildSentenceScore(
      currentSentence.id, currentSentence.text, transcript,
      duration, difficulty, user.id, sessionId,
    );

    // ── Acoustic analysis ────────────────────────────────────────────────────
    const pcmSamples = Array.from(recording.getPCMSamples());
    const sampleRate = 44100;
    const words = currentSentence.text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    const pauseMap = detectPauses(pcmSamples, sampleRate, words, durationMs);
    const speechRateMetrics = computeSpeechRateMetrics(wordCount, duration, pauseMap, transcript);
    const volumeMetrics = computeVolumeMetrics(pcmSamples);
    const prosodyScore = computeProsodyScore(volumeMetrics, pauseMap, score.wpm, grade, currentSentence.text);
    const longestRun = computeLongestFluencyRun(pauseMap, wordCount);
    const wpmBenchmark = getGradeBenchmark(grade).proficient;
    const wpmRatio = wpmBenchmark > 0 ? score.wpm / wpmBenchmark : 0;
    const pauseFreq = wordCount > 0 ? (pauseMap.length / wordCount) * 100 : 0;
    const fluencyLevel = assignNAEPFluencyLevel(prosodyScore.composite, wpmRatio, pauseFreq, longestRun);

    // ── Linguistic analysis ───────────────────────────────────────────────────
    const { miscues, weightedAccuracy, selfCorrections, phonemeErrors, alignedPairs } =
      runFullMiscueAnalysis(currentSentence.text, transcript);
    const betts = getBettsCriteria(weightedAccuracy);

    // Rough half-accuracy (first/second half of expected words)
    const halfIdx = Math.floor(words.length / 2);
    const firstHalfMiscues = miscues.filter(m => m.position < halfIdx).reduce((s, m) => s + Math.max(0, m.weight), 0);
    const secondHalfMiscues = miscues.filter(m => m.position >= halfIdx).reduce((s, m) => s + Math.max(0, m.weight), 0);
    const accuracyFirstHalf = halfIdx > 0 ? Math.max(0, ((halfIdx - firstHalfMiscues) / halfIdx) * 100) : score.accuracyScore;
    const accuracySecondHalf = (words.length - halfIdx) > 0 ? Math.max(0, (((words.length - halfIdx) - secondHalfMiscues) / (words.length - halfIdx)) * 100) : score.accuracyScore;

    // ── Pattern detection ─────────────────────────────────────────────────────
    const patterns = detectReadingPatterns({
      interWordGapMean: speechRateMetrics.interWordGapMean,
      longestFluencyRun: longestRun,
      wpm: score.wpm,
      grade,
      accuracy: score.accuracyScore,
      pauseMap,
      wordCount,
      miscues,
      selfCorrectionCount: selfCorrections.length,
      prosodyScore: prosodyScore.composite,
      accuracyFirstHalf,
      accuracySecondHalf,
    });

    // ── Waveform samples ──────────────────────────────────────────────────────
    const waveformSamples = recording.waveformSamples.length > 0
      ? recording.waveformSamples
      : downsampleWaveform(pcmSamples, 300);

    // ── Build extended score ──────────────────────────────────────────────────
    const extendedScore: SentenceScore = {
      ...score,
      miscues,
      wordTimings: speech.wordTimings,
      selfCorrections,
      phonemeErrors,
      bettsCriteria: betts,
      weightedAccuracy,
      prosodyScore,
      fluencyLevel,
      waveformSamples,
      pauseMap,
    };

    // ── Save recording with full diagnostics ──────────────────────────────────
    if (blob) {
      await saveRecording({
        id: uuidv4(),
        studentId: user.id,
        sessionId,
        sentenceId: currentSentence.id,
        audioBlob: blob,
        transcript,
        duration,
        createdAt: Date.now(),
        miscues,
        wordTimings: speech.wordTimings,
        selfCorrections,
        phonemeErrors,
        bettsCriteria: betts,
        weightedAccuracy,
        waveformSamples,
        pauseMap,
        speechRateMetrics,
        volumeMetrics,
        prosodyScore,
        fluencyLevel,
      });
    }

    // ── Update phoneme & word stats ───────────────────────────────────────────
    try {
      // Word stats: count each expected word as encountered
      const wordErrorTypes: Map<string, string> = new Map();
      for (const m of miscues) {
        if (m.expectedWord) wordErrorTypes.set(m.expectedWord, m.subtype);
      }
      const wordUpdatePromises = words.map(async (w) => {
        const errorType = wordErrorTypes.get(w.toLowerCase().replace(/[^a-z]/g, ''));
        const hasError = !!errorType;
        await upsertWordStats(user.id, w.toLowerCase().replace(/[^a-z]/g, ''), 1, hasError ? 1 : 0, errorType);
      });

      // Phoneme stats
      const phonemeMap = new Map<string, { encountered: number; errors: number }>();
      for (const pe of phonemeErrors) {
        const key = pe.expectedPhoneme;
        if (!key) continue;
        const existing = phonemeMap.get(key) ?? { encountered: 0, errors: 0 };
        phonemeMap.set(key, { encountered: existing.encountered + 1, errors: existing.errors + 1 });
      }
      const phonemeUpdatePromises = Array.from(phonemeMap.entries()).map(([phoneme, { encountered, errors }]) =>
        upsertPhonemeStats(user.id, phoneme, encountered, errors),
      );

      await Promise.all([...wordUpdatePromises, ...phonemeUpdatePromises]);
    } catch {
      // Non-critical: stats update failed, continue
    }

    const analysis: SentenceAnalysis = {
      miscues,
      weightedAccuracy,
      betts,
      patterns,
      prosodyScore,
      speechRateMetrics,
      pauseMap,
      waveformSamples,
      fluencyLevel,
      selfCorrectionCount: selfCorrections.length,
      phonemeErrors,
    };

    setCurrentScore(extendedScore);
    setCurrentAnalysis(analysis);
    setIsRecorded(true);
    setShowAdvanced(false);
    setStep('sentence-review');
  }, [user, currentSentence, sessionId, recording, speech, difficulty]);

  // ── Next Sentence ────────────────────────────────────────────────────────────
  const nextSentence = useCallback(async () => {
    if (!currentScore || !sessionData) return;
    const newScores = [...scores, currentScore];
    const newAnalyses = currentAnalysis ? [...sentenceAnalyses, currentAnalysis] : sentenceAnalyses;
    setScores(newScores);
    setSentenceAnalyses(newAnalyses);

    if (currentIdx < sentences.length - 1) {
      setCurrentIdx(i => i + 1);
      setCurrentScore(null);
      setCurrentAnalysis(null);
      setIsRecorded(false);
      recording.resetRecording();
      speech.resetTranscript();
      setStep('reading');
    } else {
      await finishSession(newScores, newAnalyses);
    }
  }, [currentScore, currentAnalysis, scores, sentenceAnalyses, currentIdx, sentences, sessionData, recording, speech]);

  // ── Finish Session ────────────────────────────────────────────────────────────
  const finishSession = useCallback(async (finalScores: SentenceScore[], finalAnalyses: SentenceAnalysis[]) => {
    if (!user || !sessionData) return;
    const avgAccuracy = finalScores.reduce((a, s) => a + s.accuracyScore, 0) / Math.max(finalScores.length, 1);
    const avgWPM = finalScores.reduce((a, s) => a + s.wpm, 0) / Math.max(finalScores.length, 1);
    const overallScore = computeSessionScore(finalScores.map(s => s.fluencyScore));
    const starsEarned = computeStarsEarned(overallScore);
    const allIssues = finalScores.flatMap(s => s.issues);

    // Aggregate session-level diagnostics
    const allMiscues = finalAnalyses.flatMap(a => a.miscues);
    const avgWeightedAccuracy = finalAnalyses.length > 0
      ? finalAnalyses.reduce((s, a) => s + a.weightedAccuracy, 0) / finalAnalyses.length : avgAccuracy;
    const allPatterns = Array.from(
      new Map(finalAnalyses.flatMap(a => a.patterns).map(p => [p.id, p])).values(),
    );
    const avgProsody = finalAnalyses.length > 0
      ? {
          expression: Math.round(finalAnalyses.reduce((s, a) => s + (a.prosodyScore?.expression ?? 0), 0) / finalAnalyses.length),
          phrasing: Math.round(finalAnalyses.reduce((s, a) => s + (a.prosodyScore?.phrasing ?? 0), 0) / finalAnalyses.length),
          smoothness: Math.round(finalAnalyses.reduce((s, a) => s + (a.prosodyScore?.smoothness ?? 0), 0) / finalAnalyses.length),
          pace: Math.round(finalAnalyses.reduce((s, a) => s + (a.prosodyScore?.pace ?? 0), 0) / finalAnalyses.length),
          composite: Math.round(finalAnalyses.reduce((s, a) => s + (a.prosodyScore?.composite ?? 0), 0) / finalAnalyses.length),
        }
      : undefined;
    const sessionBetts = getBettsCriteria(avgWeightedAccuracy);
    const selfCorrectionRate = finalAnalyses.length > 0
      ? finalAnalyses.reduce((s, a) => s + a.selfCorrectionCount, 0) / Math.max(allMiscues.length + finalAnalyses.reduce((s, a) => s + a.selfCorrectionCount, 0), 1)
      : 0;

    const completed: Session = {
      ...sessionData,
      scores: finalScores,
      completedAt: Date.now(),
      overallScore,
      averageAccuracy: avgAccuracy,
      averageWPM: Math.round(avgWPM),
      totalWordsRead: sentences.reduce((a, s) => a + s.wordCount, 0),
      starsEarned,
      issues: allIssues,
      completed: true,
      // Extended fields
      prosodyScore: avgProsody,
      bettsCriteria: sessionBetts,
      detectedPatterns: allPatterns,
      weightedAccuracy: Math.round(avgWeightedAccuracy * 10) / 10,
      selfCorrectionRate: Math.round(selfCorrectionRate * 100) / 100,
    };

    await updateSession(completed);
    setSessionData(completed);

    const freshUser = await getUserById(user.id);
    if (freshUser) {
      freshUser.totalStars = (freshUser.totalStars || 0) + starsEarned;
      freshUser.lastActive = Date.now();
      await updateUser(freshUser);
    }
    await computeAndUpdateAnalytics(user.id);
    setStep('summary');
  }, [user, sessionData, sentences]);

  const reRecord = () => {
    recording.resetRecording();
    speech.resetTranscript();
    setCurrentScore(null);
    setCurrentAnalysis(null);
    setIsRecorded(false);
    setStep('reading');
  };

  const handleStartRecording = async () => {
    speech.resetTranscript();
    speech.startListening();
    await recording.startRecording();
  };


  const recommendedPathway = PHONICS_PATHWAYS.find(pathway =>
    pathway.words.some(word => word.includes(phonicsQuery.toLowerCase().trim())),
  );

  const normalizedQuery = phonicsQuery.trim().toLowerCase();
  const normalizedAttempt = phonicsAttempt.trim().toLowerCase();
  const hasPhonicsAttempt = normalizedQuery.length > 0 && normalizedAttempt.length > 0;
  const similarityInsight = !hasPhonicsAttempt
    ? null
    : phoneticallySimilar(normalizedQuery, normalizedAttempt)
      ? 'Great! Your attempt is phonetically close. Keep that mouth shape and try again for precision.'
      : visuallySimilar(normalizedQuery, normalizedAttempt)
        ? 'Close visual match, but the sound still differs. Tap each word to hear and mirror the sound slowly.'
        : 'Different sound pattern detected. Break the word into chunks and practice one chunk at a time.';

  // ─────────────────────────────────────────────────────────────────────────────
  // UI: Difficulty Selection
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'select') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 page-enter">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
            Choose Your Challenge
          </h1>
          <p className="text-gray-500">Pick a difficulty level to start your reading practice</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm text-center">{error}</div>
        )}

        <div className="space-y-4 card-stagger">
          {(['simple', 'medium', 'complex'] as Difficulty[]).map(diff => {
            const cfg = DIFF_CONFIG[diff];
            return (
              <button key={diff} onClick={() => startSession(diff)} disabled={loadingStart}
                className={`w-full text-left p-6 rounded-2xl border-2 ${cfg.border} ${cfg.bg} hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 group`}
                style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-4xl">{cfg.emoji}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 text-lg" style={{ fontFamily: 'Fraunces, serif' }}>{cfg.label}</h3>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.grade}</span>
                      </div>
                      <p className="text-gray-600 text-sm">{cfg.desc}</p>
                      <div className="mt-1 text-xs">{cfg.stars}</div>
                    </div>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${cfg.textColor} opacity-60 group-hover:translate-x-1 transition-transform`} />
                </div>
              </button>
            );
          })}

          <button onClick={() => { setCustomText(''); setStep('custom-input'); }} disabled={loadingStart}
            className="w-full text-left p-6 rounded-2xl border-2 border-purple-200 bg-purple-50 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 group"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-4xl">✏️</span>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 text-lg" style={{ fontFamily: 'Fraunces, serif' }}>Custom</h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Any Level</span>
                  </div>
                  <p className="text-gray-600 text-sm">Paste or type your own sentences to practice</p>
                  <div className="mt-1 text-xs">⭐⭐⭐</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-purple-700 opacity-60 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>


          <button onClick={() => { setPhonicsQuery(''); setPhonicsAttempt(''); setStep('phonics-lab'); }} disabled={loadingStart}
            className="w-full text-left p-6 rounded-2xl border-2 border-cyan-200 bg-cyan-50 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 group"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-4xl">🧠</span>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 text-lg" style={{ fontFamily: 'Fraunces, serif' }}>Phonics Lab</h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">Foundational</span>
                  </div>
                  <p className="text-gray-600 text-sm">Targeted sound-letter training for students who need phonics support</p>
                  <div className="mt-1 text-xs">⭐⭐⭐ Best for beginners</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-cyan-700 opacity-60 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>

        {loadingStart && (
          <div className="flex items-center justify-center gap-3 mt-8 text-gray-500">
            <div className="w-5 h-5 border-2 border-[#1B3A8C] border-t-transparent rounded-full animate-spin" />
            <span>Preparing your session...</span>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI: Custom Sentence Input
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'custom-input') {
    const parsedCount = customText.trim().split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 2).length;
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 page-enter">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Fraunces, serif' }}>✏️ Custom Practice</h1>
          <p className="text-gray-500 text-sm">Type or paste your own sentences. Separate with periods or new lines (up to 10 sentences).</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm text-center">{error}</div>}
        <div className="bg-white rounded-2xl p-6 mb-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <textarea value={customText} onChange={e => setCustomText(e.target.value)}
            placeholder={`Type or paste sentences here...\n\nExample:\nThe cat sat on the mat.\nShe reads books every day.\nThe sun rises in the east.`}
            className="w-full h-52 resize-none border border-gray-200 rounded-xl p-4 text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm leading-relaxed" />
          <p className="text-xs text-gray-400 mt-2">
            {parsedCount > 0 ? `✅ ${parsedCount} sentence${parsedCount > 1 ? 's' : ''} detected${parsedCount > 10 ? ' (first 10 will be used)' : ''}` : 'Enter at least one sentence with 2 or more words'}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setStep('select'); setError(''); }} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-all">← Back</button>
          <button onClick={() => startCustomSession(customText)} disabled={parsedCount === 0 || loadingStart}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {loadingStart ? 'Preparing…' : 'Start Practice →'}
          </button>
        </div>
      </div>
    );
  }


  if (step === 'phonics-lab') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 page-enter">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Fraunces, serif' }}>🧠 Phonics Lab</h1>
          <p className="text-gray-500">Clinically-informed sound-to-letter practice for learners building core decoding skills.</p>
        </div>

        <div className="bg-white rounded-2xl p-6 mb-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div className="rounded-xl bg-blue-50 p-4">
              <Ear className="w-5 h-5 text-blue-700 mb-2" />
              <h3 className="font-semibold text-blue-900">Hear</h3>
              <p className="text-xs text-blue-700">Tap any word to hear a model pronunciation.</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <Brain className="w-5 h-5 text-emerald-700 mb-2" />
              <h3 className="font-semibold text-emerald-900">Map</h3>
              <p className="text-xs text-emerald-700">Connect spoken sounds to spelling patterns.</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <Target className="w-5 h-5 text-amber-700 mb-2" />
              <h3 className="font-semibold text-amber-900">Practice</h3>
              <p className="text-xs text-amber-700">Repeat with immediate, supportive feedback.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3 mb-4">
            {PHONICS_PATHWAYS.map(pathway => (
              <div key={pathway.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <h3 className="font-semibold text-gray-900 mb-1">{pathway.title}</h3>
                <p className="text-xs text-gray-600 mb-2">{pathway.focus}</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {pathway.sounds.map(sound => (
                    <span key={sound} className="text-xs px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-600">{sound}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {pathway.words.slice(0, 4).map(word => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => speakText(word, user?.language || 'en-US')}
                      className="text-sm px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-700 transition-colors"
                    >
                      {word}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border border-cyan-200 bg-cyan-50 rounded-xl p-4">
            <h3 className="font-semibold text-cyan-900 mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4" />Sound Match Coach</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <input
                value={phonicsQuery}
                onChange={e => setPhonicsQuery(e.target.value)}
                placeholder="Target word (e.g., ship)"
                className="w-full border border-cyan-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
              <input
                value={phonicsAttempt}
                onChange={e => setPhonicsAttempt(e.target.value)}
                placeholder="Student attempt (e.g., sip)"
                className="w-full border border-cyan-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>
            {similarityInsight && <p className="mt-3 text-sm text-cyan-900">{similarityInsight}</p>}
            {recommendedPathway && (
              <p className="mt-2 text-xs text-cyan-800">Recommended next drill: <span className="font-semibold">{recommendedPathway.title}</span>.</p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setStep('select')} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-all">← Back</button>
          <button onClick={() => startSession('simple')} className="flex-1 py-3 rounded-xl bg-[#1B3A8C] text-white font-semibold hover:bg-blue-900 transition-all">Start Guided Reading →</button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI: Reading Interface
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'reading' && currentSentence) {
    const diffCfg = DIFF_CONFIG[difficulty];
    const isActive = recording.isRecording && !recording.isPaused;
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 page-enter">
        {/* Progress */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div className="bg-[#1B3A8C] h-2 rounded-full transition-all duration-500" style={{ width: `${(currentIdx / sentences.length) * 100}%` }} />
          </div>
          <span className="text-sm text-gray-500 font-medium whitespace-nowrap">{currentIdx + 1} of {sentences.length}</span>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isCustomSession ? 'bg-purple-100 text-purple-700' : diffCfg.badge}`}>
            {isCustomSession ? 'Custom' : diffCfg.label}
          </span>
        </div>

        {/* Sentence card */}
        <div className="bg-white rounded-2xl p-8 mb-6 text-center min-h-[180px] flex items-center justify-center relative" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="absolute top-4 right-4">
            <button onClick={() => speakText(currentSentence.text, user?.language || 'en-US')}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#1B3A8C] transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50" aria-label="Hear the sentence">
              <Volume2 className="w-4 h-4" /> Hear it
            </button>
          </div>
          <HighlightedSentence sentence={currentSentence.text} transcript={speech.transcript} interimTranscript={speech.interimTranscript} lang={user?.language || 'en-US'} />
        </div>

        {/* Interim */}
        {(speech.transcript || speech.interimTranscript) && (
          <div className="bg-blue-50 rounded-xl px-4 py-3 mb-4 text-sm text-blue-700 min-h-[40px]">
            <span className="font-medium">{speech.transcript}</span>
            <span className="opacity-60">{speech.interimTranscript}</span>
          </div>
        )}

        {(recording.error || speech.error) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm">⚠️ {recording.error || speech.error}</div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div className="h-10 flex items-center">
            {isActive ? (
              <LiveWaveform active={true} volume={recording.volumeLevel} />
            ) : (
              <div className="text-sm text-gray-400">{recording.audioBlob ? 'Recording complete' : 'Press record to start'}</div>
            )}
          </div>

          <div className="font-mono text-2xl font-bold text-gray-800">
            {fmtTime(recording.duration)}
            {recording.duration >= 50 && recording.duration < 60 && <span className="text-amber-500 text-sm ml-2">⚠️ Almost at limit</span>}
          </div>

          <div className="flex items-center gap-4">
            {recording.audioBlob && (
              <button onClick={reRecord} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-all">
                <RefreshCw className="w-4 h-4" /> Re-record
              </button>
            )}

            {!recording.isRecording ? (
              <button onClick={handleStartRecording} disabled={recording.audioBlob !== null}
                className={`w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${recording.audioBlob ? '' : 'shadow-lg'}`}
                aria-label="Start recording">
                <Mic className="w-8 h-8" />
              </button>
            ) : (
              <button onClick={stopAndAnalyze} className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center record-pulse shadow-lg" aria-label="Stop recording">
                <MicOff className="w-8 h-8" />
              </button>
            )}

            {recording.isRecording && (
              <button onClick={recording.isPaused ? recording.resumeRecording : recording.pauseRecording}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-all">
                {recording.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                {recording.isPaused ? 'Resume' : 'Pause'}
              </button>
            )}
          </div>

          {!recording.isRecording && !recording.audioBlob && <p className="text-xs text-gray-400 mt-1">Tap the microphone and read the sentence aloud</p>}

          {recording.audioBlob && !recording.isRecording && (
            <button onClick={stopAndAnalyze} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1B3A8C] text-white font-semibold hover:bg-blue-900 transition-all">
              <Check className="w-4 h-4" /> Done — See Results
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI: Sentence Review (enhanced with diagnostics)
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'sentence-review' && currentScore && currentSentence) {
    const msg = getEncouragementMessage(currentScore.fluencyScore);
    const isLast = currentIdx >= sentences.length - 1;
    const analysis = currentAnalysis;

    return (
      <div className="max-w-2xl mx-auto px-4 py-6 page-enter space-y-4">
        {/* Score + labels row */}
        <div className="text-center">
          <div className="count-up inline-block mb-3">
            <ScoreCircle score={currentScore.fluencyScore} size={140} />
          </div>
          <p className="text-lg font-medium text-gray-700 mt-1">{msg}</p>

          {/* Betts + NAEP inline */}
          {analysis && (
            <div className="flex items-center justify-center gap-3 mt-2 flex-wrap">
              <BettsLevelBadge level={analysis.betts} size="sm" showSubLabel />
              <FluencyLevelInline level={analysis.fluencyLevel} />
            </div>
          )}
        </div>

        {/* Core metrics */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <h3 className="font-bold text-gray-900 mb-3" style={{ fontFamily: 'Fraunces, serif' }}>Reading Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-[#1B3A8C]">{Math.round(currentScore.accuracyScore)}%</div>
              <div className="text-xs text-gray-500">Accuracy</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-emerald-600">{currentScore.wpm}</div>
              <div className="text-xs text-gray-500">Words/min</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-amber-600">{currentScore.duration.toFixed(1)}s</div>
              <div className="text-xs text-gray-500">Duration</div>
            </div>
            {analysis && (
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-purple-600">{Math.round(analysis.weightedAccuracy)}%</div>
                <div className="text-xs text-gray-500">Weighted Acc.</div>
              </div>
            )}
          </div>

          {/* Prosody sub-scores */}
          {analysis?.prosodyScore && (
            <div className="grid grid-cols-4 gap-2 text-center mt-2">
              {(['expression', 'phrasing', 'smoothness', 'pace'] as const).map(k => (
                <div key={k} className="bg-gray-50 rounded-lg p-2">
                  <div className="text-sm font-bold text-gray-700">{analysis.prosodyScore![k]}</div>
                  <div className="text-[10px] text-gray-400 capitalize">{k}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Annotated transcript */}
        {analysis && (
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <h3 className="font-bold text-gray-900 mb-3" style={{ fontFamily: 'Fraunces, serif' }}>Annotated Reading</h3>
            <TranscriptAnnotator
              expectedText={currentSentence.text}
              transcript={currentScore.transcript}
              miscues={analysis.miscues}
              pauseMap={analysis.pauseMap}
              showPauseMarkers
            />
          </div>
        )}

        {/* Waveform player */}
        {(recording.blobRef.current || analysis?.waveformSamples?.length) && (
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <h3 className="font-bold text-gray-900 mb-3" style={{ fontFamily: 'Fraunces, serif' }}>Audio Waveform</h3>
            <WaveformPlayer
              audioBlob={recording.blobRef.current ?? undefined}
              waveformSamples={analysis?.waveformSamples}
              pauseMap={analysis?.pauseMap}
              durationMs={currentScore.duration * 1000}
            />
          </div>
        )}

        {/* Prosody radar + pattern badges */}
        {analysis && (
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            {/* Toggle advanced */}
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Prosody & Patterns</h3>
              {showAdvanced ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {showAdvanced && analysis.prosodyScore && (
              <div className="mt-4 space-y-4">
                <ProsodyRadar current={analysis.prosodyScore} size="sm" />
                {analysis.patterns.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reading Patterns Detected</p>
                    <PatternBadgeList patterns={analysis.patterns} />
                  </div>
                )}
                {analysis.speechRateMetrics && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <span className="text-gray-500">Articulation Rate: </span>
                      <span className="font-bold">{analysis.speechRateMetrics.articulationRate} WPM</span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <span className="text-gray-500">Phonation Ratio: </span>
                      <span className="font-bold">{Math.round(analysis.speechRateMetrics.phonationRatio * 100)}%</span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <span className="text-gray-500">Syllable Rate: </span>
                      <span className="font-bold">{analysis.speechRateMetrics.syllableRate}/s</span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <span className="text-gray-500">Self-corrections: </span>
                      <span className="font-bold text-emerald-600">{analysis.selfCorrectionCount}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button onClick={reRecord} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-all">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
          <button onClick={nextSentence} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1B3A8C] text-white font-semibold hover:bg-blue-900 transition-all">
            {isLast ? <><Star className="w-4 h-4" /> Finish Session</> : <>Next Sentence <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI: Session Summary
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'summary' && sessionData) {
    const msg = getEncouragementMessage(sessionData.overallScore);
    const avgWeighted = sentenceAnalyses.length > 0
      ? sentenceAnalyses.reduce((s, a) => s + a.weightedAccuracy, 0) / sentenceAnalyses.length : 0;
    const allPatterns = Array.from(new Map(sentenceAnalyses.flatMap(a => a.patterns).map(p => [p.id, p])).values());

    return (
      <div className="max-w-2xl mx-auto px-4 py-8 page-enter">
        <div className="bg-white rounded-2xl p-8 text-center mb-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="text-4xl mb-2">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Fraunces, serif' }}>Session Complete!</h1>

          <div className="my-6 count-up">
            <ScoreCircle score={sessionData.overallScore} size={160} />
          </div>

          <p className="text-gray-600 mb-3">{msg}</p>

          {/* Betts + NAEP row */}
          {sessionData.bettsCriteria && (
            <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
              <BettsLevelBadge level={sessionData.bettsCriteria} size="md" showSubLabel />
            </div>
          )}

          {/* Stars */}
          <div className="flex items-center justify-center gap-1 mb-6">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className={`w-8 h-8 transition-all ${i < sessionData.starsEarned ? 'text-yellow-400 fill-yellow-400 scale-110' : 'text-gray-200 fill-gray-200'}`} style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="text-xl font-bold text-[#1B3A8C]">{Math.round(sessionData.averageAccuracy)}%</div>
              <div className="text-xs text-gray-500">Accuracy</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3">
              <div className="text-xl font-bold text-emerald-600">{sessionData.averageWPM}</div>
              <div className="text-xs text-gray-500">WPM</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-3">
              <div className="text-xl font-bold text-amber-600">{sessionData.totalWordsRead}</div>
              <div className="text-xs text-gray-500">Words Read</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-3">
              <div className="text-xl font-bold text-purple-600">{Math.round(avgWeighted)}%</div>
              <div className="text-xs text-gray-500">Weighted Acc.</div>
            </div>
          </div>
        </div>

        {/* Prosody radar (session average) */}
        {sessionData.prosodyScore && (
          <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <h3 className="font-bold text-gray-900 mb-4" style={{ fontFamily: 'Fraunces, serif' }}>Prosody Profile</h3>
            <ProsodyRadar current={sessionData.prosodyScore} size="sm" />
          </div>
        )}

        {/* Detected patterns */}
        {allPatterns.length > 0 && (
          <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <h3 className="font-bold text-gray-900 mb-3" style={{ fontFamily: 'Fraunces, serif' }}>Reading Patterns</h3>
            <PatternBadgeList patterns={allPatterns} />
          </div>
        )}

        {/* Sentence breakdown */}
        <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <h3 className="font-bold text-gray-900 mb-3" style={{ fontFamily: 'Fraunces, serif' }}>Sentence Breakdown</h3>
          <div className="space-y-2">
            {scores.map((sc, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                <span className="text-gray-600 truncate flex-1 mr-4">{sentences[i]?.text.slice(0, 40)}…</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-medium text-gray-900">{Math.round(sc.accuracyScore)}%</span>
                  <span className="text-gray-400">{sc.wpm} WPM</span>
                  {sentenceAnalyses[i] && <BettsLevelBadge level={sentenceAnalyses[i].betts} size="sm" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => { setStep('select'); setIsCustomSession(false); recording.resetRecording(); speech.resetTranscript(); setSentenceAnalyses([]); }}
            className="flex-1 py-3.5 rounded-xl border-2 border-[#1B3A8C] text-[#1B3A8C] font-semibold hover:bg-blue-50 transition-all">
            Practice Again
          </button>
          <button onClick={() => router.push('/student/dashboard')}
            className="flex-1 py-3.5 rounded-xl bg-[#1B3A8C] text-white font-semibold hover:bg-blue-900 transition-all">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#1B3A8C] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
