'use client';

import { useEffect, useState } from 'react';
import { Search, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { getAllRecordings, getAllStudents, getAllSessions, getSentenceById, type Recording, type Session } from '@/db/indexeddb';
import { AudioPlayer } from '@/components/shared/AudioPlayer';
import WaveformPlayer from '@/components/analysis/WaveformPlayer';
import BettsLevelBadge from '@/components/analysis/BettsLevelBadge';
import { FluencyLevelInline } from '@/components/analysis/FluencyLevelGauge';
import { PatternBadgeList } from '@/components/analysis/PatternBadge';
import MiscueTable from '@/components/analysis/MiscueTable';

interface RecordingRow extends Recording {
  studentName: string;
  sessionDifficulty: string;
  accuracy: number;
  sentenceText: string;
}

export default function TeacherRecordings() {
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterDiff, setFilterDiff] = useState<string>('all');

  useEffect(() => {
    async function load() {
      const [recs, students, sessions] = await Promise.all([getAllRecordings(), getAllStudents(), getAllSessions()]);
      const studentMap = new Map(students.map(s => [s.id, `${s.firstName} ${s.lastName}`]));
      const sessionMap = new Map(sessions.map(s => [s.id, s]));

      const enriched = await Promise.all(recs.map(async rec => {
        const session = sessionMap.get(rec.sessionId);
        const scoreEntry = session?.scores?.find(sc => sc.sentenceId === rec.sentenceId);
        const sentence = await getSentenceById(rec.sentenceId).catch(() => null);
        return {
          ...rec,
          studentName: studentMap.get(rec.studentId) || 'Unknown',
          sessionDifficulty: session?.difficulty || '',
          accuracy: scoreEntry ? Math.round(scoreEntry.accuracyScore) : 0,
          sentenceText: sentence?.text || rec.transcript || '',
        };
      }));

      setRows(enriched);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = rows.filter(r => {
    const matchesSearch = r.studentName.toLowerCase().includes(search.toLowerCase()) ||
      r.sentenceText.toLowerCase().includes(search.toLowerCase());
    const matchesDiff = filterDiff === 'all' || r.sessionDifficulty === filterDiff;
    return matchesSearch && matchesDiff;
  });

  const downloadRecording = (rec: RecordingRow) => {
    const url = URL.createObjectURL(rec.audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `readstar-${rec.studentName.replace(' ', '-')}-${new Date(rec.createdAt).toISOString().slice(0, 10)}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto page-enter">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Recordings Library</h1>
        <p className="text-gray-500 text-sm mt-0.5">{rows.length} recordings stored</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by student name or sentence..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 bg-white" />
        </div>
        <select value={filterDiff} onChange={e => setFilterDiff(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 bg-white">
          <option value="all">All difficulties</option>
          <option value="simple">Simple</option>
          <option value="medium">Medium</option>
          <option value="complex">Complex</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div className="text-4xl mb-2">🎙️</div>
          <p className="text-gray-400">No recordings found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div className="divide-y divide-gray-50">
            {filtered.map(rec => {
              const isExpanded = expandedId === rec.id;
              const hasDiagnostics = (rec.miscues && rec.miscues.length > 0) ||
                (rec.waveformSamples && rec.waveformSamples.length > 0) ||
                rec.bettsCriteria || rec.fluencyLevel;

              return (
                <div key={rec.id}>
                  {/* Row header */}
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-gray-900 text-sm">{rec.studentName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rec.sessionDifficulty === 'simple' ? 'bg-green-100 text-green-700' : rec.sessionDifficulty === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {rec.sessionDifficulty}
                          </span>
                          <span className="text-xs text-gray-400">{new Date(rec.createdAt).toLocaleDateString()}</span>
                          <span className="text-xs font-semibold text-emerald-600">{rec.accuracy}%</span>
                          {rec.bettsCriteria && <BettsLevelBadge level={rec.bettsCriteria} size="sm" />}
                          {rec.fluencyLevel && <FluencyLevelInline level={rec.fluencyLevel} />}
                        </div>
                        <p className="text-gray-500 text-xs truncate mb-2">{rec.sentenceText}</p>

                        {/* Waveform player (replaces plain AudioPlayer if waveform data available) */}
                        {rec.waveformSamples && rec.waveformSamples.length > 0 ? (
                          <WaveformPlayer
                            audioBlob={rec.audioBlob}
                            waveformSamples={rec.waveformSamples}
                            pauseMap={rec.pauseMap}
                            durationMs={rec.duration * 1000}
                            height={60}
                          />
                        ) : (
                          <AudioPlayer audioBlob={rec.audioBlob} />
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {hasDiagnostics && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-xs hover:bg-gray-50 transition-colors"
                          >
                            {isExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> Less</> : <><ChevronDown className="w-3.5 h-3.5" /> Analysis</>}
                          </button>
                        )}
                        <button onClick={() => downloadRecording(rec)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-xs hover:bg-gray-50 transition-colors"
                          aria-label="Download recording">
                          <Download className="w-3.5 h-3.5" /> .webm
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded diagnostics panel */}
                  {isExpanded && hasDiagnostics && (
                    <div className="px-5 pb-5 border-t border-gray-50 bg-gray-50/50">
                      <div className="pt-4 space-y-4">
                        {/* Acoustic metrics */}
                        {rec.speechRateMetrics && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Acoustic Analysis</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              {[
                                { label: 'Speech Rate', value: `${rec.speechRateMetrics.speechRate} WPM` },
                                { label: 'Articulation', value: `${rec.speechRateMetrics.articulationRate} WPM` },
                                { label: 'Phonation', value: `${Math.round(rec.speechRateMetrics.phonationRatio * 100)}%` },
                                { label: 'Syllable Rate', value: `${rec.speechRateMetrics.syllableRate}/s` },
                              ].map(m => (
                                <div key={m.label} className="bg-white rounded-lg p-2 border border-gray-100">
                                  <div className="font-bold text-gray-800">{m.value}</div>
                                  <div className="text-gray-400">{m.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Prosody scores */}
                        {rec.prosodyScore && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Prosody Scores</p>
                            <div className="grid grid-cols-5 gap-2 text-xs text-center">
                              {(['expression', 'phrasing', 'smoothness', 'pace', 'composite'] as const).map(k => (
                                <div key={k} className={`rounded-lg p-2 border ${k === 'composite' ? 'bg-[#1B3A8C] text-white border-blue-700' : 'bg-white border-gray-100'}`}>
                                  <div className={`font-bold ${k === 'composite' ? 'text-white' : 'text-gray-800'}`}>{rec.prosodyScore![k]}</div>
                                  <div className={`text-[10px] capitalize ${k === 'composite' ? 'text-blue-200' : 'text-gray-400'}`}>{k}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Miscue table */}
                        {rec.miscues && rec.miscues.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Miscue Analysis</p>
                            <MiscueTable miscues={rec.miscues} showExport={false} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
