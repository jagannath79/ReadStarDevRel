'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import LoginPage from '@/components/auth/LoginPage';

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      if (user.role === 'teacher') router.replace('/teacher/dashboard');
      else router.replace('/student/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#E8F4FD]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#1B3A8C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#1B3A8C] font-medium text-lg" style={{ fontFamily: 'Fraunces, serif' }}>
            Loading ReadStar...
          </p>
        </div>
      </div>
    );
  }

  if (user) return null;

  return <LoginPage />;
}
