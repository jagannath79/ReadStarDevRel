'use client';

import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/shared/Toast';

interface Props { onClose: () => void; }

export default function AddStudentModal({ onClose }: Props) {
  const { registerStudent } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '', email: '', password: '', grade: '3' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim()) e.lastName = 'Required';
    if (!form.username.trim() || form.username.length < 3) e.username = 'At least 3 chars';
    if (!form.email.trim() || !/\S+@\S+/.test(form.email)) e.email = 'Valid email required';
    if (!form.password || form.password.length < 6) e.password = 'At least 6 chars';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const ok = await registerStudent({ ...form, grade: parseInt(form.grade) });
    setLoading(false);
    if (ok) {
      showToast(`Student ${form.firstName} added successfully!`, 'success');
      onClose();
    } else {
      showToast('Username or email already exists.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.15)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Add New Student</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {['firstName', 'lastName'].map(k => (
              <div key={k}>
                <label className="text-xs text-gray-500 mb-1 block">{k === 'firstName' ? 'First Name' : 'Last Name'}</label>
                <input
                  value={form[k as keyof typeof form]}
                  onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 ${errors[k] ? 'border-red-400' : 'border-gray-200'}`}
                  placeholder={k === 'firstName' ? 'Jane' : 'Smith'}
                />
                {errors[k] && <p className="text-red-500 text-xs mt-0.5">{errors[k]}</p>}
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Username</label>
            <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 ${errors.username ? 'border-red-400' : 'border-gray-200'}`}
              placeholder="janesmith" />
            {errors.username && <p className="text-red-500 text-xs mt-0.5">{errors.username}</p>}
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 ${errors.email ? 'border-red-400' : 'border-gray-200'}`}
              placeholder="jane@school.edu" />
            {errors.email && <p className="text-red-500 text-xs mt-0.5">{errors.email}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Grade</label>
              <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none bg-white">
                {[3, 4, 5, 6, 7, 8].map(g => <option key={g} value={g}>Grade {g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Password</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className={`w-full px-3 py-2.5 pr-9 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30 ${errors.password ? 'border-red-400' : 'border-gray-200'}`}
                  placeholder="••••••" />
                <button type="button" onClick={() => setShowPwd(p => !p)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-0.5">{errors.password}</p>}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-[#22A06B] text-white text-sm font-medium disabled:opacity-60 hover:bg-emerald-700 transition-colors">
              {loading ? 'Adding...' : 'Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
