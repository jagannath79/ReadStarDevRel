'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, BarChart2, Mic, FileText, BookOpen, Settings, LogOut, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { href: '/teacher/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/teacher/students', label: 'Students', icon: Users },
  { href: '/teacher/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/teacher/recordings', label: 'Recordings', icon: Mic },
  { href: '/teacher/reports', label: 'Reports', icon: FileText },
  { href: '/teacher/sentences', label: 'Sentences', icon: BookOpen },
  { href: '/teacher/settings', label: 'Settings', icon: Settings },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'teacher')) {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#E8F4FD]">
        <div className="w-10 h-10 border-4 border-[#22A06B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-emerald-700/30 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-white text-lg" style={{ fontFamily: 'Fraunces, serif' }}>ReadStar</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all ${
                active
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* User & Logout */}
      <div className={`p-3 border-t border-emerald-700/30 ${collapsed ? 'flex justify-center' : ''}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="overflow-hidden">
              <div className="text-white text-sm font-medium truncate">{user.firstName} {user.lastName}</div>
              <div className="text-white/60 text-xs truncate">{user.email}</div>
            </div>
          </div>
        )}
        <button
          onClick={() => { logout(); router.replace('/'); }}
          className={`flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all w-full text-sm ${collapsed ? 'justify-center' : ''}`}
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && 'Sign out'}
        </button>
      </div>

      {/* Collapse toggle (desktop) */}
      <button
        onClick={() => setCollapsed(p => !p)}
        className="hidden md:flex absolute top-4 -right-3 w-6 h-6 bg-white rounded-full shadow border border-gray-200 items-center justify-center text-gray-500 hover:text-[#22A06B] transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#E8F4FD] flex">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-gradient-to-b from-[#22A06B] to-[#16834F] relative transition-all duration-300 ${collapsed ? 'w-16' : 'w-56'} flex-shrink-0`}
        style={{ minHeight: '100vh' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-[#22A06B] to-[#16834F] transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="relative h-full">
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-3 right-3 w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center text-white"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
          <SidebarContent />
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
          <button
            onClick={() => setMobileOpen(true)}
            className="w-9 h-9 flex items-center justify-center text-gray-600"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-7 h-7 bg-[#22A06B] rounded-lg flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[#22A06B]" style={{ fontFamily: 'Fraunces, serif' }}>ReadStar</span>
        </header>

        <main className="flex-1 p-4 md:p-6 page-enter overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
