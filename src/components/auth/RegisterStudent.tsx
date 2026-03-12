'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isGoogleSignInConfigured } from '@/lib/googleAuth';
import { useToast } from '@/components/shared/Toast';

interface Props { onBack: () => void; }

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 6 characters', ok: password.length >= 6 },
    { label: 'Contains a number', ok: /\d/.test(password) },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(password) },
  ];
  const strength = checks.filter(c => c.ok).length;
  const colors = ['bg-red-400', 'bg-amber-400', 'bg-emerald-500'];
  const labels = ['Weak', 'Fair', 'Strong'];

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < strength ? colors[strength - 1] : 'bg-gray-200'}`} />
        ))}
      </div>
      {password && <p className="text-xs text-gray-500">{labels[strength - 1] || 'Too weak'}</p>}
      <ul className="mt-2 space-y-0.5">
        {checks.map(c => (
          <li key={c.label} className={`text-xs flex items-center gap-1 ${c.ok ? 'text-emerald-600' : 'text-gray-400'}`}>
            <CheckCircle className={`w-3 h-3 ${c.ok ? 'text-emerald-500' : 'text-gray-300'}`} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RegisterStudent({ onBack }: Props) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', email: '', password: '', grade: '3',
  });
  const [showPwd, setShowPwd] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGoogleAvailable, setIsGoogleAvailable] = useState(false);
  const { registerStudent, registerStudentWithGoogle, error, isLoading, clearError } = useAuth();

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const configured = await isGoogleSignInConfigured();
        if (mounted) setIsGoogleAvailable(configured);
      } catch {
        if (mounted) setIsGoogleAvailable(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);
  const { showToast } = useToast();

  const update = (k: string, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(p => ({ ...p, [k]: '' }));
    clearError();
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required.';
    if (!form.lastName.trim()) e.lastName = 'Last name is required.';
    if (!form.username.trim()) e.username = 'Username is required.';
    else if (form.username.length < 3) e.username = 'Username must be at least 3 characters.';
    if (!form.email.trim()) e.email = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Please enter a valid email.';
    if (!form.password) e.password = 'Password is required.';
    else if (form.password.length < 6) e.password = 'Password must be at least 6 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };


  const handleGoogleRegistration = async () => {
    clearError();
    const ok = await registerStudentWithGoogle(parseInt(form.grade));
    if (ok) {
      setSuccess(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const ok = await registerStudent({
      firstName: form.firstName,
      lastName: form.lastName,
      username: form.username,
      email: form.email,
      password: form.password,
      grade: parseInt(form.grade),
    });

    if (!ok) return;

    showToast(
      {
        title: '🎉 Account created successfully!',
        description: `Welcome ${form.firstName}! A confirmation email has been sent to ${form.email}.`,
      },
      'success'
    );

    try {
      const response = await fetch('/api/notifications/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          username: form.username,
          email: form.email,
          grade: parseInt(form.grade),
        }),
      });

      if (!response.ok) {
        showToast(
          {
            title: 'Account created, but email is pending',
            description: 'We could not send the confirmation email right now. You can still sign in normally.',
          },
          'warning'
        );
      }
    } catch {
      showToast(
        {
          title: 'Account created, but email is pending',
          description: 'We could not send the confirmation email right now. You can still sign in normally.',
        },
        'warning'
      );
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#E8F4FD] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-sm w-full">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Fraunces, serif' }}>
            You&apos;re all set!
          </h2>
          <p className="text-gray-500 mb-6">Your account has been created. Sign in to start reading!</p>
          <button
            onClick={onBack}
            className="w-full py-3 rounded-xl bg-[#1B3A8C] text-white font-semibold hover:bg-blue-900 transition-colors"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  const field = (key: keyof typeof form, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor={key}>{label}</label>
      <input
        id={key}
        type={type}
        value={form[key]}
        onChange={e => update(key, e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-3 rounded-xl border ${errors[key] ? 'border-red-400 bg-red-50' : 'border-gray-200'} focus:outline-none focus:ring-2 focus:ring-[#1B3A8C]/30 text-gray-900 transition-all`}
      />
      {errors[key] && <p className="text-red-500 text-xs mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#E8F4FD] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <button onClick={onBack} className="flex items-center gap-2 text-[#1B3A8C] font-medium mb-6 hover:opacity-80 transition-opacity">
          <ArrowLeft className="w-4 h-4" /> Back to Sign In
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <h2 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
            Create Student Account
          </h2>
          <p className="text-gray-500 text-sm mb-6">Join ReadStar and start improving your reading today!</p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {field('firstName', 'First Name', 'text', 'Jane')}
              {field('lastName', 'Last Name', 'text', 'Smith')}
            </div>
            {field('username', 'Username', 'text', 'janesmith')}
            {field('email', 'Email Address', 'email', 'jane@school.edu')}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="grade">Grade</label>
              <select
                id="grade"
                value={form.grade}
                onChange={e => update('grade', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1B3A8C]/30 text-gray-900 bg-white"
              >
                {[3, 4, 5, 6, 7, 8].map(g => (
                  <option key={g} value={g}>Grade {g}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="reg-password">Password</label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => update('password', e.target.value)}
                  placeholder="••••••••"
                  className={`w-full px-4 py-3 pr-12 rounded-xl border ${errors.password ? 'border-red-400 bg-red-50' : 'border-gray-200'} focus:outline-none focus:ring-2 focus:ring-[#1B3A8C]/30 text-gray-900`}
                />
                <button type="button" onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}>
                  {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              {form.password && <PasswordStrength password={form.password} />}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-[#1B3A8C] hover:bg-blue-900 transition-all disabled:opacity-60 mt-2"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : 'Create Account'}
            </button>

            {isGoogleAvailable && (
              <button
                type="button"
                onClick={handleGoogleRegistration}
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all disabled:opacity-60"
              >
                Create Account with Google
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
