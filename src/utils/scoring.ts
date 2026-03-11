import { SentenceScore, ReadingIssue } from '@/db/indexeddb';
import { v4 as uuidv4 } from 'uuid';

// Target WPM by difficulty
const TARGET_WPM = {
  simple: 90,
  medium: 110,
  complex: 130,
};

export function computeWordAccuracy(expected: string, transcript: string): {
  accuracy: number;
  missedWords: string[];
  extraWords: string[];
  substitutedWords: { expected: string; spoken: string }[];
  correctWords: string[];
} {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);

  const expectedWords = normalize(expected);
  const spokenWords = normalize(transcript);

  const missedWords: string[] = [];
  const extraWords: string[] = [];
  const substitutedWords: { expected: string; spoken: string }[] = [];
  const correctWords: string[] = [];

  // Simple LCS-based alignment
  const used = new Array(spokenWords.length).fill(false);

  for (let i = 0; i < expectedWords.length; i++) {
    const ew = expectedWords[i];
    // Try exact match first
    const exactIdx = spokenWords.findIndex((sw, idx) => !used[idx] && sw === ew);
    if (exactIdx !== -1) {
      used[exactIdx] = true;
      correctWords.push(ew);
      continue;
    }
    // Try fuzzy match (Levenshtein ≤ 2)
    let bestIdx = -1;
    let bestDist = 3;
    for (let j = 0; j < spokenWords.length; j++) {
      if (used[j]) continue;
      const dist = levenshtein(ew, spokenWords[j]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    if (bestIdx !== -1 && bestDist <= 2) {
      used[bestIdx] = true;
      if (bestDist > 0) {
        substitutedWords.push({ expected: ew, spoken: spokenWords[bestIdx] });
      } else {
        correctWords.push(ew);
      }
    } else {
      missedWords.push(ew);
    }
  }

  // Any unmatched spoken words are insertions
  spokenWords.forEach((sw, idx) => {
    if (!used[idx]) extraWords.push(sw);
  });

  const accuracy = expectedWords.length > 0
    ? (correctWords.length / expectedWords.length) * 100
    : 0;

  return { accuracy, missedWords, extraWords, substitutedWords, correctWords };
}

export function computeWPM(wordCount: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.round((wordCount / durationSeconds) * 60);
}

export function computeFluencyScore(
  accuracy: number,
  wpm: number,
  difficulty: 'simple' | 'medium' | 'complex'
): number {
  const targetWPM = TARGET_WPM[difficulty];
  const wpmRatio = Math.min(wpm / targetWPM, 1);
  return (accuracy * 0.6) + (wpmRatio * 0.4 * 100);
}

export function computeSessionScore(fluencyScores: number[]): number {
  if (fluencyScores.length === 0) return 0;
  return fluencyScores.reduce((sum, s) => sum + s, 0) / fluencyScores.length;
}

export function computeReadingLevel(avgScore: number): 'Beginner' | 'Developing' | 'Proficient' | 'Advanced' {
  if (avgScore >= 85) return 'Advanced';
  if (avgScore >= 70) return 'Proficient';
  if (avgScore >= 50) return 'Developing';
  return 'Beginner';
}

export function computeStarsEarned(sessionScore: number): number {
  if (sessionScore >= 90) return 5;
  if (sessionScore >= 75) return 4;
  if (sessionScore >= 60) return 3;
  if (sessionScore >= 40) return 2;
  return 1;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function buildSentenceScore(
  sentenceId: string,
  expected: string,
  transcript: string,
  durationSeconds: number,
  difficulty: 'simple' | 'medium' | 'complex',
  studentId: string,
  sessionId: string
): { score: SentenceScore; issues: ReadingIssue[] } {
  const wordCount = expected.trim().split(/\s+/).length;
  const { accuracy, missedWords, extraWords, substitutedWords } = computeWordAccuracy(expected, transcript);
  const wpm = computeWPM(wordCount, durationSeconds);
  const fluencyScore = computeFluencyScore(accuracy, wpm, difficulty);

  const issues = detectIssues(expected, transcript, studentId, sessionId, sentenceId, durationSeconds, wordCount);

  const score: SentenceScore = {
    sentenceId,
    accuracyScore: Math.round(accuracy * 10) / 10,
    wpm,
    fluencyScore: Math.round(fluencyScore * 10) / 10,
    duration: durationSeconds,
    transcript,
    missedWords,
    extraWords,
    substitutedWords,
    issues,
  };

  return { score, issues };
}

function detectIssues(
  expected: string,
  transcript: string,
  studentId: string,
  sessionId: string,
  sentenceId: string,
  durationSeconds: number,
  wordCount: number
): ReadingIssue[] {
  const issues: ReadingIssue[] = [];
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);

  const expectedWords = normalize(expected);
  const spokenWords = normalize(transcript);
  const now = Date.now();

  // Omissions
  expectedWords.forEach((ew, pos) => {
    const found = spokenWords.some(sw => sw === ew || levenshtein(sw, ew) <= 1);
    if (!found) {
      issues.push({
        id: uuidv4(), studentId, sessionId, sentenceId,
        type: 'omission', expectedWord: ew, spokenWord: '', position: pos, timestamp: now,
      });
    }
  });

  // Substitutions & Mispronunciations
  spokenWords.forEach((sw, pos) => {
    const exact = expectedWords.includes(sw);
    if (!exact) {
      // Find closest expected word
      let bestDist = 999;
      let bestWord = '';
      expectedWords.forEach(ew => {
        const d = levenshtein(sw, ew);
        if (d < bestDist) { bestDist = d; bestWord = ew; }
      });
      if (bestDist <= 2 && bestDist > 0) {
        issues.push({
          id: uuidv4(), studentId, sessionId, sentenceId,
          type: 'mispronunciation', expectedWord: bestWord, spokenWord: sw, position: pos, timestamp: now,
        });
      } else if (bestDist > 2) {
        issues.push({
          id: uuidv4(), studentId, sessionId, sentenceId,
          type: 'substitution', expectedWord: bestWord || '', spokenWord: sw, position: pos, timestamp: now,
        });
      }
    }
  });

  // Insertions (extra words)
  if (spokenWords.length > expectedWords.length) {
    const extras = spokenWords.length - expectedWords.length;
    for (let i = 0; i < extras; i++) {
      issues.push({
        id: uuidv4(), studentId, sessionId, sentenceId,
        type: 'insertion', expectedWord: '', spokenWord: spokenWords[expectedWords.length + i] || '',
        position: expectedWords.length + i, timestamp: now,
      });
    }
  }

  // Repetitions (consecutive duplicate words)
  for (let i = 1; i < spokenWords.length; i++) {
    if (spokenWords[i] === spokenWords[i - 1]) {
      issues.push({
        id: uuidv4(), studentId, sessionId, sentenceId,
        type: 'repetition', expectedWord: spokenWords[i], spokenWord: spokenWords[i],
        position: i, timestamp: now,
      });
    }
  }

  // Hesitation (if WPM < 60% of expected for difficulty — slow reading)
  const actualWPM = (wordCount / durationSeconds) * 60;
  if (actualWPM < 50 && durationSeconds > 5) {
    issues.push({
      id: uuidv4(), studentId, sessionId, sentenceId,
      type: 'hesitation', expectedWord: '', spokenWord: '', position: 0, timestamp: now,
    });
  }

  // Reversal detection (simple: check if two adjacent expected words appear reversed)
  for (let i = 0; i < expectedWords.length - 1; i++) {
    const a = expectedWords[i], b = expectedWords[i + 1];
    const ai = spokenWords.indexOf(a);
    const bi = spokenWords.indexOf(b);
    if (ai !== -1 && bi !== -1 && ai > bi) {
      issues.push({
        id: uuidv4(), studentId, sessionId, sentenceId,
        type: 'reversal', expectedWord: `${a} ${b}`, spokenWord: `${b} ${a}`,
        position: i, timestamp: now,
      });
    }
  }

  return issues;
}

export const ENCOURAGEMENT_MESSAGES = {
  excellent: [
    "Amazing job! You're a star reader! 🌟",
    "Wow! That was fantastic! Keep shining! ✨",
    "Outstanding! You read that perfectly! 🏆",
    "Incredible reading! You should be so proud! 🎉",
    "You're a reading superstar! Excellent work! 🚀",
  ],
  good: [
    "Great job! You're doing really well! 👍",
    "Nice reading! Just a few more words to practice! 😊",
    "You're improving every time! Keep it up! 💪",
    "Good work! Practice makes perfect! 📚",
    "Well done! You're getting better and better! 🌈",
  ],
  fair: [
    "Keep trying! Every practice makes you stronger! 💪",
    "Good effort! Let's keep practicing together! 📖",
    "You're learning! That's what matters most! 🌱",
    "Don't give up! Each time you try, you improve! ⭐",
    "Nice try! Reading takes practice — you've got this! 🎯",
  ],
  low: [
    "It's okay! Everyone starts somewhere! Keep going! 🌟",
    "Don't worry! Practice more and you'll get there! 🛤️",
    "You showed up — that's the hardest part! Try again! 💡",
    "Learning takes time! You're doing great by trying! 🌻",
    "Every expert was once a beginner! Keep reading! 📚",
  ],
};

export function getEncouragementMessage(score: number): string {
  const messages =
    score >= 85 ? ENCOURAGEMENT_MESSAGES.excellent
    : score >= 70 ? ENCOURAGEMENT_MESSAGES.good
    : score >= 50 ? ENCOURAGEMENT_MESSAGES.fair
    : ENCOURAGEMENT_MESSAGES.low;
  return messages[Math.floor(Math.random() * messages.length)];
}
