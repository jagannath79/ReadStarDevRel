import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type {
  Miscue,
  SelfCorrectionEvent,
  PhonemeError,
  PatternResult,
  BettsCriteria,
  NAEPFluencyLevel,
} from '@/utils/diagnostics';
import type {
  PauseInfo,
  SpeechRateMetrics,
  VolumeMetrics,
  ProsodyScoreBreakdown,
} from '@/utils/acousticAnalysis';

export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: 'student' | 'teacher';
  firstName: string;
  lastName: string;
  grade?: number;
  createdAt: number;
  lastActive: number;
  defaultDifficulty?: 'simple' | 'medium' | 'complex';
  language?: string;
  teacherNotes?: TeacherNote[];
  streak?: number;
  totalStars?: number;
}

export interface TeacherNote {
  id: string;
  text: string;
  timestamp: number;
  teacherId: string;
}

export interface Sentence {
  id: string;
  text: string;
  difficulty: 'simple' | 'medium' | 'complex';
  topic: string;
  gradeTarget: number;
  wordCount: number;
  createdAt: number;
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  position: number;
}

export interface Session {
  id: string;
  studentId: string;
  difficulty: 'simple' | 'medium' | 'complex';
  startedAt: number;
  completedAt?: number;
  sentences: string[];
  scores: SentenceScore[];
  overallScore: number;
  averageAccuracy: number;
  averageWPM: number;
  totalWordsRead: number;
  starsEarned: number;
  issues: ReadingIssue[];
  completed: boolean;

  // ── Acoustic / prosodic extensions (v2) ──────────────────────────────────
  waveformSamples?: number[];
  pauseMap?: PauseInfo[];
  speechRateMetrics?: SpeechRateMetrics;
  volumeMetrics?: VolumeMetrics;
  prosodyScore?: ProsodyScoreBreakdown;
  fluencyLevel?: NAEPFluencyLevel;

  // ── Linguistic accuracy extensions (v2) ──────────────────────────────────
  bettsCriteria?: BettsCriteria;
  detectedPatterns?: PatternResult[];
  weightedAccuracy?: number;
  selfCorrectionRate?: number;
  accuracyFirstHalf?: number;
  accuracySecondHalf?: number;
}

export interface SentenceScore {
  sentenceId: string;
  accuracyScore: number;
  wpm: number;
  fluencyScore: number;
  duration: number;
  transcript: string;
  missedWords: string[];
  extraWords: string[];
  substitutedWords: { expected: string; spoken: string }[];
  issues: ReadingIssue[];

  // ── Extended diagnostics per sentence (v2) ───────────────────────────────
  miscues?: Miscue[];
  wordTimings?: WordTiming[];
  selfCorrections?: SelfCorrectionEvent[];
  phonemeErrors?: PhonemeError[];
  bettsCriteria?: BettsCriteria;
  weightedAccuracy?: number;
  prosodyScore?: ProsodyScoreBreakdown;
  fluencyLevel?: NAEPFluencyLevel;
  waveformSamples?: number[];
  pauseMap?: PauseInfo[];
}

export interface ReadingIssue {
  id: string;
  studentId: string;
  sessionId: string;
  sentenceId: string;
  type: 'omission' | 'substitution' | 'insertion' | 'repetition' | 'hesitation' | 'mispronunciation' | 'reversal';
  expectedWord: string;
  spokenWord: string;
  position: number;
  timestamp: number;
}

export interface Recording {
  id: string;
  studentId: string;
  sessionId: string;
  sentenceId: string;
  audioBlob: Blob;
  transcript: string;
  duration: number;
  createdAt: number;

  // ── Extended diagnostics on recording (v2) ───────────────────────────────
  miscues?: Miscue[];
  wordTimings?: WordTiming[];
  selfCorrections?: SelfCorrectionEvent[];
  phonemeErrors?: PhonemeError[];
  bettsCriteria?: BettsCriteria;
  weightedAccuracy?: number;
  waveformSamples?: number[];
  pauseMap?: PauseInfo[];
  speechRateMetrics?: SpeechRateMetrics;
  volumeMetrics?: VolumeMetrics;
  prosodyScore?: ProsodyScoreBreakdown;
  fluencyLevel?: NAEPFluencyLevel;
}

export interface Analytics {
  studentId: string;
  totalSessions: number;
  averageAccuracy: number;
  averageWPM: number;
  totalWordsRead: number;
  readingLevel: 'Beginner' | 'Developing' | 'Proficient' | 'Advanced';
  issueFrequency: Record<string, number>;
  lastUpdated: number;
}

// ── v2 New Stores ─────────────────────────────────────────────────────────────

export interface PhonemeStats {
  /** Composite key: `${studentId}:${phoneme}` */
  id: string;
  studentId: string;
  phoneme: string;
  encounterCount: number;
  errorCount: number;
  errorRate: number;
  lastUpdated: number;
}

export interface WordStats {
  /** Composite key: `${studentId}:${word}` */
  id: string;
  studentId: string;
  word: string;
  encounterCount: number;
  errorCount: number;
  errorTypes: Record<string, number>;
  lastError: number;
  masteryAchieved: boolean;
}

// ─── DB Schema ────────────────────────────────────────────────────────────────

interface ReadStarDB extends DBSchema {
  users: {
    key: string;
    value: User;
    indexes: { 'by-email': string; 'by-username': string; 'by-role': string };
  };
  sentences: {
    key: string;
    value: Sentence;
    indexes: { 'by-difficulty': string };
  };
  sessions: {
    key: string;
    value: Session;
    indexes: { 'by-student': string; 'by-date': number };
  };
  recordings: {
    key: string;
    value: Recording;
    indexes: { 'by-session': string; 'by-student': string };
  };
  analytics: {
    key: string;
    value: Analytics;
  };
  phoneme_stats: {
    key: string;
    value: PhonemeStats;
    indexes: { 'by-student': string };
  };
  word_stats: {
    key: string;
    value: WordStats;
    indexes: { 'by-student': string };
  };
}

let dbPromise: Promise<IDBPDatabase<ReadStarDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ReadStarDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ReadStarDB>('readstar-db', 2, {
      upgrade(db, oldVersion) {
        // ── v1 stores ────────────────────────────────────────────────────────
        if (oldVersion < 1) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' });
          userStore.createIndex('by-email', 'email', { unique: true });
          userStore.createIndex('by-username', 'username', { unique: true });
          userStore.createIndex('by-role', 'role');

          const sentenceStore = db.createObjectStore('sentences', { keyPath: 'id' });
          sentenceStore.createIndex('by-difficulty', 'difficulty');

          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('by-student', 'studentId');
          sessionStore.createIndex('by-date', 'startedAt');

          const recordingStore = db.createObjectStore('recordings', { keyPath: 'id' });
          recordingStore.createIndex('by-session', 'sessionId');
          recordingStore.createIndex('by-student', 'studentId');

          db.createObjectStore('analytics', { keyPath: 'studentId' });
        }

        // ── v2 stores ────────────────────────────────────────────────────────
        if (oldVersion < 2) {
          const phonemeStore = db.createObjectStore('phoneme_stats', { keyPath: 'id' });
          phonemeStore.createIndex('by-student', 'studentId');

          const wordStore = db.createObjectStore('word_stats', { keyPath: 'id' });
          wordStore.createIndex('by-student', 'studentId');
        }
      },
    });
  }
  return dbPromise;
}

// ─── User Operations ──────────────────────────────────────────────────────────

export async function createUser(user: User): Promise<void> {
  const db = await getDB();
  await db.add('users', user);
}

export async function getUserById(id: string): Promise<User | undefined> {
  const db = await getDB();
  return db.get('users', id);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDB();
  return db.getFromIndex('users', 'by-email', email);
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const db = await getDB();
  return db.getFromIndex('users', 'by-username', username);
}

export async function getAllStudents(): Promise<User[]> {
  const db = await getDB();
  return db.getAllFromIndex('users', 'by-role', 'student');
}

export async function getAllTeachers(): Promise<User[]> {
  const db = await getDB();
  return db.getAllFromIndex('users', 'by-role', 'teacher');
}

export async function updateUser(user: User): Promise<void> {
  const db = await getDB();
  await db.put('users', user);
}

export async function addTeacherNote(studentId: string, note: TeacherNote): Promise<void> {
  const db = await getDB();
  const user = await db.get('users', studentId);
  if (user) {
    user.teacherNotes = [...(user.teacherNotes || []), note];
    await db.put('users', user);
  }
}

// ─── Sentence Operations ──────────────────────────────────────────────────────

export async function addSentence(sentence: Sentence): Promise<void> {
  const db = await getDB();
  await db.add('sentences', sentence);
}

export async function getAllSentences(): Promise<Sentence[]> {
  const db = await getDB();
  return db.getAll('sentences');
}

export async function getSentencesByDifficulty(difficulty: string): Promise<Sentence[]> {
  const db = await getDB();
  return db.getAllFromIndex('sentences', 'by-difficulty', difficulty);
}

export async function getSentenceById(id: string): Promise<Sentence | undefined> {
  const db = await getDB();
  return db.get('sentences', id);
}

export async function updateSentence(sentence: Sentence): Promise<void> {
  const db = await getDB();
  await db.put('sentences', sentence);
}

export async function deleteSentence(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sentences', id);
}

export async function getSentenceCount(): Promise<number> {
  const db = await getDB();
  return db.count('sentences');
}

// ─── Session Operations ───────────────────────────────────────────────────────

export async function createSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.add('sessions', session);
}

export async function updateSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function getSessionById(id: string): Promise<Session | undefined> {
  const db = await getDB();
  return db.get('sessions', id);
}

export async function getSessionsByStudent(studentId: string): Promise<Session[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex('sessions', 'by-student', studentId);
  return sessions.sort((a, b) => b.startedAt - a.startedAt);
}

export async function getAllSessions(): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAll('sessions');
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function getRecentSessions(limit: number = 5): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAll('sessions');
  return all.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}

export async function getSessionsToday(): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAll('sessions');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return all.filter(s => s.startedAt >= todayStart.getTime() && s.completed);
}

// ─── Recording Operations ─────────────────────────────────────────────────────

export async function saveRecording(recording: Recording): Promise<void> {
  const db = await getDB();
  await db.put('recordings', recording);
}

export async function getRecordingBySession(sessionId: string): Promise<Recording[]> {
  const db = await getDB();
  return db.getAllFromIndex('recordings', 'by-session', sessionId);
}

export async function getRecordingsByStudent(studentId: string): Promise<Recording[]> {
  const db = await getDB();
  return db.getAllFromIndex('recordings', 'by-student', studentId);
}

export async function getAllRecordings(): Promise<Recording[]> {
  const db = await getDB();
  const all = await db.getAll('recordings');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRecordingById(id: string): Promise<Recording | undefined> {
  const db = await getDB();
  return db.get('recordings', id);
}

// ─── Analytics Operations ─────────────────────────────────────────────────────

export async function getAnalytics(studentId: string): Promise<Analytics | undefined> {
  const db = await getDB();
  return db.get('analytics', studentId);
}

export async function updateAnalytics(analytics: Analytics): Promise<void> {
  const db = await getDB();
  await db.put('analytics', analytics);
}

export async function computeAndUpdateAnalytics(studentId: string): Promise<Analytics> {
  const sessions = await getSessionsByStudent(studentId);
  const completed = sessions.filter(s => s.completed);

  const totalSessions = completed.length;
  const averageAccuracy = totalSessions > 0
    ? completed.reduce((sum, s) => sum + s.averageAccuracy, 0) / totalSessions
    : 0;
  const averageWPM = totalSessions > 0
    ? completed.reduce((sum, s) => sum + s.averageWPM, 0) / totalSessions
    : 0;
  const totalWordsRead = completed.reduce((sum, s) => sum + s.totalWordsRead, 0);

  const issueFrequency: Record<string, number> = {};
  completed.forEach(s => {
    s.issues?.forEach(issue => {
      issueFrequency[issue.type] = (issueFrequency[issue.type] || 0) + 1;
    });
  });

  const avgScore = completed.length > 0
    ? completed.reduce((sum, s) => sum + s.overallScore, 0) / completed.length
    : 0;

  let readingLevel: Analytics['readingLevel'] = 'Beginner';
  if (avgScore >= 85) readingLevel = 'Advanced';
  else if (avgScore >= 70) readingLevel = 'Proficient';
  else if (avgScore >= 50) readingLevel = 'Developing';

  const analytics: Analytics = {
    studentId,
    totalSessions,
    averageAccuracy,
    averageWPM,
    totalWordsRead,
    readingLevel,
    issueFrequency,
    lastUpdated: Date.now(),
  };

  await updateAnalytics(analytics);
  return analytics;
}

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

export async function authenticateUser(usernameOrEmail: string, password: string): Promise<User | null> {
  const db = await getDB();
  let user = await db.getFromIndex('users', 'by-email', usernameOrEmail);
  if (!user) {
    user = await db.getFromIndex('users', 'by-username', usernameOrEmail);
  }
  if (!user) return null;
  // Simple password check (in production, use bcrypt)
  if (user.password !== password) return null;
  // Update last active
  user.lastActive = Date.now();
  await db.put('users', user);
  return user;
}

export async function userExists(): Promise<boolean> {
  const db = await getDB();
  const count = await db.count('users');
  return count > 0;
}

// ─── PhonemeStats Operations (v2) ─────────────────────────────────────────────

export async function upsertPhonemeStats(
  studentId: string,
  phoneme: string,
  encountered: number,
  errors: number,
): Promise<void> {
  const db = await getDB();
  const id = `${studentId}:${phoneme}`;
  const existing = await db.get('phoneme_stats', id);
  const enc = (existing?.encounterCount ?? 0) + encountered;
  const err = (existing?.errorCount ?? 0) + errors;
  const stats: PhonemeStats = {
    id,
    studentId,
    phoneme,
    encounterCount: enc,
    errorCount: err,
    errorRate: enc > 0 ? err / enc : 0,
    lastUpdated: Date.now(),
  };
  await db.put('phoneme_stats', stats);
}

export async function getPhonemeStatsByStudent(studentId: string): Promise<PhonemeStats[]> {
  const db = await getDB();
  return db.getAllFromIndex('phoneme_stats', 'by-student', studentId);
}

export async function getAllPhonemeStats(): Promise<PhonemeStats[]> {
  const db = await getDB();
  return db.getAll('phoneme_stats');
}

// ─── WordStats Operations (v2) ────────────────────────────────────────────────

export async function upsertWordStats(
  studentId: string,
  word: string,
  encountered: number,
  errors: number,
  errorType?: string,
): Promise<void> {
  const db = await getDB();
  const id = `${studentId}:${word}`;
  const existing = await db.get('word_stats', id);
  const enc = (existing?.encounterCount ?? 0) + encountered;
  const err = (existing?.errorCount ?? 0) + errors;
  const errorTypes: Record<string, number> = { ...(existing?.errorTypes ?? {}) };
  if (errorType && errors > 0) {
    errorTypes[errorType] = (errorTypes[errorType] ?? 0) + errors;
  }
  // Mastery: encountered ≥ 5 times with error rate < 10%
  const masteryAchieved = enc >= 5 && (enc > 0 ? err / enc : 0) < 0.1;
  const stats: WordStats = {
    id,
    studentId,
    word,
    encounterCount: enc,
    errorCount: err,
    errorTypes,
    lastError: errors > 0 ? Date.now() : (existing?.lastError ?? 0),
    masteryAchieved,
  };
  await db.put('word_stats', stats);
}

export async function getWordStatsByStudent(studentId: string): Promise<WordStats[]> {
  const db = await getDB();
  return db.getAllFromIndex('word_stats', 'by-student', studentId);
}

export async function getAllWordStats(): Promise<WordStats[]> {
  const db = await getDB();
  return db.getAll('word_stats');
}

/**
 * Returns the top N most-errored words for a student.
 */
export async function getMostProblematicWords(studentId: string, limit = 10): Promise<WordStats[]> {
  const all = await getWordStatsByStudent(studentId);
  return all
    .filter(w => w.errorCount > 0)
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, limit);
}

/**
 * Returns all phonemes with error rate above a given threshold.
 */
export async function getWeakPhonemes(studentId: string, threshold = 0.3): Promise<PhonemeStats[]> {
  const all = await getPhonemeStatsByStudent(studentId);
  return all
    .filter(p => p.encounterCount >= 3 && p.errorRate >= threshold)
    .sort((a, b) => b.errorRate - a.errorRate);
}
