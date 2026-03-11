"use client";

/**
 * <RelativeTime>
 *
 * Renders a relative timestamp (e.g. "2 days ago") safely in a Next.js / SSR
 * environment without causing React hydration mismatches.
 *
 * Problem: formatDistanceToNow() returns a string that depends on "now".
 * The server renders at time T, the client hydrates at T+δ, and the strings
 * differ → React throws "Text content does not match server-rendered HTML".
 *
 * Solution:
 *   • During SSR / first render: emit the *absolute* date in a compact format
 *     (e.g. "Mar 7, 2026").  Both server and client produce the same string.
 *   • After the first client-side useEffect fires: switch to the relative
 *     string.  Because this happens AFTER hydration, React never compares the
 *     two strings and no warning is thrown.
 *   • A 60-second interval keeps the relative string fresh while the tab is open.
 */

import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";

interface RelativeTimeProps {
  /** ISO string or Date object to display */
  date: string | Date;
  /** Optional extra CSS classes forwarded to the <span> */
  className?: string;
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  // null  → component hasn't mounted yet (SSR or first paint); show absolute date
  // string → component is mounted on the client; show relative time
  const [relative, setRelative] = useState<string | null>(null);

  useEffect(() => {
    // Immediately switch to relative time after hydration
    setRelative(formatDistanceToNow(new Date(date), { addSuffix: true }));

    // Refresh every 60 s so "just now" → "1 minute ago" etc.
    const id = setInterval(() => {
      setRelative(formatDistanceToNow(new Date(date), { addSuffix: true }));
    }, 60_000);

    return () => clearInterval(id);
  }, [date]);

  return (
    // suppressHydrationWarning is an extra safety net in case the absolute
    // date string itself differs due to timezone — unlikely but harmless.
    <span className={className} suppressHydrationWarning>
      {relative ?? format(new Date(date), "MMM d, yyyy")}
    </span>
  );
}
