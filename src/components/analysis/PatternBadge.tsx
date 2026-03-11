'use client';

import { useState } from 'react';
import type { PatternResult, PatternSeverity } from '@/utils/diagnostics';

interface Props {
  pattern: PatternResult;
  showTooltip?: boolean;
}

const SEVERITY_STYLES: Record<PatternSeverity, {
  bg: string;
  text: string;
  border: string;
  dot: string;
}> = {
  positive: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
    dot: 'bg-emerald-500',
  },
  watch: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
    dot: 'bg-amber-500',
  },
  concern: {
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-300',
    dot: 'bg-orange-500',
  },
  high: {
    bg: 'bg-red-50',
    text: 'text-red-800',
    border: 'border-red-300',
    dot: 'bg-red-500',
  },
};

export default function PatternBadge({ pattern, showTooltip = true }: Props) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const styles = SEVERITY_STYLES[pattern.severity];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold cursor-default ${styles.bg} ${styles.text} ${styles.border}`}
        onMouseEnter={() => showTooltip && setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onFocus={() => showTooltip && setTooltipVisible(true)}
        onBlur={() => setTooltipVisible(false)}
        aria-describedby={showTooltip ? `tooltip-${pattern.id}` : undefined}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
        {pattern.label}
      </button>

      {showTooltip && tooltipVisible && (
        <div
          id={`tooltip-${pattern.id}`}
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-gray-900 text-white text-xs p-3 shadow-xl"
        >
          <p className="font-semibold mb-1">{pattern.label}</p>
          <p className="text-gray-300 mb-2">{pattern.description}</p>
          <p className="text-blue-300 font-medium">💡 {pattern.recommendation}</p>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

interface ListProps {
  patterns: PatternResult[];
  showTooltip?: boolean;
  emptyMessage?: string;
}

export function PatternBadgeList({ patterns, showTooltip = true, emptyMessage }: ListProps) {
  if (patterns.length === 0) {
    return emptyMessage ? (
      <p className="text-sm text-gray-400 italic">{emptyMessage}</p>
    ) : null;
  }

  // Sort: high → concern → watch → positive
  const order: PatternSeverity[] = ['high', 'concern', 'watch', 'positive'];
  const sorted = [...patterns].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
  );

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map(p => (
        <PatternBadge key={p.id} pattern={p} showTooltip={showTooltip} />
      ))}
    </div>
  );
}
