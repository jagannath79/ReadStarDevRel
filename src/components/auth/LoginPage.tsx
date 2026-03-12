'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Eye, EyeOff, GraduationCap, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import RegisterStudent from './RegisterStudent';

type Role = 'student' | 'teacher';


function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6.1-2.7-6.1-6s2.8-6 6.1-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.6-4.8 9.6-7.3 0-.5-.1-.9-.1-1.3H12z" />
      <path fill="#34A853" d="M3.5 7.4l3.2 2.3C7.5 7.8 9.6 6.4 12 6.4c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.6 2.4 12 2.4 8.2 2.4 4.9 4.6 3.5 7.4z" />
      <path fill="#FBBC05" d="M12 21.6c2.5 0 4.7-.8 6.3-2.3l-2.9-2.4c-.8.6-1.9 1-3.4 1-4 0-5.3-2.5-5.5-3.8l-3.2 2.5c1.4 2.8 4.5 5 8.7 5z" />
      <path fill="#4285F4" d="M21.6 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.2 1.1-.9 2-1.7 2.6l2.9 2.4c1.7-1.5 2.9-3.8 2.9-7.3z" />
    </svg>
  );
}

export default function LoginPage() {
  const [role, setRole] = useState<Role>('student');
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});

  const { login, loginWithGoogle, error, isLoading, clearError } = useAuth();
  const router = useRouter();

  if (showRegister) {
    return <RegisterStudent onBack={() => setShowRegister(false)} />;
  }

  const validate = () => {
    const errs: typeof fieldErrors = {};
    if (!usernameOrEmail.trim()) errs.username = 'Username or email is required.';
    if (!password) errs.password = 'Password is required.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!validate()) return;
    const success = await login(usernameOrEmail, password);
    if (success) {
      router.replace(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    }
  };


  const handleGoogleLogin = async () => {
    clearError();
    const success = await loginWithGoogle();
    if (success) {
      router.replace(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    }
  };

  const isStudent = role === 'student';
  const accentColor = isStudent ? '#1B3A8C' : '#22A06B';
  const bgGradient = isStudent
    ? 'from-[#1B3A8C] to-[#2851C5]'
    : 'from-[#22A06B] to-[#16834F]';

  return (
    <div className="min-h-screen bg-[#E8F4FD] flex flex-col md:flex-row">
      {/* Left hero panel */}
      <div className={`hidden md:flex md:w-2/5 bg-gradient-to-br ${bgGradient} flex-col items-center justify-center p-12 text-white transition-all duration-500`}>
        <div className="text-center">
          <div className="w-24 h-24 bg-white/20 rounded-3xl flex items-center justify-center mb-6 mx-auto">
            <BookOpen className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-3" style={{ fontFamily: 'Fraunces, serif' }}>
            ReadStar
          </h1>
          <p className="text-white/80 text-lg mb-8">
            {isStudent
              ? "Practice reading and watch your skills soar! 🚀"
              : "Track progress, empower readers, inspire growth. 🌟"}
          </p>
          <div className="grid grid-cols-2 gap-4 text-left">
            {isStudent ? (
              <>
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="text-2xl mb-1">📖</div>
                  <div className="font-semibold">Real Practice</div>
                  <div className="text-white/70 text-sm">Read real sentences aloud</div>
                </div>
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="text-2xl mb-1">⭐</div>
                  <div className="font-semibold">Earn Stars</div>
                  <div className="text-white/70 text-sm">Collect badges & rewards</div>
                </div>
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="text-2xl mb-1">📈</div>
                  <div className="font-semibold">See Progress</div>
                  <div className="text-white/70 text-sm">Watch your scores improve</div>
                </div>
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="text-2xl mb-1">🎙️</div>
                  <div className="font-semibold">Voice Recording</div>
                  <div className="text-white/70 text-sm">AI-powered feedback</div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="text-2xl mb-1">📊</div>
                  <div className="font-semibold">Live Data</div>
                  <div className="text-white/70 text-sm">Real-time class analytics</div>
                </div>
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="text-2xl mb-1">🎯</div>
                  <div className="font-semibold">Issue Detection</div>
                  <div className="text-white/70 text-sm">Identify reading problems</div>
                </div>
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="text-2xl mb-1">🎙️</div>
                  <div className="font-semibold">Playback</div>
                  <div className="text-white/70 text-sm">Review student recordings</div>
                </div>
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="text-2xl mb-1">📄</div>
                  <div className="font-semibold">PDF Reports</div>
                  <div className="text-white/70 text-sm">Export detailed reports</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="md:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: accentColor }}>
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>ReadStar</h1>
          </div>

          {/* Role toggle */}
          <div className="bg-white rounded-2xl p-1.5 flex mb-8 shadow-sm">
            <button
              onClick={() => { setRole('student'); clearError(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${
                isStudent
                  ? 'bg-[#1B3A8C] text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Student
            </button>
            <button
              onClick={() => { setRole('teacher'); clearError(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${
                !isStudent
                  ? 'bg-[#22A06B] text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="w-4 h-4" />
              Teacher
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
            <h2 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
              Welcome back!
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              Sign in to your {role} account
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm flex items-center gap-2">
                <span>⚠️</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="username">
                  Username or Email
                </label>
                <input
                  id="username"
                  type="text"
                  value={usernameOrEmail}
                  onChange={e => { setUsernameOrEmail(e.target.value); setFieldErrors(p => ({ ...p, username: undefined })); }}
                  className={`w-full px-4 py-3 rounded-xl border ${fieldErrors.username ? 'border-red-400 bg-red-50' : 'border-gray-200'} focus:outline-none focus:ring-2 focus:ring-offset-1 text-gray-900 transition-all`}
                  style={{ focusRingColor: accentColor } as React.CSSProperties}
                  placeholder={role === 'teacher' ? 'teacher@readstar.edu' : 'your username'}
                  autoComplete="username"
                />
                {fieldErrors.username && <p className="text-red-500 text-xs mt-1">{fieldErrors.username}</p>}
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: undefined })); }}
                    className={`w-full px-4 py-3 pr-12 rounded-xl border ${fieldErrors.password ? 'border-red-400 bg-red-50' : 'border-gray-200'} focus:outline-none focus:ring-2 text-gray-900 transition-all`}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-red-500 text-xs mt-1">{fieldErrors.password}</p>}
              </div>

              <div className="flex items-center mb-6">
                <input
                  id="remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <label htmlFor="remember" className="ml-2 text-sm text-gray-600">Remember me</label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${accentColor}, ${isStudent ? '#2851C5' : '#16834F'})` }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </button>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full mt-3 py-3.5 rounded-xl font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200 disabled:opacity-60"
              >
                <span className="flex items-center justify-center gap-2">
                  <GoogleIcon />
                  Continue with Google
                </span>
              </button>
            </form>

            {role === 'student' && (
              <p className="text-center text-sm text-gray-500 mt-5">
                New student?{' '}
                <button
                  onClick={() => setShowRegister(true)}
                  className="font-semibold text-[#1B3A8C] hover:underline"
                >
                  Create an account
                </button>
              </p>
            )}
            {role === 'teacher' && (
              <p className="text-center text-xs text-gray-400 mt-5">
                Default: teacher@readstar.edu / ReadStar2024
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
