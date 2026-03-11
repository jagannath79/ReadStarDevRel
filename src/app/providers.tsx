"use client";
// ReadStar uses client-side auth only (no NextAuth/SessionProvider needed)
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
