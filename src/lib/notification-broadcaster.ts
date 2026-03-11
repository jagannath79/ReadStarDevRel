/**
 * notification-broadcaster.ts
 *
 * Server-side singleton that:
 *  1. Maintains a Set of all active SSE client controllers.
 *  2. Writes new Notification rows to the DB.
 *  3. Pushes the new event to every connected SSE client in real-time.
 *
 * Architecture: module-level state survives across requests in the same
 * Node.js process (Next.js dev hot-reload aside). This gives us a
 * lightweight pub-sub without a separate Redis/queue layer.
 */

import { prisma } from "./prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotificationPayload {
  id:           string;
  type:         "processing" | "success" | "error" | "partial";
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
  auditLogId?:  string | null;
  createdAt:    string; // ISO
}

export interface CreateNotificationInput {
  type:         "processing" | "success" | "error" | "partial";
  taskType:     string;
  taskLabel:    string;
  title:        string;
  message:      string;
  userId?:      string | null;
  userName?:    string | null;
  userEmail?:   string | null;
  isBulk?:      boolean;
  itemCount?:   number | null;
  successCount?: number | null;
  failureCount?: number | null;
  duration?:    number | null;
  auditLogId?:  string | null;
}

// ── SSE client registry ───────────────────────────────────────────────────────

// Use a module-level global to survive Next.js fast-refresh reloads.
// In production (Node.js single process) this is just a plain Set.
declare global {
  // eslint-disable-next-line no-var
  var __sseClients: Set<ReadableStreamDefaultController<Uint8Array>> | undefined;
}

function getClients(): Set<ReadableStreamDefaultController<Uint8Array>> {
  if (!globalThis.__sseClients) {
    globalThis.__sseClients = new Set();
  }
  return globalThis.__sseClients;
}

export function addSSEClient(
  ctrl: ReadableStreamDefaultController<Uint8Array>,
): void {
  getClients().add(ctrl);
}

export function removeSSEClient(
  ctrl: ReadableStreamDefaultController<Uint8Array>,
): void {
  getClients().delete(ctrl);
}

export function getSSEClientCount(): number {
  return getClients().size;
}

// ── Broadcast helper ──────────────────────────────────────────────────────────

const encoder = new TextEncoder();

export function broadcastNotification(payload: NotificationPayload): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  const bytes = encoder.encode(data);
  const dead: ReadableStreamDefaultController<Uint8Array>[] = [];

  Array.from(getClients()).forEach((ctrl) => {
    try {
      ctrl.enqueue(bytes);
    } catch {
      // Client has disconnected — mark for removal
      dead.push(ctrl);
    }
  });

  dead.forEach((ctrl) => getClients().delete(ctrl));
}

// ── DB + broadcast ────────────────────────────────────────────────────────────

/**
 * Create a Notification row in the DB, then immediately broadcast it to all
 * connected SSE clients.
 * Returns the created notification's id (needed to update it later).
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<string> {
  // Generate a fallback id used when the DB write is skipped
  const fallbackId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    const notif = await prisma.notification.create({
      data: {
        type:         input.type,
        taskType:     input.taskType,
        taskLabel:    input.taskLabel,
        title:        input.title,
        message:      input.message,
        userId:       input.userId   ?? null,
        userName:     input.userName  ?? null,
        userEmail:    input.userEmail ?? null,
        isBulk:       input.isBulk   ?? false,
        itemCount:    input.itemCount    ?? null,
        successCount: input.successCount ?? null,
        failureCount: input.failureCount ?? null,
        duration:     input.duration     ?? null,
        auditLogId:   input.auditLogId   ?? null,
      },
    });

    broadcastNotification({
      ...input,
      id:           notif.id,
      isBulk:       notif.isBulk,
      createdAt:    notif.createdAt.toISOString(),
    });

    return notif.id;
  } catch (err) {
    // Log the error so it's visible in the server console
    console.error("[Notifications] createNotification DB error:", err);
    console.warn("[Notifications] Falling back to broadcast-only (no DB persistence). Restart the dev server if this persists.");

    // Still push SSE broadcast so the UI stays live even without DB persistence
    try {
      broadcastNotification({
        ...input,
        id:        fallbackId,
        isBulk:    input.isBulk ?? false,
        createdAt: new Date().toISOString(),
      });
    } catch { /* ignore broadcast failure */ }

    return fallbackId;
  }
}

/**
 * Update an existing Notification row (e.g. change type from "processing"
 * to "success" once the task completes) and re-broadcast the updated payload.
 */
export async function updateNotification(
  id: string,
  patch: Partial<Omit<CreateNotificationInput, "taskType" | "taskLabel">>,
): Promise<void> {
  if (!id) return;
  // Skip DB update for fallback (in-memory-only) notification ids
  if (id.startsWith("tmp_")) {
    // Re-broadcast the update as a best-effort SSE push without DB persistence
    try {
      broadcastNotification({
        id,
        type:         (patch.type ?? "success") as NotificationPayload["type"],
        taskType:     "",
        taskLabel:    "",
        title:        patch.title        ?? "",
        message:      patch.message      ?? "",
        isBulk:       patch.isBulk       ?? false,
        duration:     patch.duration     ?? null,
        successCount: patch.successCount ?? null,
        failureCount: patch.failureCount ?? null,
        itemCount:    patch.itemCount    ?? null,
        auditLogId:   patch.auditLogId   ?? null,
        createdAt:    new Date().toISOString(),
      });
    } catch { /* ignore */ }
    return;
  }
  try {
    const notif = await prisma.notification.update({
      where: { id },
      data: {
        ...(patch.type         !== undefined ? { type:         patch.type }         : {}),
        ...(patch.title        !== undefined ? { title:        patch.title }        : {}),
        ...(patch.message      !== undefined ? { message:      patch.message }      : {}),
        ...(patch.duration     !== undefined ? { duration:     patch.duration }     : {}),
        ...(patch.auditLogId   !== undefined ? { auditLogId:   patch.auditLogId }   : {}),
        ...(patch.successCount !== undefined ? { successCount: patch.successCount } : {}),
        ...(patch.failureCount !== undefined ? { failureCount: patch.failureCount } : {}),
        ...(patch.itemCount    !== undefined ? { itemCount:    patch.itemCount }    : {}),
      },
    });

    broadcastNotification({
      id:           notif.id,
      type:         notif.type as NotificationPayload["type"],
      taskType:     notif.taskType,
      taskLabel:    notif.taskLabel,
      title:        notif.title,
      message:      notif.message,
      userId:       notif.userId,
      userName:     notif.userName,
      userEmail:    notif.userEmail,
      isBulk:       notif.isBulk,
      itemCount:    notif.itemCount,
      successCount: notif.successCount,
      failureCount: notif.failureCount,
      duration:     notif.duration,
      auditLogId:   notif.auditLogId,
      createdAt:    notif.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("[Notifications] updateNotification error:", err);
  }
}
