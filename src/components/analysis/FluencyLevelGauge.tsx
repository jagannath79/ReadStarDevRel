'use client';

import type { NAEPFluencyLevel } from '@/utils/diagnostics';

interface Props {
  level: NAEPFluencyLevel;
  showNAEP?: boolean;
  className?: string;
}

const LEVELS: {
  level: NAEPFluencyLevel;
  label: string;
  description: string;
  color: string;
  bg: string;
}[] = [
  {
    level: 1,
    label: 'Level 1',
    description: 'Word-by-word, laboured',
    color: '#ef4444',
    bg: 'bg-red-500',
  },
  {
    level: 2,
    label: 'Level 2',
    description: 'Two-word phrases, some expressiveness',
    color: '#f59e0b',
    bg: 'bg-amber-500',
  },
  {
    level: 3,
    label: 'Level 3',
    description: 'Phrase groupings, mostly appropriate pace',
    color: '#3b82f6',
    bg: 'bg-blue-500',
  },
  {
    level: 4,
    label: 'Level 4',
    description: 'Fluent, expressive, appropriate pace',
    color: '#22c55e',
    bg: 'bg-emerald-500',
  },
];

export default function FluencyLevelGauge({ level, showNAEP = true, className = '' }: Props) {
  const current = LEVELS.find(l => l.level === level)!;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {showNAEP && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            NAEP Fluency Scale
          </span>
        </div>
      )}

      {/* Segmented gauge bar */}
      <div className="flex items-center gap-1">
        {LEVELS.map(l => (
          <div
            key={l.level}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <div
              className={`h-4 rounded-sm transition-all duration-300 ${
                l.level <= level ? l.bg : 'bg-gray-200'
              } ${l.level === level ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
            />
            <span
              className={`text-[10px] font-bold ${
                l.level === level ? 'text-gray-800' : 'text-gray-400'
              }`}
            >
              {l.level}
            </span>
          </div>
        ))}
      </div>

      {/* Current level label */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: current.color }}
        />
        <div>
          <span className="text-sm font-bold text-gray-800">{current.label}</span>
          <span className="text-sm text-gray-500 ml-1">— {current.description}</span>
        </div>
      </div>
    </div>
  );
}

export function FluencyLevelInline({ level }: { level: NAEPFluencyLevel }) {
  const colors: Record<NAEPFluencyLevel, string> = {
    1: 'bg-red-100 text-red-700 border-red-200',
    2: 'bg-amber-100 text-amber-700 border-amber-200',
    3: 'bg-blue-100 text-blue-700 border-blue-200',
    4: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${colors[level]}`}>
      NAEP {level}
    </span>
  );
}
