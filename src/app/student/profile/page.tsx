'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Settings, LogOut, BookOpen, Globe, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { updateUser } from '@/db/indexeddb';
import { useToast } from '@/components/shared/Toast';

export default function StudentProfile() {
  const { user, logout, updateCurrentUser } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '' });
  const [defaultDiff, setDefaultDiff] = useState(user?.defaultDifficulty || 'simple');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  const avatarColors = ['#1B3A8C', '#22A06B', '#F5A623', '#8B5CF6', '#EC4899'];
  const avatarColor = avatarColors[user.username.charCodeAt(0) % avatarColors.length];

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      showToast('Name fields cannot be empty.', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = { ...user, firstName: form.firstName.trim(), lastName: form.lastName.trim(), defaultDifficulty: defaultDiff as any };
      await updateUser(updated);
      updateCurrentUser(updated);
      setEditing(false);
      showToast('Profile updated!', 'success');
    } catch {
      showToast('Failed to save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8 page-enter">
      {/* Avatar */}
      <div className="text-center mb-8">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-3 shadow-lg"
          style={{ background: avatarColor }}
        >
          {initials}
        </div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
          {user.firstName} {user.lastName}
        </h1>
        <p className="text-gray-500 text-sm">{user.email}</p>
        {user.grade && (
          <span className="inline-block mt-2 bg-blue-100 text-[#1B3A8C] text-xs font-medium px-3 py-1 rounded-full">
            Grade {user.grade}
          </span>
        )}
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
            <User className="w-4 h-4 text-[#1B3A8C]" /> Profile Info
          </h2>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-sm text-[#1B3A8C] font-medium hover:underline">Edit</button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">First Name</label>
                <input
                  value={form.firstName}
                  onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A8C]/30"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Last Name</label>
                <input
                  value={form.lastName}
                  onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A8C]/30"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#1B3A8C] text-white text-sm font-medium disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Username</span>
              <span className="font-medium text-gray-900">{user.username}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-900 truncate max-w-[200px]">{user.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Member since</span>
              <span className="font-medium text-gray-900">{new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Preferences */}
      <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
          <Settings className="w-4 h-4 text-[#1B3A8C]" /> Preferences
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-700 font-medium block mb-2 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#1B3A8C]" /> Default Difficulty
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['simple', 'medium', 'complex'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDefaultDiff(d)}
                  className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                    defaultDiff === d
                      ? d === 'simple' ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : d === 'medium' ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 w-full py-2.5 rounded-xl bg-[#1B3A8C] text-white text-sm font-medium disabled:opacity-60 hover:bg-blue-900 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>

      {/* Sign Out */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-2xl text-red-500 font-medium hover:bg-red-50 transition-colors"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <LogOut className="w-5 h-5" />
          Sign Out
        </div>
        <ChevronRight className="w-4 h-4 opacity-50" />
      </button>
    </div>
  );
}
