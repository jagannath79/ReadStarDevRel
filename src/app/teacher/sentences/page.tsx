'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, X, Check, Search } from 'lucide-react';
import { getAllSentences, addSentence, updateSentence, deleteSentence, Sentence } from '@/db/indexeddb';
import { useToast } from '@/components/shared/Toast';
import { v4 as uuidv4 } from 'uuid';

const DIFF_BADGE: Record<string, string> = {
  simple: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  complex: 'bg-red-100 text-red-700',
};

type DifficultyType = 'simple' | 'medium' | 'complex';
const BLANK_FORM: { text: string; difficulty: DifficultyType; topic: string; gradeTarget: number } = { text: '', difficulty: 'simple', topic: '', gradeTarget: 3 };

export default function TeacherSentences() {
  const { showToast } = useToast();
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setSentences(await getAllSentences());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = sentences.filter(s => {
    const matchDiff = diffFilter === 'all' || s.difficulty === diffFilter;
    const matchSearch = !search || s.text.toLowerCase().includes(search.toLowerCase()) || s.topic.toLowerCase().includes(search.toLowerCase());
    return matchDiff && matchSearch;
  });

  const grouped = {
    simple: filtered.filter(s => s.difficulty === 'simple'),
    medium: filtered.filter(s => s.difficulty === 'medium'),
    complex: filtered.filter(s => s.difficulty === 'complex'),
  };

  const startEdit = (s: Sentence) => {
    setForm({ text: s.text, difficulty: s.difficulty, topic: s.topic, gradeTarget: s.gradeTarget });
    setEditId(s.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.text.trim()) { showToast('Sentence text is required.', 'error'); return; }
    setSaving(true);
    try {
      if (editId) {
        const existing = sentences.find(s => s.id === editId)!;
        await updateSentence({ ...existing, ...form, wordCount: form.text.trim().split(/\s+/).length });
        showToast('Sentence updated!', 'success');
      } else {
        await addSentence({
          id: uuidv4(), ...form,
          wordCount: form.text.trim().split(/\s+/).length,
          createdAt: Date.now(),
        });
        showToast('Sentence added!', 'success');
      }
      setShowForm(false);
      setEditId(null);
      setForm({ ...BLANK_FORM });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteSentence(deleteId);
    setDeleteId(null);
    showToast('Sentence deleted.', 'success');
    await load();
  };

  return (
    <div className="max-w-4xl mx-auto page-enter">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Sentence Bank</h1>
          <p className="text-gray-500 text-sm mt-0.5">{sentences.length} sentences · manage reading content</p>
        </div>
        <button onClick={() => { setForm({ ...BLANK_FORM }); setEditId(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#22A06B] text-white text-sm font-medium hover:bg-emerald-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Sentence
        </button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sentences..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 bg-white" />
        </div>
        {['all', 'simple', 'medium', 'complex'].map(d => (
          <button key={d} onClick={() => setDiffFilter(d)} className={`px-3 py-2 rounded-xl text-xs font-medium capitalize transition-colors ${diffFilter === d ? 'bg-[#22A06B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {d}
          </button>
        ))}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-2xl p-5 mb-4 border-2 border-[#22A06B]/30" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <h3 className="font-bold text-gray-900 mb-4">{editId ? 'Edit Sentence' : 'Add New Sentence'}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sentence Text *</label>
              <textarea value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))} rows={3}
                placeholder="Enter the sentence here..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 resize-none" />
              {form.text && <p className="text-xs text-gray-400 mt-1">{form.text.trim().split(/\s+/).length} words</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Difficulty</label>
                <select value={form.difficulty} onChange={e => setForm(p => ({ ...p, difficulty: e.target.value as any }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none bg-white">
                  <option value="simple">Simple</option>
                  <option value="medium">Medium</option>
                  <option value="complex">Complex</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Topic</label>
                <input value={form.topic} onChange={e => setForm(p => ({ ...p, topic: e.target.value }))} placeholder="e.g. animals"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Grade Target</label>
                <select value={form.gradeTarget} onChange={e => setForm(p => ({ ...p, gradeTarget: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none bg-white">
                  {[3, 4, 5, 6, 7, 8].map(g => <option key={g} value={g}>Grade {g}</option>)}
                </select>
              </div>
            </div>
            {/* Preview */}
            {form.text && (
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-2"><Eye className="w-3.5 h-3.5" /> Preview</div>
                <p className="text-gray-900 text-lg" style={{ fontFamily: 'Fraunces, serif' }}>{form.text}</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowForm(false); setEditId(null); setForm({ ...BLANK_FORM }); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-[#22A06B] text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-1">
                <Check className="w-4 h-4" /> {saving ? 'Saving...' : editId ? 'Update' : 'Add Sentence'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
            <h3 className="font-bold text-gray-900 mb-2">Delete Sentence?</h3>
            <p className="text-gray-500 text-sm mb-4">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-2xl skeleton" />)}</div>
      ) : (
        <div className="space-y-6">
          {(['simple', 'medium', 'complex'] as const).map(diff => {
            const group = grouped[diff];
            if (group.length === 0 && diffFilter !== 'all' && diffFilter !== diff) return null;
            return (
              <div key={diff}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${DIFF_BADGE[diff]}`}>{diff.charAt(0).toUpperCase() + diff.slice(1)}</span>
                  <span className="text-xs text-gray-400">{group.length} sentences</span>
                </div>
                <div className="space-y-2">
                  {group.map(s => (
                    <div key={s.id} className="bg-white rounded-xl px-4 py-3 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 text-sm leading-relaxed">{s.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">{s.wordCount}w</span>
                          {s.topic && <span className="text-xs text-gray-400">· {s.topic}</span>}
                          <span className="text-xs text-gray-400">· Grade {s.gradeTarget}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => startEdit(s)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors" aria-label="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(s.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" aria-label="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {group.length === 0 && (
                    <div className="text-center py-6 text-gray-300 text-sm">No {diff} sentences.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
