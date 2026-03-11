'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Target, Zap, FileText, AlertCircle, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import {
  getUserById, getSessionsByStudent, getRecordingBySession, computeAndUpdateAnalytics,
  addTeacherNote, getPhonemeStatsByStudent, getWordStatsByStudent,
  type User, type Session, type Analytics, type Recording, type PhonemeStats, type WordStats,
} from '@/db/indexeddb';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AudioPlayer } from '@/components/shared/AudioPlayer';
import { useToast } from '@/components/shared/Toast';
import BettsLevelBadge from '@/components/analysis/BettsLevelBadge';
import { FluencyLevelInline } from '@/components/analysis/FluencyLevelGauge';
import { PatternBadgeList } from '@/components/analysis/PatternBadge';
import MiscueTable from '@/components/analysis/MiscueTable';
import PhonicsHeatmap from '@/components/analysis/PhonicsHeatmap';
import ProsodyRadar from '@/components/analysis/ProsodyRadar';
import WaveformPlayer from '@/components/analysis/WaveformPlayer';
import { v4 as uuidv4 } from 'uuid';

const ISSUE_COLORS: Record<string, string> = {
  omission: '#EF4444', substitution: '#F97316', insertion: '#EAB308',
  repetition: '#8B5CF6', hesitation: '#EC4899', mispronunciation: '#14B8A6', reversal: '#6366F1',
};
const ISSUE_LABELS: Record<string, string> = {
  omission: 'Omission', substitution: 'Substitution', insertion: 'Insertion',
  repetition: 'Repetition', hesitation: 'Hesitation', mispronunciation: 'Mispronunciation', reversal: 'Reversal',
};
const LEVEL_BG: Record<string, string> = { Beginner: '#E5E7EB', Developing: '#FDE68A', Proficient: '#BFDBFE', Advanced: '#A7F3D0' };
const LEVEL_TEXT: Record<string, string> = { Beginner: '#6B7280', Developing: '#92400E', Proficient: '#1E40AF', Advanced: '#065F46' };

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [student, setStudent] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recordings, setRecordings] = useState<Map<string, Recording[]>>(new Map());
  const [phonemeStats, setPhonemeStats] = useState<PhonemeStats[]>([]);
  const [wordStats, setWordStats] = useState<WordStats[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'miscues' | 'phonics' | 'patterns'>('overview');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [s, sess, anal, ph, ws] = await Promise.all([
      getUserById(id as string),
      getSessionsByStudent(id as string),
      computeAndUpdateAnalytics(id as string),
      getPhonemeStatsByStudent(id as string),
      getWordStatsByStudent(id as string),
    ]);
    setStudent(s || null);
    setSessions(sess.filter(x => x.completed));
    setAnalytics(anal);
    setPhonemeStats(ph);
    setWordStats(ws);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadRecordings = useCallback(async (sessionId: string) => {
    if (recordings.has(sessionId)) return;
    const recs = await getRecordingBySession(sessionId);
    setRecordings(prev => new Map(prev).set(sessionId, recs));
  }, [recordings]);

  const toggleSession = useCallback(async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
    } else {
      setExpandedSession(sessionId);
      await loadRecordings(sessionId);
    }
  }, [expandedSession, loadRecordings]);

  const addNote = async () => {
    if (!noteText.trim() || !student) return;
    setSavingNote(true);
    await addTeacherNote(student.id, { id: uuidv4(), text: noteText.trim(), timestamp: Date.now(), teacherId: 'teacher' });
    setNoteText('');
    setSavingNote(false);
    showToast('Note saved!', 'success');
    await load();
  };

  if (loading) return (
    <div className="max-w-4xl mx-auto">
      <div className="grid gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-2xl skeleton" />)}</div>
    </div>
  );

  if (!student) return (
    <div className="text-center py-12">
      <p className="text-gray-400">Student not found.</p>
      <button onClick={() => router.back()} className="mt-4 text-[#22A06B] underline">Go back</button>
    </div>
  );

  const accuracyData = sessions.slice(0, 10).reverse().map((s, i) => ({
    session: `S${i + 1}`, accuracy: Math.round(s.averageAccuracy), wpm: s.averageWPM,
    weighted: s.weightedAccuracy ? Math.round(s.weightedAccuracy) : Math.round(s.averageAccuracy),
  }));

  const issueCounts: Record<string, number> = {};
  sessions.forEach(s => s.issues?.forEach(issue => { issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1; }));
  const issueData = Object.entries(issueCounts).map(([t, c]) => ({ type: ISSUE_LABELS[t] || t, count: c, color: ISSUE_COLORS[t] || '#6B7280' })).sort((a, b) => b.count - a.count);

  const level = analytics?.readingLevel || 'Beginner';

  // Aggregate all miscues across all sessions
  const allMiscues = sessions.flatMap(s => s.scores?.flatMap(sc => sc.miscues ?? []) ?? []);
  const allPatterns = Array.from(
    new Map(sessions.flatMap(s => s.detectedPatterns ?? []).map(p => [p.id, p])).values()
  );
  const latestProsody = sessions.find(s => s.prosodyScore)?.prosodyScore;
  const previousProsody = sessions.filter(s => s.prosodyScore).slice(1)[0]?.prosodyScore;

  // Problem words
  const problemWords = wordStats.filter(w => w.errorCount > 0).sort((a, b) => b.errorCount - a.errorCount).slice(0, 10);

  // Latest session for Betts
  const latestSession = sessions[0];

  const TABS = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'miscues' as const, label: `Miscues (${allMiscues.length})` },
    { id: 'phonics' as const, label: 'Phonics' },
    { id: 'patterns' as const, label: `Patterns (${allPatterns.length})` },
  ];

  return (
    <div className="max-w-4xl mx-auto page-enter">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-[#22A06B] font-medium mb-5 hover:opacity-80 transition-opacity text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Roster
      </button>

      {/* Profile Header */}
      <div className="bg-white rounded-2xl p-6 mb-4 flex items-center gap-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-xl font-bold flex-shrink-0">
          {student.firstName[0]}{student.lastName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
                {student.firstName} {student.lastName}
              </h1>
              <p className="text-gray-500 text-sm">{student.email} · {student.grade ? `Grade ${student.grade}` : ''}</p>
              <p className="text-gray-400 text-xs mt-0.5">Joined {new Date(student.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold px-3 py-1.5 rounded-xl" style={{ background: LEVEL_BG[level], color: LEVEL_TEXT[level] }}>{level}</span>
              {latestSession?.bettsCriteria && <BettsLevelBadge level={latestSession.bettsCriteria} size="sm" />}
              {latestSession?.fluencyLevel && <FluencyLevelInline level={latestSession.fluencyLevel} />}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 card-stagger">
        {[
          { icon: BookOpen, label: 'Sessions', value: analytics?.totalSessions || 0, color: 'bg-blue-100 text-blue-600' },
          { icon: Target, label: 'Avg Accuracy', value: `${Math.round(analytics?.averageAccuracy || 0)}%`, color: 'bg-emerald-100 text-emerald-600' },
          { icon: Zap, label: 'Avg WPM', value: analytics?.averageWPM || 0, color: 'bg-amber-100 text-amber-600' },
          { icon: FileText, label: 'Words Read', value: analytics?.totalWordsRead || 0, color: 'bg-purple-100 text-purple-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${card.color}`}><card.icon className="w-4 h-4" /></div>
            <div className="text-xl font-bold text-gray-900">{card.value}</div>
            <div className="text-xs text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl mb-4 overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        {/* Tab bar */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-[#22A06B] text-[#22A06B]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* ── Overview tab ───────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {sessions.length > 0 && (
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Accuracy + weighted trend */}
                  <div>
                    <h3 className="font-bold text-gray-900 mb-3 text-sm">Accuracy Trend</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={accuracyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                        <XAxis dataKey="session" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="accuracy" stroke="#22A06B" strokeWidth={2} dot={{ fill: '#22A06B', r: 3 }} name="Accuracy" />
                        <Line type="monotone" dataKey="weighted" stroke="#1B3A8C" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Weighted" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Issue chart */}
                  <div>
                    <h3 className="font-bold text-gray-900 mb-3 text-sm flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 text-red-400" /> Issue Analysis
                    </h3>
                    {issueData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={issueData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="type" type="category" tick={{ fontSize: 9 }} width={85} />
                          <Tooltip />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                            {issueData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-44 flex items-center justify-center text-gray-400 text-sm">No issues detected</div>
                    )}
                  </div>
                </div>
              )}

              {/* Prosody radar */}
              {latestProsody && (
                <div>
                  <h3 className="font-bold text-gray-900 mb-3 text-sm flex items-center gap-1">
                    <Activity className="w-4 h-4 text-blue-500" /> Prosody Profile (latest vs previous)
                  </h3>
                  <div className="max-w-sm">
                    <ProsodyRadar current={latestProsody} previous={previousProsody} size="sm" />
                  </div>
                </div>
              )}

              {/* Problem words */}
              {problemWords.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-900 mb-2 text-sm">Most Problematic Words</h3>
                  <div className="flex flex-wrap gap-2">
                    {problemWords.map(w => (
                      <span key={w.word} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${w.masteryAchieved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {w.word} <span className="opacity-60">{w.errorCount}×</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Miscues tab ─────────────────────────────────────────────────────── */}
          {activeTab === 'miscues' && (
            <div>
              <p className="text-xs text-gray-400 mb-4">All miscues from {sessions.length} completed sessions.</p>
              <MiscueTable
                miscues={allMiscues}
                showExport
                studentName={`${student.firstName}-${student.lastName}`}
                sessionDate={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}

          {/* ── Phonics tab ─────────────────────────────────────────────────────── */}
          {activeTab === 'phonics' && (
            <PhonicsHeatmap phonemeStats={phonemeStats} showLegend title="Phoneme Error Profile" />
          )}

          {/* ── Patterns tab ────────────────────────────────────────────────────── */}
          {activeTab === 'patterns' && (
            <div>
              <p className="text-xs text-gray-400 mb-4">Reading behavior patterns detected across all sessions.</p>
              <PatternBadgeList patterns={allPatterns} emptyMessage="No patterns detected. Complete more sessions with the full analysis pipeline." />
            </div>
          )}
        </div>
      </div>

      {/* Session History */}
      <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <h3 className="font-bold text-gray-900 mb-4" style={{ fontFamily: 'Fraunces, serif' }}>Session History</h3>
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No sessions yet</div>
        ) : (
          <div className="space-y-2">
            {sessions.map(session => (
              <div key={session.id} className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSession(session.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${session.difficulty === 'simple' ? 'bg-green-100 text-green-700' : session.difficulty === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {session.difficulty}
                    </span>
                    <span className="text-gray-500">{new Date(session.startedAt).toLocaleDateString()}</span>
                    <span className="font-semibold text-gray-900">{Math.round(session.averageAccuracy)}% accuracy</span>
                    <span className="text-gray-400">{session.averageWPM} WPM</span>
                    {session.bettsCriteria && <BettsLevelBadge level={session.bettsCriteria} size="sm" />}
                    {session.fluencyLevel && <FluencyLevelInline level={session.fluencyLevel} />}
                  </div>
                  {expandedSession === session.id ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {expandedSession === session.id && (
                  <div className="px-4 pb-4 border-t border-gray-50">
                    {/* Session-level diagnostics */}
                    {session.detectedPatterns && session.detectedPatterns.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Detected Patterns</p>
                        <PatternBadgeList patterns={session.detectedPatterns} />
                      </div>
                    )}

                    <div className="mt-3 space-y-3">
                      {session.scores?.map((score, i) => {
                        const recs = recordings.get(session.id) || [];
                        const rec = recs.find(r => r.sentenceId === score.sentenceId);
                        return (
                          <div key={i} className="bg-gray-50 rounded-xl p-3 text-xs">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-700">Sentence {i + 1}</span>
                                {score.bettsCriteria && <BettsLevelBadge level={score.bettsCriteria} size="sm" />}
                                {score.fluencyLevel && <FluencyLevelInline level={score.fluencyLevel} />}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[#22A06B] font-semibold">{Math.round(score.accuracyScore)}%</span>
                                <span className="text-gray-400">{score.wpm} WPM</span>
                                {rec && <AudioPlayer audioBlob={rec.audioBlob} compact />}
                              </div>
                            </div>

                            {/* Waveform player inline */}
                            {rec && (rec.waveformSamples?.length || rec.pauseMap?.length) && (
                              <div className="mb-2">
                                <WaveformPlayer
                                  audioBlob={rec.audioBlob}
                                  waveformSamples={rec.waveformSamples}
                                  pauseMap={rec.pauseMap}
                                  durationMs={rec.duration * 1000}
                                  height={50}
                                />
                              </div>
                            )}

                            {/* Miscues summary */}
                            {score.miscues && score.miscues.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {score.miscues.slice(0, 5).map((m, j) => (
                                  <span key={j} className="inline-flex items-center gap-0.5 bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded text-[10px]">
                                    {m.primaryType}: <span className="font-semibold">{m.spokenWord || '(omitted)'}</span>
                                  </span>
                                ))}
                                {score.miscues.length > 5 && <span className="text-gray-400 text-[10px]">+{score.miscues.length - 5} more</span>}
                              </div>
                            )}

                            {/* Legacy missed words (fallback) */}
                            {(!score.miscues || score.miscues.length === 0) && score.missedWords.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {score.missedWords.map((w, j) => (
                                  <span key={j} className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px]">missed: {w}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Teacher Notes */}
      <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <h3 className="font-bold text-gray-900 mb-4" style={{ fontFamily: 'Fraunces, serif' }}>Teacher Notes</h3>
        {student.teacherNotes && student.teacherNotes.length > 0 && (
          <div className="space-y-2 mb-4">
            {student.teacherNotes.map(note => (
              <div key={note.id} className="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                <p className="text-sm text-gray-700">{note.text}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(note.timestamp).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note about this student..." rows={2}
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 resize-none" />
          <button onClick={addNote} disabled={savingNote || !noteText.trim()}
            className="px-4 py-2 rounded-xl bg-[#22A06B] text-white text-sm font-medium disabled:opacity-40 hover:bg-emerald-700 transition-colors self-end">
            {savingNote ? '...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
