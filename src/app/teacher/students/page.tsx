'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, UserPlus, Download, ChevronRight, Filter } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getAllStudents, getSessionsByStudent, computeAndUpdateAnalytics, User, Analytics } from '@/db/indexeddb';
import { useToast } from '@/components/shared/Toast';
import AddStudentModal from '@/components/teacher/AddStudentModal';

const LEVEL_BADGE: Record<string, string> = {
  Beginner: 'bg-gray-100 text-gray-600',
  Developing: 'bg-amber-100 text-amber-700',
  Proficient: 'bg-blue-100 text-blue-700',
  Advanced: 'bg-emerald-100 text-emerald-700',
};

interface StudentRow extends User {
  analytics: Analytics | null;
  sessionCount: number;
}

export default function TeacherStudents() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const studs = await getAllStudents();
    const rows: StudentRow[] = await Promise.all(
      studs.map(async s => {
        const sessions = await getSessionsByStudent(s.id);
        const analytics = await computeAndUpdateAnalytics(s.id);
        return { ...s, analytics, sessionCount: sessions.filter(x => x.completed).length };
      })
    );
    setStudents(rows.sort((a, b) => b.lastActive - a.lastActive));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = students.filter(s => {
    const name = `${s.firstName} ${s.lastName} ${s.username}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase());
    const now = Date.now();
    const daysSince = (now - s.lastActive) / (1000 * 60 * 60 * 24);
    if (filter === 'active') return matchSearch && daysSince < 3;
    if (filter === 'inactive') return matchSearch && daysSince >= 3;
    if (filter === 'attention') return matchSearch && (s.analytics?.averageAccuracy || 0) < 60 && s.sessionCount > 0;
    return matchSearch;
  });

  const exportCSV = () => {
    const header = 'Name,Username,Email,Grade,Sessions,Avg Accuracy,Avg WPM,Reading Level,Last Active';
    const rows = students.map(s =>
      `"${s.firstName} ${s.lastName}","${s.username}","${s.email}",${s.grade || ''},${s.sessionCount},${Math.round(s.analytics?.averageAccuracy || 0)}%,${s.analytics?.averageWPM || 0},"${s.analytics?.readingLevel || 'Beginner'}","${new Date(s.lastActive).toLocaleDateString()}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'readstar-roster.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('Roster exported!', 'success');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Student Roster</h1>
          <p className="text-gray-500 text-sm mt-0.5">{students.length} students enrolled</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#22A06B] text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
            <UserPlus className="w-4 h-4" /> Add Student
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search students..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          {['all', 'active', 'inactive', 'attention'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 rounded-xl text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-[#22A06B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {f === 'attention' ? 'Needs Help' : f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-2xl skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div className="text-4xl mb-2">👥</div>
          <p className="text-gray-400">No students found.</p>
          <button onClick={() => setShowAdd(true)} className="mt-4 px-6 py-2.5 bg-[#22A06B] text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors">
            Add First Student
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <span>Student</span>
            <span className="hidden md:block">Grade</span>
            <span className="hidden md:block">Sessions</span>
            <span>Accuracy</span>
            <span className="hidden md:block">WPM</span>
            <span>Level</span>
            <span></span>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map(student => {
              const daysSince = (Date.now() - student.lastActive) / (1000 * 60 * 60 * 24);
              const isActive = daysSince < 3;
              return (
                <Link key={student.id} href={`/teacher/students/${student.id}`} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-4 items-center px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs flex-shrink-0">
                      {student.firstName[0]}{student.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">{student.firstName} {student.lastName}</div>
                      <div className="text-xs text-gray-400 truncate">@{student.username}</div>
                    </div>
                  </div>
                  <span className="hidden md:block text-sm text-gray-600">{student.grade ? `G${student.grade}` : '—'}</span>
                  <span className="hidden md:block text-sm text-gray-600">{student.sessionCount}</span>
                  <span className="text-sm font-medium text-gray-900">{Math.round(student.analytics?.averageAccuracy || 0)}%</span>
                  <span className="hidden md:block text-sm text-gray-600">{student.analytics?.averageWPM || 0}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${LEVEL_BADGE[student.analytics?.readingLevel || 'Beginner']}`}>
                    {student.analytics?.readingLevel || 'Beginner'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {showAdd && <AddStudentModal onClose={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}
