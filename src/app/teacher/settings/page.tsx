'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, LogOut, Key, School, UserPlus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { updateUser } from '@/db/indexeddb';
import { useToast } from '@/components/shared/Toast';
import { v4 as uuidv4 } from 'uuid';

export default function TeacherSettings() {
  const { user, logout, updateCurrentUser, registerTeacher } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [newTeacher, setNewTeacher] = useState({ firstName: '', lastName: '', username: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [addingTeacher, setAddingTeacher] = useState(false);

  if (!user) return null;

  const generateToken = () => setToken(uuidv4().slice(0, 8).toUpperCase());

  const handleLogout = () => { logout(); router.replace('/'); };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacher.firstName || !newTeacher.email || !newTeacher.password) {
      showToast('Please fill all required fields.', 'error');
      return;
    }
    setAddingTeacher(true);
    const ok = await registerTeacher({ ...newTeacher, username: newTeacher.username || newTeacher.email.split('@')[0] });
    setAddingTeacher(false);
    if (ok) {
      showToast('Teacher account created!', 'success');
      setNewTeacher({ firstName: '', lastName: '', username: '', email: '', password: '' });
      setShowInvite(false);
    } else {
      showToast('Email or username already exists.', 'error');
    }
  };

  return (
    <div className="max-w-2xl mx-auto page-enter">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage your account and application settings</p>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
          <Settings className="w-4 h-4 text-[#22A06B]" /> Account
        </h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-lg font-bold">
            {user.firstName[0]}{user.lastName[0]}
          </div>
          <div>
            <div className="font-semibold text-gray-900">{user.firstName} {user.lastName}</div>
            <div className="text-sm text-gray-500">{user.email}</div>
            <div className="text-xs text-emerald-600 font-medium mt-0.5">Teacher</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-400 text-xs block mb-1">Username</span>
            <span className="font-medium text-gray-900">@{user.username}</span>
          </div>
          <div>
            <span className="text-gray-400 text-xs block mb-1">Member Since</span>
            <span className="font-medium text-gray-900">{new Date(user.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Invite Teacher */}
      <div className="bg-white rounded-2xl p-5 mb-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'Fraunces, serif' }}>
            <UserPlus className="w-4 h-4 text-[#22A06B]" /> Add Teacher Account
          </h2>
          <button onClick={() => setShowInvite(p => !p)} className="text-sm text-[#22A06B] font-medium hover:underline">
            {showInvite ? 'Cancel' : 'Add Teacher'}
          </button>
        </div>

        <div className="mb-3">
          <button onClick={generateToken} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors">
            <Key className="w-4 h-4" /> Generate Registration Token
          </button>
          {token && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 font-mono-data text-amber-800 font-bold tracking-wider">
              {token}
            </div>
          )}
        </div>

        {showInvite && (
          <form onSubmit={handleAddTeacher} className="space-y-3 border-t border-gray-100 pt-4">
            <div className="grid grid-cols-2 gap-3">
              {['firstName', 'lastName'].map(k => (
                <div key={k}>
                  <label className="text-xs text-gray-500 mb-1 block">{k === 'firstName' ? 'First Name *' : 'Last Name'}</label>
                  <input value={newTeacher[k as keyof typeof newTeacher]} onChange={e => setNewTeacher(p => ({ ...p, [k]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30"
                    placeholder={k === 'firstName' ? 'Jane' : 'Smith'} />
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email *</label>
              <input type="email" value={newTeacher.email} onChange={e => setNewTeacher(p => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30"
                placeholder="teacher@school.edu" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Username</label>
                <input value={newTeacher.username} onChange={e => setNewTeacher(p => ({ ...p, username: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30"
                  placeholder="Auto from email" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Password *</label>
                <input type="password" value={newTeacher.password} onChange={e => setNewTeacher(p => ({ ...p, password: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#22A06B]/30"
                  placeholder="••••••" />
              </div>
            </div>
            <button type="submit" disabled={addingTeacher}
              className="w-full py-2.5 rounded-xl bg-[#22A06B] text-white text-sm font-medium disabled:opacity-60 hover:bg-emerald-700 transition-colors">
              {addingTeacher ? 'Creating...' : 'Create Teacher Account'}
            </button>
          </form>
        )}
      </div>

      {/* Sign Out */}
      <button onClick={handleLogout}
        className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-2xl text-red-500 font-medium hover:bg-red-50 transition-colors"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-3"><LogOut className="w-5 h-5" /> Sign Out</div>
      </button>
    </div>
  );
}
