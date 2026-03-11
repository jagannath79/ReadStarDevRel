'use client';

import { useState } from 'react';
import type { Miscue, MiscuePrimaryType } from '@/utils/diagnostics';
import type { PauseInfo } from '@/utils/acousticAnalysis';

interface Props {
  expectedText: string;
  transcript: string;
  miscues: Miscue[];
  pauseMap?: PauseInfo[];
  showPauseMarkers?: boolean;
}

// Color config per primary error type
const TYPE_STYLES: Record<MiscuePrimaryType, { bg: string; text: string; underline: string; label: string }> = {
  substitution:    { bg: 'bg-orange-100', text: 'text-orange-800', underline: 'decoration-orange-400', label: 'SUB' },
  omission:        { bg: 'bg-red-100',    text: 'text-red-800',    underline: 'decoration-red-400',    label: 'OMI' },
  insertion:       { bg: 'bg-purple-100', text: 'text-purple-800', underline: 'decoration-purple-400', label: 'INS' },
  repetition:      { bg: 'bg-blue-100',   text: 'text-blue-800',   underline: 'decoration-blue-400',   label: 'REP' },
  mispronunciation:{ bg: 'bg-yellow-100', text: 'text-yellow-800', underline: 'decoration-yellow-400', label: 'MIS' },
  reversal:        { bg: 'bg-pink-100',   text: 'text-pink-800',   underline: 'decoration-pink-400',   label: 'REV' },
  'self-correction':{ bg: 'bg-emerald-100', text: 'text-emerald-800', underline: 'decoration-emerald-400', label: 'SC' },
};

const PAUSE_MARKER: Record<PauseInfo['type'], { symbol: string; color: string; title: string }> = {
  micro:      { symbol: '·',  color: 'text-gray-300', title: 'Micro-pause' },
  hesitation: { symbol: '|',  color: 'text-amber-400', title: 'Hesitation pause' },
  extended:   { symbol: '‖',  color: 'text-orange-500', title: 'Extended pause' },
  breakdown:  { symbol: '⏸', color: 'text-red-600', title: 'Breakdown pause' },
};

interface WordAnnotation {
  word: string;
  position: number;
  miscue?: Miscue;
  omitted?: boolean;
}

function buildAnnotations(expectedText: string, miscues: Miscue[]): WordAnnotation[] {
  const words = expectedText.split(/\s+/).filter(Boolean);
  const miscueByPos = new Map<number, Miscue>();
  const omittedPositions = new Set<number>();

  for (const m of miscues) {
    if (m.primaryType === 'omission') {
      omittedPositions.add(m.position);
    } else {
      miscueByPos.set(m.position, m);
    }
  }

  return words.map((word, i) => ({
    word,
    position: i,
    miscue: miscueByPos.get(i),
    omitted: omittedPositions.has(i),
  }));
}

interface TooltipState {
  x: number;
  y: number;
  miscue: Miscue;
}

export default function TranscriptAnnotator({
  expectedText,
  transcript,
  miscues,
  pauseMap = [],
  showPauseMarkers = true,
}: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const annotations = buildAnnotations(expectedText, miscues);
  const wordCount = annotations.length;

  // Map pauses to approximate word positions
  const pausesByPosition = new Map<number, PauseInfo[]>();
  for (const p of pauseMap) {
    if (wordCount > 0) {
      // rough: map pause startMs to word position by proportion
      // We don't have actual word timings here, so we approximate
      const pos = Math.floor((p.startMs / Math.max(...pauseMap.map(x => x.endMs), 1)) * wordCount);
      const existing = pausesByPosition.get(pos) ?? [];
      pausesByPosition.set(pos, [...existing, p]);
    }
  }

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        {Object.entries(TYPE_STYLES).map(([type, styles]) => (
          <span key={type} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${styles.bg} ${styles.text}`}>
            <span className="font-mono text-[10px]">{styles.label}</span>
            {type.replace('-', ' ')}
          </span>
        ))}
        {showPauseMarkers && (
          <>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-amber-600">
              | hesitation
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-red-600">
              ⏸ breakdown
            </span>
          </>
        )}
      </div>

      {/* Annotated text */}
      <div
        className="text-base leading-loose font-medium text-gray-800 select-none"
        onMouseLeave={() => setTooltip(null)}
      >
        {annotations.map((ann, i) => {
          const pauses = showPauseMarkers ? (pausesByPosition.get(i) ?? []) : [];
          const dominantPause = pauses.reduce<PauseInfo | null>((best, p) => {
            if (!best) return p;
            const order = ['micro', 'hesitation', 'extended', 'breakdown'] as const;
            return order.indexOf(p.type) > order.indexOf(best.type) ? p : best;
          }, null);

          return (
            <span key={i} className="inline-flex items-baseline gap-0">
              {/* Pause marker before word */}
              {dominantPause && (
                <span
                  className={`mx-1 text-lg font-light ${PAUSE_MARKER[dominantPause.type].color}`}
                  title={`${PAUSE_MARKER[dominantPause.type].title} (${dominantPause.duration}ms)`}
                >
                  {PAUSE_MARKER[dominantPause.type].symbol}
                </span>
              )}

              {/* Word */}
              {ann.omitted ? (
                // Omitted word: show expected word struck out/grayed
                <span
                  className="mx-0.5 px-1 py-0.5 rounded bg-red-50 text-red-400 line-through text-sm"
                  title="Omitted word"
                >
                  {ann.word}
                </span>
              ) : ann.miscue ? (
                <span
                  className={`mx-0.5 px-1 py-0.5 rounded cursor-pointer underline decoration-2 ${TYPE_STYLES[ann.miscue.primaryType].bg} ${TYPE_STYLES[ann.miscue.primaryType].text} ${TYPE_STYLES[ann.miscue.primaryType].underline}`}
                  onMouseEnter={e => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setTooltip({ x: rect.left, y: rect.top, miscue: ann.miscue! });
                  }}
                  role="mark"
                  aria-label={`${ann.miscue.primaryType}: expected "${ann.miscue.expectedWord}", said "${ann.miscue.spokenWord}"`}
                >
                  {ann.miscue.spokenWord || ann.word}
                  <sup className="text-[9px] ml-0.5 font-bold opacity-70">
                    {TYPE_STYLES[ann.miscue.primaryType].label}
                  </sup>
                </span>
              ) : (
                <span className="mx-0.5">{ann.word}</span>
              )}{' '}
            </span>
          );
        })}
      </div>

      {/* Transcript line */}
      {transcript && (
        <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-500 border border-gray-200">
          <span className="font-semibold text-gray-700">Transcript: </span>
          {transcript}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 w-56 rounded-xl bg-gray-900 text-white text-xs p-3 shadow-2xl pointer-events-none"
          style={{ top: tooltip.y - 120, left: tooltip.x }}
        >
          <p className="font-bold text-sm mb-1 capitalize">{tooltip.miscue.primaryType}</p>
          <div className="space-y-0.5 text-gray-300">
            <p>Expected: <span className="text-white font-medium">"{tooltip.miscue.expectedWord}"</span></p>
            {tooltip.miscue.spokenWord && (
              <p>Said: <span className="text-orange-300 font-medium">"{tooltip.miscue.spokenWord}"</span></p>
            )}
            <p>Type: <span className="text-blue-300">{tooltip.miscue.subtype.replace(/_/g, ' ')}</span></p>
            <p>Syntactic: <span className="text-yellow-300">{tooltip.miscue.syntacticAcceptable}</span></p>
            <p>Semantic: <span className="text-yellow-300">{tooltip.miscue.semanticAcceptable}</span></p>
            <p>Meaning changed: <span className={tooltip.miscue.meaningChanged ? 'text-red-400' : 'text-emerald-400'}>
              {tooltip.miscue.meaningChanged ? 'Yes' : 'No'}
            </span></p>
            <p>Weight: <span className="text-white font-semibold">{tooltip.miscue.weight.toFixed(1)}</span></p>
          </div>
        </div>
      )}
    </div>
  );
}
