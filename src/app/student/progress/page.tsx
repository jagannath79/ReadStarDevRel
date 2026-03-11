'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getSessionsByStudent, getPhonemeStatsByStudent, getWordStatsByStudent,
  type Session, type PhonemeStats, type WordStats,
} from '@/db/indexeddb';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { TrendingUp, Zap, AlertCircle, Award, Activity, BookOpen, Star } from 'lucide-react';
import { getGradeBenchmark } from '@/utils/phonetics';
import ProsodyRadar from '@/components/analysis/ProsodyRadar';
import { PatternBadgeList } from '@/components/analysis/PatternBadge';
import type { PatternResult } from '@/utils/diagnostics';
import type { ProsodyScoreBreakdown } from '@/utils/acousticAnalysis';

const ISSUE_LABELS: Record<string, string> = {
  omission: 'Omission', substitution: 'Substitution', insertion: 'Insertion',
  repetition: 'Repetition', hesitation: 'Hesitation', mispronunciation: 'Mispronunciation', reversal: 'Reversal',
};
const DIFF_COLORS = { simple: '#22A06B', medium: '#F5A623', complex: '#EF4444' };
const ISSUE_COLORS = ['#1B3A8C', '#22A06B', '#F5A623', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];
const LEVEL_BG: Record<string, string> = { Beginner: '#E5E7EB', Developing: '#FDE68A', Proficient: '#BFDBFE', Advanced: '#A7F3D0' };
const LEVEL_TEXT: Record<string, string> = { Beginner: '#6B7280', Developing: '#92400E', Proficient: '#1E40AF', Advanced: '#065F46' };
const NAEP_COLORS: Record<number, string> = { 1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#22c55e' };

function computeReadingLevel(score: number) {
  if (score >= 85) return 'Advanced';
  if (score >= 70) return 'Proficient';
  if (score >= 50) return 'Developing';
  return 'Beginner';
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; name?: string; value: number; color?: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color ?? '#666' }}>{p.name ?? p.dataKey}: {p.value}{p.dataKey === 'accuracy' || p.dataKey === 'weightedAcc' ? '%' : ''}</p>
      ))}
    </div>
  );
};

export default function StudentProgress() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [phonemeStats, setPhonemeStats] = useState<PhonemeStats[]>([]);
  const [wordStats, setWordStats] = useState<WordStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getSessionsByStudent(user.id),
      getPhonemeStatsByStudent(user.id),
      getWordStatsByStudent(user.id),
    ]).then(([sess, ph, ws]) => {
      setSessions(sess.filter(x => x.completed));
      setPhonemeStats(ph);
      setWordStats(ws);
      setLoading(false);
    });
  }, [user]);

  if (!user) return null;
  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[...Array(6)].map((_, i) => <div key={i} className="h-64 rounded-2xl skeleton" />)}
      </div>
    </div>
  );

  const last15 = sessions.slice(0, 15).reverse();
  const grade = user.grade ?? 4;
  const benchmark = getGradeBenchmark(grade);

  // ─── Chart Data ────────────────────────────────────────────────────────────

  const trendData = last15.map((s, i) => ({
    session: `S${i + 1}`,
    date: new Date(s.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    accuracy: Math.round(s.averageAccuracy),
    wpm: s.averageWPM,
    weightedAcc: s.weightedAccuracy ? Math.round(s.weightedAccuracy) : Math.round(s.averageAccuracy),
    prosody: s.prosodyScore?.composite ?? null,
    fluencyLevel: s.fluencyLevel ?? null,
  }));

  const wpmData = last15.map((s, i) => ({
    session: `S${i + 1}`,
    date: new Date(s.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    wpm: s.averageWPM,
  }));

  const diffCounts: Record<string, number> = { simple: 0, medium: 0, complex: 0 };
  sessions.forEach(s => { diffCounts[s.difficulty] = (diffCounts[s.difficulty] || 0) + 1; });
  const diffData = Object.entries(diffCounts).filter(([, v]) => v > 0).map(([k, v]) => ({
    name: k.charAt(0).toUpperCase() + k.slice(1), value: v, color: DIFF_COLORS[k as keyof typeof DIFF_COLORS],
  }));

  const issueCounts: Record<string, number> = {};
  sessions.forEach(s => { s.issues?.forEach(issue => { issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1; }); });
  const issueData = Object.entries(issueCounts).map(([type, count]) => ({ type: ISSUE_LABELS[type] || type, count })).sort((a, b) => b.count - a.count);

  // Error pattern stacked area (miscue breakdown over time)
  const errorPatternData = last15.map((s, i) => {
    const subtypeCounts: Record<string, number> = {};
    (s.scores ?? []).forEach(sc => {
      (sc.miscues ?? []).forEach(m => {
        subtypeCounts[m.primaryType] = (subtypeCounts[m.primaryType] ?? 0) + 1;
      });
    });
    return {
      session: `S${i + 1}`,
      substitution: subtypeCounts.substitution ?? 0,
      omission: subtypeCounts.omission ?? 0,
      insertion: subtypeCounts.insertion ?? 0,
      mispronunciation: subtypeCounts.mispronunciation ?? 0,
      repetition: subtypeCounts.repetition ?? 0,
    };
  });

  // Prosody trend (last 10 with prosody data)
  const prosodyTrendData = last15
    .filter(s => s.prosodyScore)
    .map((s, i) => ({
      session: `S${i + 1}`,
      expression: s.prosodyScore!.expression,
      phrasing: s.prosodyScore!.phrasing,
      smoothness: s.prosodyScore!.smoothness,
      pace: s.prosodyScore!.pace,
    }));

  // All detected patterns across sessions
  const allPatterns = Array.from(
    new Map(
      sessions.flatMap(s => s.detectedPatterns ?? []).map(p => [p.id, p])
    ).values()
  ) as PatternResult[];

  // Most recent session prosody for radar
  const latestProsody = sessions.find(s => s.prosodyScore)?.prosodyScore as ProsodyScoreBreakdown | undefined;
  const previousProsody = sessions.filter(s => s.prosodyScore).slice(1)[0]?.prosodyScore as ProsodyScoreBreakdown | undefined;

  // Weak phonemes
  const weakPhonemes = phonemeStats
    .filter(p => p.encounterCount >= 2 && p.errorRate >= 0.3)
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 8);

  // Problem words
  const problemWords = wordStats
    .filter(w => w.errorCount > 0)
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 8);

  const avgScore = sessions.length > 0 ? sessions.reduce((a, s) => a + s.overallScore, 0) / sessions.length : 0;
  const readingLevel = computeReadingLevel(avgScore);
  const personalBests = {
    accuracy: sessions.length > 0 ? Math.max(...sessions.map(s => s.averageAccuracy)) : 0,
    wpm: sessions.length > 0 ? Math.max(...sessions.map(s => s.averageWPM)) : 0,
    stars: sessions.length > 0 ? Math.max(...sessions.map(s => s.starsEarned)) : 0,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-enter">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>My Progress</h1>
        <p className="text-gray-500 text-sm mt-0.5">Track your reading improvement over time</p>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Fraunces, serif' }}>No data yet!</h2>
          <p className="text-gray-500 mb-4">Complete your first reading practice to see your progress here.</p>
          <a href="/student/practice" className="inline-block px-6 py-3 bg-[#1B3A8C] text-white rounded-xl font-semibold hover:bg-blue-900 transition-colors">Start Practicing</a>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 card-stagger">
            <div className="bg-white rounded-2xl p-4 text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <div className="text-2xl font-bold text-[#1B3A8C]">{sessions.length}</div>
              <div className="text-xs text-gray-500">Total Sessions</div>
            </div>
            <div className="bg-white rounded-2xl p-4 text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <div className="text-2xl font-bold text-emerald-600">{Math.round(personalBests.accuracy)}%</div>
              <div className="text-xs text-gray-500">Best Accuracy</div>
            </div>
            <div className="bg-white rounded-2xl p-4 text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <div className="text-2xl font-bold text-amber-600">{personalBests.wpm}</div>
              <div className="text-xs text-gray-500">Best WPM</div>
            </div>
            <div className="bg-white rounded-2xl p-4 text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <div className="text-sm font-bold px-2 py-1 rounded-lg inline-block mb-1" style={{ background: LEVEL_BG[readingLevel], color: LEVEL_TEXT[readingLevel] }}>{readingLevel}</div>
              <div className="text-xs text-gray-500">Reading Level</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Accuracy + Weighted Accuracy Trend */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                <TrendingUp className="w-4 h-4 text-[#1B3A8C]" /> Accuracy Trend
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="accuracy" name="Accuracy" stroke="#1B3A8C" strokeWidth={2.5} dot={{ fill: '#1B3A8C', r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="weightedAcc" name="Weighted Acc." stroke="#22A06B" strokeWidth={2} strokeDasharray="4 2" dot={{ fill: '#22A06B', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* WPM + grade benchmark */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                <Zap className="w-4 h-4 text-amber-500" /> WPM Trajectory
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={wpmData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={benchmark.proficient} stroke="#22A06B" strokeDasharray="4 2" label={{ value: `Grade target ${benchmark.proficient}`, position: 'right', fill: '#22A06B', fontSize: 10 }} />
                  <ReferenceLine y={benchmark.fluent} stroke="#1B3A8C" strokeDasharray="2 4" label={{ value: `Fluent ${benchmark.fluent}`, position: 'right', fill: '#1B3A8C', fontSize: 10 }} />
                  <Bar dataKey="wpm" fill="#F5A623" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Prosody Radar (latest vs previous) */}
            {latestProsody && (
              <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                  <Activity className="w-4 h-4 text-blue-500" /> Prosody Profile
                </h2>
                <p className="text-xs text-gray-400 mb-3">Latest session vs previous</p>
                <ProsodyRadar current={latestProsody} previous={previousProsody} size="sm" />
              </div>
            )}

            {/* Difficulty Distribution */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <h2 className="font-bold text-gray-900 mb-4" style={{ fontFamily: 'Fraunces, serif' }}>Session Difficulty Mix</h2>
              {diffData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={diffData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {diffData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [v, n]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="h-48 flex items-center justify-center text-gray-300">No data</div>}
            </div>
          </div>

          {/* Error Pattern Evolution (stacked area) */}
          {errorPatternData.some(d => d.substitution + d.omission + d.insertion + d.mispronunciation + d.repetition > 0) && (
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                <AlertCircle className="w-4 h-4 text-red-400" /> Error Pattern Evolution
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={errorPatternData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="substitution" stackId="1" stroke="#F59E0B" fill="#FDE68A" name="Substitution" />
                  <Area type="monotone" dataKey="omission" stackId="1" stroke="#EF4444" fill="#FCA5A5" name="Omission" />
                  <Area type="monotone" dataKey="insertion" stackId="1" stroke="#8B5CF6" fill="#C4B5FD" name="Insertion" />
                  <Area type="monotone" dataKey="mispronunciation" stackId="1" stroke="#F59E0B" fill="#FCD34D" name="Mispronunciation" />
                  <Area type="monotone" dataKey="repetition" stackId="1" stroke="#3B82F6" fill="#BFDBFE" name="Repetition" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Prosody dimension trend */}
          {prosodyTrendData.length >= 2 && (
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                <TrendingUp className="w-4 h-4 text-purple-500" /> Prosody Dimensions Over Time
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={prosodyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="expression" stroke="#8B5CF6" strokeWidth={2} dot={false} name="Expression" />
                  <Line type="monotone" dataKey="phrasing" stroke="#1B3A8C" strokeWidth={2} dot={false} name="Phrasing" />
                  <Line type="monotone" dataKey="smoothness" stroke="#22A06B" strokeWidth={2} dot={false} name="Smoothness" />
                  <Line type="monotone" dataKey="pace" stroke="#F5A623" strokeWidth={2} dot={false} name="Pace" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Issue Frequency */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                <AlertCircle className="w-4 h-4 text-red-400" /> Common Issues
              </h2>
              {issueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={issueData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="type" type="category" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {issueData.map((_, i) => <Cell key={i} fill={ISSUE_COLORS[i % ISSUE_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-gray-400">
                  <Award className="w-8 h-8 mb-2 text-emerald-400" />
                  <p className="text-sm">No issues detected — great job!</p>
                </div>
              )}
            </div>

            {/* Behavior Patterns */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                <BookOpen className="w-4 h-4 text-blue-500" /> Reading Patterns
              </h2>
              {allPatterns.length > 0 ? (
                <PatternBadgeList patterns={allPatterns} emptyMessage="No patterns detected yet." />
              ) : (
                <div className="h-20 flex items-center justify-center text-gray-400 text-sm">
                  Complete more sessions to detect reading patterns.
                </div>
              )}
            </div>
          </div>

          {/* Phoneme weaknesses */}
          {weakPhonemes.length > 0 && (
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                🔤 Phoneme Practice Areas
              </h2>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {weakPhonemes.map(p => {
                  const rate = p.errorRate;
                  const bg = rate >= 0.6 ? 'bg-red-100 text-red-800' : rate >= 0.3 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800';
                  return (
                    <div key={p.phoneme} className={`flex flex-col items-center p-2 rounded-xl text-center ${bg}`} title={`${Math.round(p.errorRate * 100)}% error rate (${p.encounterCount} encounters)`}>
                      <span className="font-bold text-lg">/{p.phoneme}/</span>
                      <span className="text-[10px] mt-0.5">{Math.round(p.errorRate * 100)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Problem words */}
          {problemWords.length > 0 && (
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
                <Star className="w-4 h-4 text-amber-500" /> Words to Practice
              </h2>
              <div className="flex flex-wrap gap-2">
                {problemWords.map(w => (
                  <div key={w.word} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium ${w.masteryAchieved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {w.word}
                    <span className="text-xs opacity-70">{w.errorCount}×</span>
                    {w.masteryAchieved && <span title="Mastered">✅</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
