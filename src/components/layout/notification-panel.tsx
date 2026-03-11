"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Bell, X, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Zap, Users, RefreshCw, CheckCheck, Activity,
} from "lucide-react";
import { RelativeTime } from "@/components/ui/relative-time";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type NotifType = "processing" | "success" | "error" | "partial";
type TabFilter  = "all" | "processing" | "tasks";

interface Notification {
  id:           string;
  type:         NotifType;
  taskType:     string;
  taskLabel:    string;
  title:        string;
  message:      string;
  userId?:      string | null;
  userName?:    string | null;
  userEmail?:   string | null;
  isBulk:       boolean;
  itemCount?:   number | null;
  successCount?: number | null;
  failureCount?: number | null;
  duration?:    number | null;
  createdAt:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LAST_SEEN_KEY = "notif_last_seen";

function getLastSeen(): Date {
  if (typeof window === "undefined") return new Date(0);
  const v = localStorage.getItem(LAST_SEEN_KEY);
  return v ? new Date(v) : new Date(0);
}
function setLastSeen() {
  if (typeof window !== "undefined")
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
}

function typeConfig(type: NotifType) {
  switch (type) {
    case "success":    return { border: "border-l-emerald-500",  bg: "bg-emerald-500/8",  icon: CheckCircle2,   iconCls: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-300", label: "Success"    };
    case "error":      return { border: "border-l-rose-500",     bg: "bg-rose-500/8",     icon: XCircle,        iconCls: "text-rose-400",    badge: "bg-rose-500/15 text-rose-300",       label: "Failed"     };
    case "partial":    return { border: "border-l-amber-500",    bg: "bg-amber-500/8",    icon: AlertTriangle,  iconCls: "text-amber-400",   badge: "bg-amber-500/15 text-amber-300",     label: "Partial"    };
    case "processing": return { border: "border-l-indigo-400",   bg: "bg-indigo-500/5",   icon: Loader2,        iconCls: "text-indigo-400",  badge: "bg-indigo-500/15 text-indigo-300",   label: "Running"    };
  }
}

function getInitial(name?: string | null) {
  return (name ?? "?").charAt(0).toUpperCase();
}

function userAvatarColor(name?: string | null) {
  const colors = [
    "from-indigo-500 to-violet-600",
    "from-emerald-500 to-teal-600",
    "from-orange-500 to-amber-600",
    "from-rose-500 to-pink-600",
    "from-cyan-500 to-blue-600",
    "from-purple-500 to-fuchsia-600",
  ];
  const i = (name ?? "").charCodeAt(0) % colors.length;
  return colors[i];
}

// ── Notification Card ─────────────────────────────────────────────────────────

function NotificationCard({ notif, isNew }: { notif: Notification; isNew: boolean }) {
  const cfg = typeConfig(notif.type);
  const Icon = cfg.icon;
  const isProcessing = notif.type === "processing";

  return (
    <div
      className={cn(
        "relative border-l-2 rounded-r-xl px-4 py-3.5 transition-all duration-200",
        "hover:brightness-110 cursor-default select-none",
        cfg.border, cfg.bg,
        isNew && "animate-fade-in",
        isProcessing && "shimmer-processing",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className={cn("mt-0.5 flex-shrink-0", cfg.iconCls)}>
          <Icon className={cn("w-4 h-4", isProcessing && "animate-spin")} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground leading-tight truncate">
              {notif.title || notif.taskLabel || notif.taskType || "Task notification"}
            </p>
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0", cfg.badge)}>
              {cfg.label}
            </span>
          </div>

          {notif.message && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
              {notif.message}
            </p>
          )}

          {/* Bulk progress bar */}
          {notif.isBulk && notif.itemCount && notif.itemCount > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>{notif.successCount ?? 0} / {notif.itemCount} items</span>
                {notif.failureCount ? (
                  <span className="text-rose-400">{notif.failureCount} failed</span>
                ) : null}
              </div>
              <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    notif.type === "success" ? "bg-emerald-500" :
                    notif.type === "error"   ? "bg-rose-500"    :
                    notif.type === "partial" ? "bg-amber-500"   : "bg-indigo-400",
                  )}
                  style={{
                    width: notif.type === "processing"
                      ? "60%"
                      : `${Math.round(((notif.successCount ?? 0) / notif.itemCount) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Footer row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* User avatar + name */}
            {notif.userName && (
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white bg-gradient-to-br flex-shrink-0",
                  userAvatarColor(notif.userName),
                )}>
                  {getInitial(notif.userName)}
                </div>
                <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                  {notif.userName}
                </span>
              </div>
            )}

            {notif.userName && <span className="text-muted-foreground/30 text-[10px]">·</span>}

            {/* Task type badge */}
            {(notif.taskLabel || notif.taskType) && (
              <span className="text-[10px] text-muted-foreground/70 bg-muted/30 px-1.5 py-0.5 rounded truncate max-w-[140px]">
                {notif.taskLabel || notif.taskType}
              </span>
            )}

            {/* Duration */}
            {notif.duration && notif.duration > 0 && (
              <>
                <span className="text-muted-foreground/30 text-[10px]">·</span>
                <span className="text-[10px] text-muted-foreground/50">
                  {notif.duration < 1000 ? `${notif.duration}ms` : `${(notif.duration / 1000).toFixed(1)}s`}
                </span>
              </>
            )}

            {/* Relative time (push to right) */}
            <RelativeTime
              date={notif.createdAt}
              className="ml-auto text-[10px] text-muted-foreground/50 flex-shrink-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function NotificationPanel() {
  const [open, setOpen]               = useState(false);
  const [notifications, setNotifs]    = useState<Notification[]>([]);
  const [newIds, setNewIds]           = useState<Set<string>>(new Set());
  const [tab, setTab]                 = useState<TabFilter>("all");
  const [loading, setLoading]         = useState(false);
  const [bellRinging, setBellRinging] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasError, setHasError]       = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);

  const bellRef   = useRef<HTMLButtonElement>(null);
  const panelRef  = useRef<HTMLDivElement>(null);

  // Mount portal target after hydration
  useEffect(() => { setPortalMounted(true); }, []);

  // ── Load recent notifications on mount ────────────────────────────────────
  const loadRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/recent");
      if (res.ok) {
        const data: Notification[] = await res.json();
        setNotifs(data);
        updateUnread(data);
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadRecent(); }, [loadRecent]);

  // ── SSE subscription ──────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");

    es.addEventListener("message", (e) => {
      try {
        const incoming: Notification = JSON.parse(e.data);
        setNotifs((prev) => {
          const idx = prev.findIndex((n) => n.id === incoming.id);
          if (idx !== -1) {
            // Merge — preserve existing fields for any blank/missing incoming fields
            // (handles the tmp_xxx fallback case where taskType/taskLabel are "")
            const existing = prev[idx];
            const merged: Notification = {
              ...existing,
              ...incoming,
              // Keep original task metadata if the incoming update blanked them
              taskType:  incoming.taskType  || existing.taskType,
              taskLabel: incoming.taskLabel || existing.taskLabel,
              userName:  incoming.userName  ?? existing.userName,
              userEmail: incoming.userEmail ?? existing.userEmail,
              userId:    incoming.userId    ?? existing.userId,
            };
            const updated = [...prev];
            updated[idx] = merged;
            return updated;
          }
          // New notification — prepend
          return [incoming, ...prev];
        });

        // Ring bell for completed events (success/error/partial)
        if (incoming.type !== "processing") {
          setNewIds((prev) => new Set(prev).add(incoming.id));
          setBellRinging(true);
          setTimeout(() => setBellRinging(false), 1000);
        }

        // Recompute unread
        setNotifs((current) => { updateUnread(current); return current; });
      } catch { /* ignore malformed */ }
    });

    return () => { es.close(); };
  }, []);

  function updateUnread(notifs: Notification[]) {
    const lastSeen = getLastSeen();
    const unseen   = notifs.filter((n) => new Date(n.createdAt) > lastSeen);
    setUnreadCount(unseen.length);
    setHasError(unseen.some((n) => n.type === "error"));
  }

  // Update unread count whenever notifications change
  useEffect(() => { updateUnread(notifications); }, [notifications]);

  // ── Close panel on outside click ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inPanel = panelRef.current?.contains(target);
      const inBell  = bellRef.current?.contains(target);
      if (!inPanel && !inBell) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function openPanel() {
    setOpen(true);
    setLastSeen();
    setUnreadCount(0);
    setHasError(false);
    setNewIds(new Set());
  }

  function markAllRead() {
    setLastSeen();
    setUnreadCount(0);
    setHasError(false);
    setNewIds(new Set());
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = notifications.filter((n) => {
    if (tab === "processing") return n.type === "processing";
    if (tab === "tasks")      return n.type !== "processing";
    return true;
  });

  const processingCount = notifications.filter((n) => n.type === "processing").length;

  // ── Slide-over (portaled to document.body to escape header backdrop-filter) ─
  const slideOver = open && portalMounted ? createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />

      {/* Panel — h-screen ensures full viewport height regardless of parent CSS */}
      <div
        ref={panelRef}
        className={cn(
          "fixed right-0 top-0 h-screen w-[420px] max-w-[95vw] z-[9999]",
          "bg-background border-l border-border shadow-2xl shadow-black/40",
          "flex flex-col animate-slide-in-right",
        )}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Live Activity</h2>
              <p className="text-[10px] text-muted-foreground">
                {notifications.length} {notifications.length === 1 ? "event" : "events"} · {processingCount > 0 ? `${processingCount} running` : "all idle"}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-accent transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark read</span>
              </button>
            )}
            <button
              onClick={loadRecent}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-5 pt-3 pb-1 flex-shrink-0">
          {(["all", "tasks", "processing"] as TabFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize",
                tab === t
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {t}
              {t === "processing" && processingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/30 text-indigo-300 text-[9px] font-bold">
                  {processingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Notification List ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-2 min-h-0">
          {loading && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-8 h-8 text-muted-foreground/40 animate-spin" />
              <p className="text-xs text-muted-foreground">Loading activity…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 select-none">
              <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center">
                {tab === "processing" ? (
                  <Zap className="w-7 h-7 text-muted-foreground/30" />
                ) : (
                  <Users className="w-7 h-7 text-muted-foreground/30" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {tab === "processing" ? "Nothing running" : "No activity yet"}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-[220px] leading-relaxed">
                  {tab === "processing"
                    ? "Tasks will appear here as they execute in real-time."
                    : "Tasks you and your team run will appear here instantly."}
                </p>
              </div>
            </div>
          ) : (
            filtered.map((notif) => (
              <NotificationCard
                key={notif.id}
                notif={notif}
                isNew={newIds.has(notif.id)}
              />
            ))
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-between flex-shrink-0">
          <p className="text-[10px] text-muted-foreground/50">
            Real-time · SSE connected
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400/80 font-medium">Live</span>
          </div>
        </div>
      </div>
    </>,
    document.body,
  ) : null;

  // ── Rendered ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* Bell button stays in the header */}
      <button
        ref={bellRef}
        onClick={open ? () => setOpen(false) : openPanel}
        className={cn(
          "relative p-2 rounded-lg transition-all duration-150",
          open
            ? "bg-accent text-foreground ring-1 ring-primary/30"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
        )}
        title="Live Activity"
        aria-label="Notifications"
      >
        <Bell className={cn("w-4 h-4", bellRinging && "animate-bell")} />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className={cn(
            "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full",
            "flex items-center justify-center text-[10px] font-bold text-white px-1",
            hasError ? "bg-rose-500" : "bg-indigo-500 badge-pulse",
          )}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}

        {/* Dot for processing tasks */}
        {processingCount > 0 && unreadCount === 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
        )}
      </button>

      {/* Portaled slide-over — rendered at document.body level */}
      {slideOver}
    </>
  );
}
