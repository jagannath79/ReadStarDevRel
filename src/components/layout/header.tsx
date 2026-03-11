"use client";
import { useSession } from "next-auth/react";
import { HelpCircle, Activity } from "lucide-react";
import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { NotificationPanel } from "./notification-panel";
import { UserProfilePanel } from "./user-profile-panel";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const { data: session } = useSession();

  // ── Live clock ──────────────────────────────────────────────────────────
  // Start as null so server and client render the same empty state,
  // then set the real time only after first client-side mount.
  // This eliminates the React hydration mismatch on the timestamp.
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center px-6 gap-4 sticky top-0 z-40">
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold text-foreground truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {actions}

        {/* Live clock — only rendered after client mount to avoid hydration mismatch */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-muted/50 px-2.5 py-1 rounded-lg border border-border min-w-[140px]">
          <Activity className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          <span suppressHydrationWarning>
            {mounted && currentTime
              ? formatDate(currentTime, "MMM d, HH:mm:ss")
              : "––"}
          </span>
        </div>

        {/* Notifications — real-time bell with SSE */}
        <NotificationPanel />

        {/* Help */}
        <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all">
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* User badge — click to open profile panel */}
        <button
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2 pl-3 border-l border-border hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
        >
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-foreground">
              {session?.user?.name ?? session?.user?.email}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {session?.user?.role ?? "User"}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white select-none ring-2 ring-transparent hover:ring-indigo-500/40 transition-all">
            {(session?.user?.name ?? session?.user?.email ?? "U")
              .charAt(0)
              .toUpperCase()}
          </div>
        </button>
      </div>

      {/* Profile side-panel — mounted only when open so state is always fresh */}
      {profileOpen && <UserProfilePanel onClose={() => setProfileOpen(false)} />}
    </header>
  );
}
