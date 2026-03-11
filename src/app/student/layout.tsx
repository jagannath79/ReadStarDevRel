'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, BookOpen, BarChart2, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { href: '/student/dashboard', label: 'Home', icon: Home },
  { href: '/student/practice', label: 'Practice', icon: BookOpen },
  { href: '/student/progress', label: 'Progress', icon: BarChart2 },
  { href: '/student/profile', label: 'Profile', icon: User },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'student')) {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#E8F4FD]">
        <div className="w-10 h-10 border-4 border-[#1B3A8C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E8F4FD] pb-20 md:pb-0">
      {/* Desktop top bar */}
      <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white border-b border-blue-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#1B3A8C] rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-[#1B3A8C] text-lg" style={{ fontFamily: 'Fraunces, serif' }}>ReadStar</span>
        </div>
        <nav className="flex items-center gap-2">
          {navItems.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                  active ? 'bg-[#1B3A8C] text-white' : 'text-gray-600 hover:bg-blue-50'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          {user.profilePicture ? (
            <img
              src={user.profilePicture}
              alt={`${user.firstName} ${user.lastName} profile picture`}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#F5A623] flex items-center justify-center text-white font-bold text-sm">
              {user.firstName[0]}{user.lastName[0]}
            </div>
          )}
          <span className="text-sm font-medium text-gray-700">{user.firstName}</span>
        </div>
      </header>

      {/* Main content */}
      <main className="page-enter">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-2 py-2 z-10">
        <div className="flex items-center justify-around">
          {navItems.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                  active ? 'text-[#1B3A8C]' : 'text-gray-400'
                }`}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
              >
                <div className={`p-1.5 rounded-xl transition-all ${active ? 'bg-blue-100' : ''}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
