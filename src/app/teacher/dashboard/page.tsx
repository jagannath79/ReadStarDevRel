'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Users, BookOpen, Target, AlertTriangle, ChevronRight, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getAllStudents, getAllSessions, getSessionsToday, Session, User, computeAndUpdateAnalytics } from '@/db/indexeddb';

function StatCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

const DIFF_COLORS: Record<string, string> = {
  simple: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  complex: 'bg-red-100 text-red-700',
};

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [students, setStudents] = useState<User[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<{ studentId: string; name: string; type: string }[]>([]);

  const load = useCallback(async () => {
    const [studs, allSess, todaySess] = await Promise.all([
      getAllStudents(),
      getAllSessions(),
      getSessionsToday(),
    ]);
    setStudents(studs);
    setAllSessions(allSess);
    setTodaySessions(todaySess);

    // Build alerts
    const now = Date.now();
    const alertList: { studentId: string; name: string; type: string }[] = [];
    for (const s of studs) {
      const sess = allSess.filter(x => x.studentId === s.id && x.completed);
      const recent3 = sess.slice(0, 3);
      const daysSinceActive = (now - s.lastActive) / (1000 * 60 * 60 * 24);

      if (daysSinceActive >= 3 && sess.length > 0) {
        alertList.push({ studentId: s.id, name: `${s.firstName} ${s.lastName}`, type: `Inactive for ${Math.floor(daysSinceActive)} days` });
      }
      if (recent3.length === 3) {
        const avgAccuracy = recent3.reduce((a, x) => a + x.averageAccuracy, 0) / 3;
        if (avgAccuracy < 60) {
          alertList.push({ studentId: s.id, name: `${s.firstName} ${s.lastName}`, type: 'Below 60% accuracy in last 3 sessions' });
        }
        if (recent3.length >= 2) {
          const drop = recent3[1].averageAccuracy - recent3[0].averageAccuracy;
          if (drop > 15) {
            alertList.push({ studentId: s.id, name: `${s.firstName} ${s.lastName}`, type: `Accuracy dropped ${Math.round(drop)}%` });
          }
        }
      }
    }
    setAlerts(alertList.slice(0, 5));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  const completedToday = todaySessions.length;
  const avgClassAccuracy = allSessions.length > 0
    ? Math.round(allSessions.filter(s => s.completed).reduce((a, s) => a + s.averageAccuracy, 0) / Math.max(allSessions.filter(s => s.completed).length, 1))
    : 0;
  const needsAttention = alerts.filter((a, i, arr) => arr.findIndex(x => x.studentId === a.studentId) === i).length;

  const recentSessions = allSessions.filter(s => s.completed).slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          Teacher Dashboard
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl skeleton" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 card-stagger">
          <StatCard icon={Users} label="Total Students" value={students.length} color="bg-blue-100 text-blue-600" />
          <StatCard icon={BookOpen} label="Sessions Today" value={completedToday} color="bg-emerald-100 text-emerald-600" />
          <StatCard icon={Target} label="Class Avg Accuracy" value={`${avgClassAccuracy}%`} color="bg-amber-100 text-amber-600" />
          <StatCard icon={AlertTriangle} label="Needs Attention" value={needsAttention} color="bg-red-100 text-red-600" sub="Below 60% accuracy" />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Alerts */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
            <AlertTriangle className="w-5 h-5 text-amber-500" /> Alerts
          </h2>
          {alerts.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-gray-400 text-sm">All students are on track!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, i) => (
                <Link key={i} href={`/teacher/students/${alert.studentId}`} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{alert.name}</div>
                    <div className="text-xs text-amber-700 mt-0.5">{alert.type}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-500" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
              <Clock className="w-5 h-5 text-[#22A06B]" /> Recent Activity
            </h2>
            <Link href="/teacher/students" className="text-xs text-[#22A06B] font-medium hover:underline">View all</Link>
          </div>
          {recentSessions.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-gray-400 text-sm">No sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentSessions.map(session => {
                const student = students.find(s => s.id === session.studentId);
                return (
                  <Link key={session.id} href={`/teacher/students/${session.studentId}`} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs flex-shrink-0">
                        {student?.firstName?.[0]}{student?.lastName?.[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{student?.firstName} {student?.lastName}</div>
                        <div className="text-xs text-gray-400">{new Date(session.startedAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFF_COLORS[session.difficulty]}`}>{session.difficulty}</span>
                      <div>
                        <div className="text-sm font-bold text-gray-900">{Math.round(session.averageAccuracy)}%</div>
                        <div className="text-xs text-gray-400">{session.averageWPM} WPM</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {[
          { href: '/teacher/students', label: 'Student Roster', icon: '👥', desc: 'Manage students' },
          { href: '/teacher/analytics', label: 'Class Analytics', icon: '📊', desc: 'View class data' },
          { href: '/teacher/recordings', label: 'Recordings', icon: '🎙️', desc: 'Listen to sessions' },
          { href: '/teacher/sentences', label: 'Sentence Bank', icon: '📝', desc: 'Manage content' },
        ].map(item => (
          <Link key={item.href} href={item.href} className="bg-white rounded-2xl p-4 flex items-center gap-3 hover:bg-emerald-50 transition-colors" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <span className="text-2xl">{item.icon}</span>
            <div>
              <div className="font-semibold text-gray-900 text-sm">{item.label}</div>
              <div className="text-xs text-gray-400">{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
