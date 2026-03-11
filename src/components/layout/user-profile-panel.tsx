"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import {
  X, LogOut, Shield, Building2, Mail, Clock,
  CalendarDays, CheckCircle2, XCircle, Briefcase, MapPin,
  Network, Loader2, Settings, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileData {
  id:             string;
  name:           string | null;
  email:          string | null;
  upn:            string | null;
  role:           string;
  department:     string | null;
  isActive:       boolean;
  createdAt:      string;
  lastLoginAt:    string | null;
  provider:       string;
  // Entra-only
  jobTitle?:      string | null;
  officeLocation?: string | null;
}

// ── Role badge config ─────────────────────────────────────────────────────────

function roleBadge(role: string) {
  switch (role?.toUpperCase()) {
    case "ADMIN":    return { cls: "bg-violet-500/20 text-violet-300 border border-violet-500/30",    label: "Administrator" };
    case "OPERATOR": return { cls: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30",    label: "Operator"      };
    case "VIEWER":   return { cls: "bg-slate-500/20  text-slate-300  border border-slate-500/30",     label: "Viewer"        };
    default:         return { cls: "bg-muted/40       text-muted-foreground border border-border",    label: role ?? "User"  };
  }
}

// ── Provider badge ────────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: string }) {
  if (provider === "azure-ad") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-300">
        {/* Microsoft "4 squares" logo */}
        <svg className="w-3.5 h-3.5" viewBox="0 0 21 21" fill="none">
          <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
          <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
          <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
          <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
        Microsoft Entra ID
      </span>
    );
  }
  if (provider === "ldap" || provider === "credentials") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300">
        <Network className="w-3.5 h-3.5" />
        Active Directory
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-muted/40 border border-border text-muted-foreground">
      <Shield className="w-3.5 h-3.5" />
      Local Account
    </span>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon, label, value, mono = false,
}: {
  icon: React.ElementType; label: string; value: React.ReactNode; mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-muted/30 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground/70" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-0.5">{label}</p>
        <p className={cn("text-sm text-foreground/90 truncate", mono && "font-mono text-xs")}>{value}</p>
      </div>
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function ProfileAvatar({ name, size = 64 }: { name?: string | null; size?: number }) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/30 select-none ring-2 ring-indigo-500/20"
    >
      {initials}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
// This component is conditionally mounted by the parent — it mounts when the
// panel opens and unmounts when it closes. State is always fresh on open.

interface UserProfilePanelProps {
  onClose: () => void;
}

export function UserProfilePanel({ onClose }: UserProfilePanelProps) {
  const [profile, setProfile]   = useState<ProfileData | null>(null);
  const [loading, setLoading]   = useState(true);  // start loading immediately
  const [error, setError]       = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Fetch profile on mount ─────────────────────────────────────────────────
  const fetchProfile = () => {
    setLoading(true);
    setError(null);
    fetch("/api/profile")
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401) throw new Error("Session expired — please sign out and sign back in.");
          throw new Error(`Server error (${r.status})`);
        }
        return r.json();
      })
      .then((d: ProfileData) => {
        if (d?.id) setProfile(d);
        else throw new Error("Incomplete profile data received.");
      })
      .catch((e: Error) => setError(e.message ?? "Could not load profile."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rb = profile ? roleBadge(profile.role) : null;

  // Render via portal to document.body so that `position: fixed` children are
  // positioned relative to the VIEWPORT, not the header (which has backdrop-filter
  // that creates a new CSS containing block in Chrome, breaking fixed layouts).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed right-0 top-0 h-screen w-[380px] max-w-[95vw] z-[9999]",
          "bg-background border-l border-border shadow-2xl shadow-black/40",
          "flex flex-col animate-slide-in-right",
        )}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">My Profile</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto no-scrollbar">

          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400/60" />
              <p className="text-xs text-muted-foreground">Loading profile…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 px-6">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <XCircle className="w-7 h-7 text-rose-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-foreground">Profile unavailable</p>
                <p className="text-xs text-muted-foreground text-center leading-relaxed">{error}</p>
              </div>
              <button
                onClick={fetchProfile}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/30 hover:bg-accent border border-border text-xs text-foreground/80 hover:text-foreground transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try Again
              </button>
            </div>
          )}

          {profile && !loading && (
            <>
              {/* ── Hero ─────────────────────────────────────────────────── */}
              <div className="flex flex-col items-center py-8 px-6 gap-4 bg-gradient-to-b from-indigo-500/5 to-transparent">
                <ProfileAvatar name={profile.name} size={72} />

                <div className="text-center space-y-1.5">
                  <h3 className="text-lg font-bold text-foreground leading-tight">
                    {profile.name ?? "Unknown User"}
                  </h3>
                  {profile.jobTitle && (
                    <p className="text-sm text-muted-foreground">{profile.jobTitle}</p>
                  )}
                  <div className="flex items-center justify-center gap-2 flex-wrap mt-2">
                    {/* Role badge */}
                    <span className={cn("inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold", rb?.cls)}>
                      <Shield className="w-3 h-3" />
                      {rb?.label}
                    </span>
                    {/* Status badge */}
                    <span className={cn(
                      "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full",
                      profile.isActive
                        ? "bg-emerald-500/15 border border-emerald-500/25 text-emerald-300"
                        : "bg-rose-500/15 border border-rose-500/25 text-rose-300",
                    )}>
                      {profile.isActive
                        ? <><CheckCircle2 className="w-3 h-3" /> Active</>
                        : <><XCircle className="w-3 h-3" /> Inactive</>
                      }
                    </span>
                  </div>
                  <div className="pt-1">
                    <ProviderBadge provider={profile.provider} />
                  </div>
                </div>
              </div>

              {/* ── Details ──────────────────────────────────────────────── */}
              <div className="px-5 pb-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold mb-1 ml-1">
                  Account Details
                </p>
                <div className="glass rounded-xl px-1">
                  <InfoRow icon={Mail}        label="Email"       value={profile.email ?? "—"}  />
                  {profile.upn && profile.upn !== profile.email && (
                    <InfoRow icon={Network}   label="UPN"         value={profile.upn}  mono />
                  )}
                  {profile.department && (
                    <InfoRow icon={Building2} label="Department"  value={profile.department} />
                  )}
                  {profile.officeLocation && (
                    <InfoRow icon={MapPin}    label="Office"      value={profile.officeLocation} />
                  )}
                  {profile.jobTitle && !profile.department && (
                    <InfoRow icon={Briefcase} label="Job Title"   value={profile.jobTitle} />
                  )}
                  <InfoRow
                    icon={Clock}
                    label="Last Login"
                    value={profile.lastLoginAt
                      ? format(new Date(profile.lastLoginAt), "MMM d, yyyy 'at' HH:mm")
                      : "Never"}
                  />
                  <InfoRow
                    icon={CalendarDays}
                    label="Member Since"
                    value={format(new Date(profile.createdAt), "MMM d, yyyy")}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer Actions ──────────────────────────────────────────────── */}
        <div className="border-t border-border p-4 space-y-2">
          {profile?.role?.toUpperCase() === "ADMIN" && (
            <a
              href="/settings"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-muted/30 hover:bg-accent border border-border text-sm text-foreground/80 hover:text-foreground transition-all"
            >
              <Settings className="w-4 h-4" />
              System Settings
            </a>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-sm text-rose-400 hover:text-rose-300 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
