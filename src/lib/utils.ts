import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = "PPP p"): string {
  return format(new Date(date), fmt);
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "SUCCESS": return "text-emerald-400";
    case "FAILURE": return "text-rose-400";
    case "PARTIAL": return "text-amber-400";
    case "RUNNING": return "text-blue-400";
    case "PENDING": return "text-slate-400";
    default: return "text-slate-400";
  }
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "SUCCESS": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "FAILURE": return "bg-rose-500/20 text-rose-400 border-rose-500/30";
    case "PARTIAL": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "RUNNING": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "PENDING": return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  }
}

export function getTaskLabel(taskType: string): string {
  const labels: Record<string, string> = {
    ADD_USER_TO_GROUP: "Add User to Group",
    BULK_ADD_USERS_TO_GROUP: "Bulk Add Users to Group",
    CREATE_SERVICE_ACCOUNTS: "Create Service Accounts",
    CREATE_RPA_ACCOUNTS: "Create RPA Accounts",
    CREATE_SHARED_ACCOUNTS: "Create Shared Accounts",
    IL_TO_EL_CONVERSION: "IL to EL Conversion",
    ONBOARD_WORKDAY: "Onboard Workday Associates",
    ONBOARD_VNDLY: "Onboard VNDLY ELs",
  };
  return labels[taskType] || taskType;
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
    return headers.reduce<Record<string, string>>((acc, h, i) => {
      acc[h] = values[i] ?? "";
      return acc;
    }, {});
  });
}

export function generateCSVTemplate(headers: string[], sampleRows?: Record<string, string>[]): string {
  const rows = sampleRows ?? [];
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(","))];
  return lines.join("\n");
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function truncate(str: string, maxLength = 50): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}...`;
}

export function generateBatchId(): string {
  return `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

export function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
