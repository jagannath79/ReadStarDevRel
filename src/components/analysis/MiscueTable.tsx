'use client';

import { useState, useMemo } from 'react';
import type { Miscue, MiscuePrimaryType } from '@/utils/diagnostics';

interface Props {
  miscues: Miscue[];
  showExport?: boolean;
  studentName?: string;
  sessionDate?: string;
}

type SortKey = 'position' | 'primaryType' | 'weight' | 'expectedWord' | 'subtype';
type SortDir = 'asc' | 'desc';

const TYPE_COLORS: Record<MiscuePrimaryType, string> = {
  substitution:    'bg-orange-100 text-orange-700',
  omission:        'bg-red-100 text-red-700',
  insertion:       'bg-purple-100 text-purple-700',
  repetition:      'bg-blue-100 text-blue-700',
  mispronunciation:'bg-yellow-100 text-yellow-700',
  reversal:        'bg-pink-100 text-pink-700',
  'self-correction':'bg-emerald-100 text-emerald-700',
};

const WEIGHT_COLOR = (w: number) => {
  if (w <= 0) return 'text-emerald-600 font-bold';
  if (w < 0.5) return 'text-amber-600';
  if (w < 1.0) return 'text-orange-600 font-semibold';
  return 'text-red-600 font-bold';
};

const ACCEPT_COLOR = (v: string) => {
  if (v === 'yes') return 'text-emerald-600';
  if (v === 'partial') return 'text-amber-600';
  return 'text-red-600';
};

function exportCSV(miscues: Miscue[], studentName?: string, sessionDate?: string) {
  const headers = ['#', 'Position', 'Expected', 'Said', 'Primary Type', 'Subtype',
    'Syntactic', 'Semantic', 'Meaning Changed', 'Weight'];
  const rows = miscues.map((m, i) => [
    i + 1,
    m.position,
    m.expectedWord,
    m.spokenWord,
    m.primaryType,
    m.subtype,
    m.syntacticAcceptable,
    m.semanticAcceptable,
    m.meaningChanged ? 'Yes' : 'No',
    m.weight.toFixed(2),
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const name = studentName ?? 'student';
  const date = sessionDate ?? new Date().toISOString().split('T')[0];
  a.download = `miscue-analysis-${name}-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MiscueTable({ miscues, showExport = true, studentName, sessionDate }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');

  const primaryTypes = useMemo(
    () => Array.from(new Set(miscues.map(m => m.primaryType))).sort(),
    [miscues],
  );

  const sorted = useMemo(() => {
    let filtered = miscues.filter(m => {
      if (filterType !== 'all' && m.primaryType !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return m.expectedWord.includes(q) || m.spokenWord.includes(q) || m.subtype.toLowerCase().includes(q);
      }
      return true;
    });
    filtered = [...filtered].sort((a, b) => {
      let va: string | number = a[sortKey] as string | number;
      let vb: string | number = b[sortKey] as string | number;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return filtered;
  }, [miscues, sortKey, sortDir, filterType, search]);

  const totalWeight = sorted.reduce((s, m) => s + m.weight, 0);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-1 text-gray-400 text-xs">
      {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  if (miscues.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-3xl mb-2">✅</p>
        <p className="font-medium">No miscues recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search words…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="all">All types</option>
          {primaryTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className="flex-1" />

        <span className="text-sm text-gray-500">
          {sorted.length} / {miscues.length} miscues
          {' · '}<span className={WEIGHT_COLOR(totalWeight)}>Σ weight: {totalWeight.toFixed(1)}</span>
        </span>

        {showExport && (
          <button
            onClick={() => exportCSV(sorted, studentName, sessionDate)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            ⬇ CSV
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-10">#</th>
              <th
                className="px-3 py-2.5 text-left font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('position')}
              >Pos <SortIcon k="position" /></th>
              <th
                className="px-3 py-2.5 text-left font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('expectedWord')}
              >Expected <SortIcon k="expectedWord" /></th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Said</th>
              <th
                className="px-3 py-2.5 text-left font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('primaryType')}
              >Type <SortIcon k="primaryType" /></th>
              <th
                className="px-3 py-2.5 text-left font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('subtype')}
              >Subtype <SortIcon k="subtype" /></th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Syn.</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Sem.</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Meaning Δ</th>
              <th
                className="px-3 py-2.5 text-right font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('weight')}
              >Weight <SortIcon k="weight" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((m, i) => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2 text-gray-500 tabular-nums">{m.position + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-800">{m.expectedWord || '—'}</td>
                <td className="px-3 py-2 text-gray-600 italic">{m.spokenWord || '(omitted)'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[m.primaryType]}`}>
                    {m.primaryType}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600 text-xs">{m.subtype.replace(/_/g, ' ')}</td>
                <td className={`px-3 py-2 text-center text-xs font-semibold ${ACCEPT_COLOR(m.syntacticAcceptable)}`}>
                  {m.syntacticAcceptable}
                </td>
                <td className={`px-3 py-2 text-center text-xs font-semibold ${ACCEPT_COLOR(m.semanticAcceptable)}`}>
                  {m.semanticAcceptable}
                </td>
                <td className={`px-3 py-2 text-center text-xs font-bold ${m.meaningChanged ? 'text-red-600' : 'text-emerald-600'}`}>
                  {m.meaningChanged ? '⚠ Yes' : 'No'}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${WEIGHT_COLOR(m.weight)}`}>
                  {m.weight >= 0 ? '+' : ''}{m.weight.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td colSpan={9} className="px-3 py-2 text-right text-sm font-semibold text-gray-600">
                Total miscue weight:
              </td>
              <td className={`px-3 py-2 text-right tabular-nums font-bold ${WEIGHT_COLOR(totalWeight)}`}>
                {totalWeight >= 0 ? '+' : ''}{totalWeight.toFixed(1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
