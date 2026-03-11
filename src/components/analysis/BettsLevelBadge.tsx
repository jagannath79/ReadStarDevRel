'use client';

import type { BettsCriteria } from '@/utils/diagnostics';

interface Props {
  level: BettsCriteria;
  size?: 'sm' | 'md' | 'lg';
  showSubLabel?: boolean;
}

const CONFIG: Record<BettsCriteria, {
  label: string;
  sublabel: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
}> = {
  independent: {
    label: 'Independent',
    sublabel: '≥ 98% accuracy',
    icon: '🌟',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
  },
  instructional: {
    label: 'Instructional',
    sublabel: '95–97% accuracy',
    icon: '📚',
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-300',
  },
  'frustration-borderline': {
    label: 'Borderline',
    sublabel: '90–94% accuracy',
    icon: '⚠️',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
  },
  frustration: {
    label: 'Frustration',
    sublabel: '< 90% accuracy',
    icon: '🔴',
    bg: 'bg-red-50',
    text: 'text-red-800',
    border: 'border-red-300',
  },
};

const SIZE_CLASSES = {
  sm: { badge: 'px-2 py-0.5 text-xs gap-1', icon: 'text-sm' },
  md: { badge: 'px-3 py-1 text-sm gap-1.5', icon: 'text-base' },
  lg: { badge: 'px-4 py-2 text-base gap-2', icon: 'text-xl' },
};

export default function BettsLevelBadge({ level, size = 'md', showSubLabel = false }: Props) {
  const cfg = CONFIG[level];
  const sz = SIZE_CLASSES[size];

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center font-semibold rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border} ${sz.badge}`}
      >
        <span className={sz.icon}>{cfg.icon}</span>
        {cfg.label}
      </span>
      {showSubLabel && (
        <span className={`text-xs ${cfg.text} opacity-70 pl-1`}>{cfg.sublabel}</span>
      )}
    </div>
  );
}

export function BettsLevelDescription({ level }: { level: BettsCriteria }) {
  const descriptions: Record<BettsCriteria, string> = {
    independent: 'Student can read this text independently with minimal support.',
    instructional: 'Text is at the ideal teaching level — some support needed.',
    'frustration-borderline': 'Text is slightly challenging — close monitoring recommended.',
    frustration: 'Text is too difficult — consider easier material or extra support.',
  };
  return (
    <p className="text-sm text-gray-600 italic">{descriptions[level]}</p>
  );
}
