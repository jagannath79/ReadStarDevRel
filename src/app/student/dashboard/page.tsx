'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Star, Zap, Target, Clock, TrendingUp, Award, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getSessionsByStudent, computeAndUpdateAnalytics, Analytics, Session } from '@/db/indexeddb';

const BADGE_DEFINITIONS = [
  { id: 'first_session', name: 'First Steps', emoji: '🎯', desc: 'Complete your first session', check: (s: Session[], a: Analytics) => a.totalSessions >= 1 },
  { id: 'five_sessions', name: '5 Sessions', emoji: '📚', desc: 'Complete 5 reading sessions', check: (s: Session[], a: Analytics) => a.totalSessions >= 5 },
  { id: 'ten_sessions', name: 'Bookworm', emoji: '🐛', desc: 'Complete 10 reading sessions', check: (s: Session[], a: Analytics) => a.totalSessions >= 10 },
  { id: 'accuracy_90', name: 'Sharp Reader', emoji: '🎯', desc: 'Score 90%+ accuracy in a session', check: (s: Session[]) => s.some(sess => sess.averageAccuracy >= 90) },
  { id: 'speed_reader', name: 'Speed Reader', emoji: '⚡', desc: 'Average 120+ WPM in a session', check: (s: Session[]) => s.some(sess => sess.averageWPM >= 120) },
  { id: 'proficient', name: 'Proficient', emoji: '🏆', desc: 'Reach Proficient reading level', check: (s: Session[], a: Analytics) => a.readingLevel === 'Proficient' || a.readingLevel === 'Advanced' },
  { id: 'advanced', name: 'Advanced', emoji: '🌟', desc: 'Reach Advanced reading level', check: (s: Session[], a: Analytics) => a.readingLevel === 'Advanced' },
  { id: 'five_stars', name: 'Gold Star', emoji: '⭐', desc: 'Earn 5 stars in a session', check: (s: Session[]) => s.some(sess => sess.starsEarned === 5) },
];

const LEVEL_COLORS: Record<string, string> = {
  Beginner: 'bg-gray-100 text-gray-600',
  Developing: 'bg-amber-100 text-amber-700',
  Proficient: 'bg-blue-100 text-blue-700',
  Advanced: 'bg-emerald-100 text-emerald-700',
};

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-0.5">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const [sess, anal] = await Promise.all([
          getSessionsByStudent(user!.id),
          computeAndUpdateAnalytics(user!.id),
        ]);
        setSessions(sess);
        setAnalytics(anal);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  if (!user) return null;

  const completed = sessions.filter(s => s.completed);
  const recentSessions = completed.slice(0, 5);
  const unlockedBadges = BADGE_DEFINITIONS.filter(b => b.check(completed, analytics || { totalSessions: 0, averageAccuracy: 0, averageWPM: 0, totalWordsRead: 0, readingLevel: 'Beginner', issueFrequency: {}, lastUpdated: 0, studentId: user.id }));
  const lockedBadges = BADGE_DEFINITIONS.filter(b => !unlockedBadges.includes(b));

  const greetings = ['Great to see you', 'Welcome back', 'Ready to read', 'Let\'s practice'];
  const greeting = greetings[Math.floor(Date.now() / 1000 / 3600) % greetings.length];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-gray-500 text-sm">{greeting},</p>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            {user.firstName}! 👋
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {user.streak && user.streak > 0 ? (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
              <span className="text-lg">🔥</span>
              <span className="font-bold text-amber-600 text-sm">{user.streak} day streak</span>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-1.5">
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />
            <span className="font-bold text-yellow-600 text-sm">{user.totalStars || 0} stars</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 h-28 skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 card-stagger">
          <StatCard icon={BookOpen} label="Sessions" value={analytics?.totalSessions || 0} color="bg-blue-100 text-blue-600" />
          <StatCard icon={Target} label="Avg Accuracy" value={`${Math.round(analytics?.averageAccuracy || 0)}%`} color="bg-emerald-100 text-emerald-600" />
          <StatCard icon={Zap} label="Avg WPM" value={Math.round(analytics?.averageWPM || 0)} color="bg-amber-100 text-amber-600" />
          <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-purple-100 text-purple-600">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className={`inline-block text-sm font-bold px-2 py-0.5 rounded-lg mb-0.5 ${LEVEL_COLORS[analytics?.readingLevel || 'Beginner']}`}>
              {analytics?.readingLevel || 'Beginner'}
            </span>
            <div className="text-sm text-gray-500">Reading Level</div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Link
          href="/student/practice"
          className="bg-[#1B3A8C] rounded-2xl p-6 text-white flex items-center justify-between group hover:bg-blue-900 transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ boxShadow: '0 8px 24px rgba(27,58,140,0.3)' }}
        >
          <div>
            <div className="text-2xl mb-1">🎙️</div>
            <h3 className="text-lg font-bold mb-1" style={{ fontFamily: 'Fraunces, serif' }}>Start Reading Practice</h3>
            <p className="text-blue-200 text-sm">Choose your difficulty and begin!</p>
          </div>
          <ChevronRight className="w-6 h-6 opacity-60 group-hover:translate-x-1 transition-transform" />
        </Link>
        <Link
          href="/student/progress"
          className="bg-white rounded-2xl p-6 flex items-center justify-between group hover:bg-gray-50 transition-all hover:scale-[1.01] border border-gray-100"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
        >
          <div>
            <div className="text-2xl mb-1">📊</div>
            <h3 className="text-lg font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>View My Progress</h3>
            <p className="text-gray-500 text-sm">See your improvement over time</p>
          </div>
          <ChevronRight className="w-6 h-6 text-gray-400 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
            <Clock className="w-5 h-5 text-[#1B3A8C]" /> Recent Sessions
          </h2>
          {recentSessions.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📖</div>
              <p className="text-gray-400 text-sm">No sessions yet!</p>
              <p className="text-gray-400 text-xs mt-1">Start your first reading practice.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSessions.map(session => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        session.difficulty === 'simple' ? 'bg-green-100 text-green-700'
                        : session.difficulty === 'medium' ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                      }`}>
                        {session.difficulty}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(session.startedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-700 mt-0.5">
                      {Math.round(session.averageAccuracy)}% accuracy
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-0.5 justify-end">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i < session.starsEarned ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{session.averageWPM} WPM</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Achievement Badges */}
        <div className="bg-white rounded-2xl p-5 shadow-sm" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
            <Award className="w-5 h-5 text-[#F5A623]" /> Achievements
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {unlockedBadges.map(badge => (
              <div key={badge.id} className="flex flex-col items-center text-center gap-1 badge-glow" title={badge.desc}>
                <div className="text-3xl">{badge.emoji}</div>
                <div className="text-[10px] font-medium text-gray-700 leading-tight">{badge.name}</div>
              </div>
            ))}
            {lockedBadges.map(badge => (
              <div key={badge.id} className="flex flex-col items-center text-center gap-1 opacity-30 grayscale" title={`Locked: ${badge.desc}`}>
                <div className="text-3xl">{badge.emoji}</div>
                <div className="text-[10px] font-medium text-gray-500 leading-tight">{badge.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
