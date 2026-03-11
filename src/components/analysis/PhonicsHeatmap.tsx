'use client';

import type { PhonemeStats } from '@/db/indexeddb';

interface Props {
  phonemeStats: PhonemeStats[];
  showLegend?: boolean;
  title?: string;
}

// Phoneme categories displayed in the heatmap
const PHONEME_CATEGORIES: { label: string; items: string[] }[] = [
  {
    label: 'Short Vowels',
    items: ['a', 'e', 'i', 'o', 'u'],
  },
  {
    label: 'Long Vowels',
    items: ['ay', 'ee', 'ie', 'oe', 'ue'],
  },
  {
    label: 'Digraphs',
    items: ['ch', 'sh', 'th', 'wh', 'ph', 'ng', 'nk', 'ck'],
  },
  {
    label: 'Consonant Blends',
    items: ['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw'],
  },
  {
    label: 'Triple Blends',
    items: ['str', 'spr', 'scr', 'spl', 'squ'],
  },
  {
    label: 'Initial Consonants',
    items: ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z'],
  },
];

// Error rate thresholds → color class
function getColorClass(errorRate: number, encounterCount: number): {
  bg: string;
  text: string;
  label: string;
} {
  if (encounterCount === 0) return { bg: 'bg-gray-100', text: 'text-gray-400', label: 'No data' };
  if (errorRate < 0.1) return { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Mastered' };
  if (errorRate < 0.3) return { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Developing' };
  if (errorRate < 0.6) return { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Needs Practice' };
  return { bg: 'bg-red-100', text: 'text-red-800', label: 'Struggling' };
}

interface CellStats {
  encounterCount: number;
  errorRate: number;
}

export default function PhonicsHeatmap({ phonemeStats, showLegend = true, title }: Props) {
  // Build lookup map: phoneme → stats
  const statsMap = new Map<string, CellStats>(
    phonemeStats.map(s => [s.phoneme, { encounterCount: s.encounterCount, errorRate: s.errorRate }]),
  );

  return (
    <div className="space-y-4">
      {title && <h3 className="text-base font-bold text-gray-800">{title}</h3>}

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap gap-3">
          {[
            { color: 'bg-emerald-100 text-emerald-800', label: 'Mastered (< 10%)' },
            { color: 'bg-yellow-100 text-yellow-800',   label: 'Developing (10–30%)' },
            { color: 'bg-orange-100 text-orange-800',   label: 'Needs Practice (30–60%)' },
            { color: 'bg-red-100 text-red-800',         label: 'Struggling (> 60%)' },
            { color: 'bg-gray-100 text-gray-400',       label: 'No data' },
          ].map(item => (
            <span key={item.label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${item.color}`}>
              <span className={`w-2 h-2 rounded-full ${item.color.split(' ')[0]}`} />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {/* Category grids */}
      <div className="space-y-4">
        {PHONEME_CATEGORIES.map(cat => (
          <div key={cat.label}>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{cat.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {cat.items.map(phoneme => {
                const stats = statsMap.get(phoneme) ?? { encounterCount: 0, errorRate: 0 };
                const { bg, text, label } = getColorClass(stats.errorRate, stats.encounterCount);
                return (
                  <div
                    key={phoneme}
                    className={`relative group flex items-center justify-center rounded-lg border font-bold text-sm cursor-default select-none transition-all w-10 h-10 ${bg} ${text} border-transparent hover:border-gray-400 hover:shadow-sm`}
                    title={`/${phoneme}/ — ${label}${stats.encounterCount > 0 ? ` (${Math.round(stats.errorRate * 100)}% error rate, ${stats.encounterCount} encounters)` : ''}`}
                  >
                    {phoneme}
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 hidden group-hover:block w-36 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-xl pointer-events-none text-center">
                      <p className="font-bold mb-0.5">/{phoneme}/</p>
                      <p className={`font-semibold ${
                        stats.encounterCount === 0 ? 'text-gray-400' :
                        stats.errorRate < 0.1 ? 'text-emerald-400' :
                        stats.errorRate < 0.3 ? 'text-yellow-400' :
                        stats.errorRate < 0.6 ? 'text-orange-400' : 'text-red-400'
                      }`}>{label}</p>
                      {stats.encounterCount > 0 && (
                        <p className="text-gray-400 mt-0.5">{Math.round(stats.errorRate * 100)}% errors · {stats.encounterCount}×</p>
                      )}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact class-wide version: aggregates multiple students' phoneme stats */
interface ClassPhonicsProps {
  allStudentStats: PhonemeStats[][];
  showLegend?: boolean;
}

export function ClassPhonicsHeatmap({ allStudentStats, showLegend = true }: ClassPhonicsProps) {
  // Aggregate across all students
  const aggregated = new Map<string, { total: number; errors: number }>();
  for (const studentStats of allStudentStats) {
    for (const ps of studentStats) {
      const existing = aggregated.get(ps.phoneme) ?? { total: 0, errors: 0 };
      aggregated.set(ps.phoneme, {
        total: existing.total + ps.encounterCount,
        errors: existing.errors + ps.errorCount,
      });
    }
  }

  const classStats: PhonemeStats[] = Array.from(aggregated.entries()).map(([phoneme, { total, errors }]) => ({
    id: `class:${phoneme}`,
    studentId: 'class',
    phoneme,
    encounterCount: total,
    errorCount: errors,
    errorRate: total > 0 ? errors / total : 0,
    lastUpdated: Date.now(),
  }));

  return <PhonicsHeatmap phonemeStats={classStats} showLegend={showLegend} title="Class Phonics Profile" />;
}
