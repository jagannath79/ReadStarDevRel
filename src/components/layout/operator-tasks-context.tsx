"use client";

/**
 * OperatorTasksContext
 *
 * Fetches the operator task-access map from GET /api/settings/operator-tasks
 * ONCE at the dashboard layout level and provides it to all children.
 *
 * - Admins always have access to every task (shortcircuited at consumer level).
 * - Operators see only tasks where enabledTasks[taskId] === true.
 * - While loading, enabledTasks is null — consumers treat this as "all enabled"
 *   to avoid flickering / hiding tasks before the fetch completes.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useSession } from "next-auth/react";

type EnabledTasksMap = Record<string, boolean>; // taskId → enabled

interface OperatorTasksCtx {
  /** null = still loading; Record otherwise */
  enabledTasks: EnabledTasksMap | null;
  /** Convenience helper — always true for admins */
  isTaskEnabled: (taskId: string) => boolean;
  /** Reload from server (called after admin saves settings) */
  refresh: () => void;
}

const Ctx = createContext<OperatorTasksCtx>({
  enabledTasks: null,
  isTaskEnabled: () => true,
  refresh: () => {},
});

export function OperatorTasksProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [enabledTasks, setEnabledTasks] = useState<EnabledTasksMap | null>(null);

  const load = useCallback(async () => {
    // Admins bypass the fetch entirely — they always have full access
    if (isAdmin) {
      setEnabledTasks({}); // empty map — isTaskEnabled() returns true for admins
      return;
    }
    try {
      const res = await fetch("/api/settings/operator-tasks");
      if (res.ok) {
        const data: EnabledTasksMap = await res.json();
        setEnabledTasks(data);
      }
    } catch {
      // On error, default to all enabled so operators aren't accidentally locked out
      setEnabledTasks({});
    }
  }, [isAdmin]);

  // Load once on mount (session must be available)
  useEffect(() => {
    if (session) load();
  }, [session, load]);

  function isTaskEnabled(taskId: string): boolean {
    // Admins always have access
    if (isAdmin) return true;
    // While loading, default to enabled (prevents flicker)
    if (enabledTasks === null) return true;
    // Explicit false = disabled; anything else (true or missing) = enabled
    return enabledTasks[taskId] !== false;
  }

  return (
    <Ctx.Provider value={{ enabledTasks, isTaskEnabled, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOperatorTasks() {
  return useContext(Ctx);
}
