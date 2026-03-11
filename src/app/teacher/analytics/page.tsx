'use client';

import { useEffect, useState } from 'react';
import { getAllStudents, getAllSessions, computeAndUpdateAnalytics, Session, User } from '@/db/indexeddb';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { getAllPhonemeStats } from '@/db/indexeddb';
import { ClassPhonicsHeatmap } from '@/components/analysis/PhonicsHeatmap';
import type { PhonemeStats } from '@/db/indexeddb';

const ISSUE_LABELS: Record<string, string> = {
  omission: 'Omission', substitution: 'Substitution', insertion: 'Insertion',
  repetition: 'Repetition', hesitation: 'Hesitation', mispronunciation: 'Mispronunciation', reversal: 'Reversal',
};
const COLORS = ['#1B3A8C', '#22A06B', '#F5A623', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];
const LEVEL_COLORS: Record<string, string> = { Beginner: '#9CA3AF', Developing: '#F59E0B', Proficient: '#3B82F6', Advanced: '#10B981' };

export default function TeacherAnalytics() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAllSessions(), getAllStudents()]).then(([sess, studs]) => {
      setSessions(sess.filter(s => s.completed));
      setStudents(studs);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-64 rounded-2xl skeleton" />)}
      </div>
    </div>
  );

  // Accuracy distribution histogram
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  sessions.forEach(s => { const idx = Math.min(Math.floor(s.averageAccuracy / 10), 9); buckets[idx]++; });
  const histData = buckets.map((count, i) => ({ range: `${i * 10}–${i * 10 + 10}%`, count }));

  // Issue frequency
  const issueCounts: Record<string, number> = {};
  sessions.forEach(s => s.issues?.forEach(issue => { issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1; }));
  const issueData = Object.entries(issueCounts).map(([t, c]) => ({ type: ISSUE_LABELS[t] || t, count: c })).sort((a, b) => b.count - a.count);

  // Session volume over time (last 30 days)
  const now = Date.now();
  const dayMs = 86400000;
  const volumeMap: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    volumeMap[d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })] = 0;
  }
  sessions.forEach(s => {
    const d = new Date(s.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (d in volumeMap) volumeMap[d]++;
  });
  const volumeData = Object.entries(volumeMap).map(([date, count]) => ({ date, count }));

  // Reading level distribution
  const levelCounts: Record<string, number> = { Beginner: 0, Developing: 0, Proficient: 0, Advanced: 0 };
  students.forEach(async s => {
    const avgScore = sessions.filter(sess => sess.studentId === s.id).reduce((a, sess) => a + sess.overallScore, 0) /
      Math.max(sessions.filter(sess => sess.studentId === s.id).length, 1);
    const level = avgScore >= 85 ? 'Advanced' : avgScore >= 70 ? 'Proficient' : avgScore >= 50 ? 'Developing' : 'Beginner';
    levelCounts[level]++;
  });
  const levelData = Object.entries(levelCounts).map(([name, value]) => ({ name, value, color: LEVEL_COLORS[name] }));

  // Most missed words
  const wordCounts: Record<string, number> = {};
  sessions.forEach(s => s.issues?.filter(i => i.type === 'omission' || i.type === 'substitution').forEach(i => {
    if (i.expectedWord) wordCounts[i.expectedWord] = (wordCounts[i.expectedWord] || 0) + 1;
  }));
  const topWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word, count]) => ({ word, count }));

  // Student improvement ranking
  const improvementData = students.map(s => {
    const stuSessions = sessions.filter(x => x.studentId === s.id).reverse();
    if (stuSessions.length < 2) return null;
    const first5Avg = stuSessions.slice(0, Math.min(5, stuSessions.length)).reduce((a, x) => a + x.averageAccuracy, 0) / Math.min(5, stuSessions.length);
    const last5Avg = stuSessions.slice(-Math.min(5, stuSessions.length)).reduce((a, x) => a + x.averageAccuracy, 0) / Math.min(5, stuSessions.length);
    return { name: `${s.firstName} ${s.lastName}`, improvement: Math.round(last5Avg - first5Avg) };
  }).filter(Boolean).sort((a: any, b: any) => b.improvement - a.improvement).slice(0, 8) as any[];

  return (
    <div className="max-w-5xl mx-auto page-enter">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Class Analytics</h1>
        <p className="text-gray-500 text-sm mt-0.5">{sessions.length} total sessions · {students.length} students</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Accuracy Distribution */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <h2 className="font-bold text-gray-900 mb-4 text-sm">Accuracy Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={histData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="range" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#1B3A8C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Issue Frequency */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <h2 className="font-bold text-gray-900 mb-4 text-sm">Issue Type Frequency</h2>
          {issueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={issueData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="type" type="category" tick={{ fontSize: 9 }} width={95} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {issueData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No issue data yet</div>}
        </div>

        {/* Session Volume */}
        <div className="bg-white rounded-2xl p-5 md:col-span-2" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <h2 className="font-bold text-gray-900 mb-4 text-sm">Session Volume (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#22A06B" fill="#D1FAE5" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Reading Level Distribution */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <h2 className="font-bold text-gray-900 mb-4 text-sm">Reading Level Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={levelData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {levelData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Most Missed Words */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <h2 className="font-bold text-gray-900 mb-4 text-sm">Top Missed Words</h2>
          {topWords.length > 0 ? (
            <div className="space-y-2">
              {topWords.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div className="h-6 bg-red-400 rounded-full flex items-center px-2" style={{ width: `${(item.count / topWords[0].count) * 100}%` }}>
                      <span className="text-white text-xs font-medium">{item.word}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{item.count}×</span>
                </div>
              ))}
            </div>
          ) : <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No data</div>}
        </div>

        {/* Student Improvement */}
        {improvementData.length > 0 && (
          <div className="bg-white rounded-2xl p-5 md:col-span-2" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <h2 className="font-bold text-gray-900 mb-4 text-sm">Student Improvement Rankings</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={improvementData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="improvement" radius={[4, 4, 0, 0]}>
                  {improvementData.map((d: any, i: number) => <Cell key={i} fill={d.improvement >= 0 ? '#22A06B' : '#EF4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
