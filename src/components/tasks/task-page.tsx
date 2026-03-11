"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Upload, Download, FileText, Play, Loader2, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Info, X,
  UserPlus, Users, Server, Bot, Share2, ArrowLeftRight, Briefcase, Building2,
  Key, Eye, EyeOff, Copy, Check, ShieldAlert,
} from "lucide-react";
import { cn, parseCSV, generateCSVTemplate, downloadCSV, formatDuration, generateBatchId } from "@/lib/utils";
import type { TaskDefinition, BulkItemResult, TaskExecutionResult, ServiceAccountCredentials } from "@/types";
import * as XLSX from "xlsx";

// Icon map lives client-side — no server→client function passing
const ICON_MAP: Record<string, React.ElementType> = {
  UserPlus, Users, Server, Bot, Share2, ArrowLeftRight, Briefcase, Building2,
};

// ── CredentialsModal ──────────────────────────────────────────────────────────
// Shown immediately after a service account is created.
// Displays the one-time generated password with copy helpers and requires the
// operator to acknowledge they have saved the credentials before dismissing.

function CopyButton({ value, id, copied, onCopy }: { value: string; id: string; copied: string | null; onCopy: (v: string, id: string) => void }) {
  const isCopied = copied === id;
  return (
    <button
      type="button"
      onClick={() => onCopy(value, id)}
      title={isCopied ? "Copied!" : "Copy to clipboard"}
      className={cn(
        "flex-shrink-0 p-2 rounded-lg border transition-all duration-200",
        isCopied
          ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
          : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-accent/50",
      )}
    >
      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CredentialRow({ label, value, id, copied, onCopy, mono = true }: { label: string; value: string; id: string; copied: string | null; onCopy: (v: string, id: string) => void; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground pl-1">{label}</span>
      <div className="flex items-center gap-2">
        <div className={cn("flex-1 px-3 py-2.5 rounded-lg bg-muted/40 border border-border/60 text-sm text-foreground truncate", mono && "font-mono")}>
          {value}
        </div>
        <CopyButton value={value} id={id} copied={copied} onCopy={onCopy} />
      </div>
    </div>
  );
}

function CredentialsModal({ credentials, onClose }: { credentials: ServiceAccountCredentials; onClose: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [confirmed,    setConfirmed]    = useState(false);
  const [copied,       setCopied]       = useState<string | null>(null);

  const copyToClipboard = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  };

  const copyAll = async () => {
    const lines = [
      `Account Name  : ${credentials.accountName}`,
      `UPN           : ${credentials.upn}`,
      `Password      : ${credentials.password}`,
      `OU            : ${credentials.ou}`,
      credentials.primaryOwner ? `Primary Owner : ${credentials.primaryOwner}` : null,
      credentials.backupOwner  ? `Backup Owner  : ${credentials.backupOwner}`  : null,
    ].filter(Boolean).join("\n");
    await copyToClipboard(lines, "all");
  };

  const metaRows = [
    { label: "Account Name",          value: credentials.accountName, id: "name",    mono: true  },
    { label: "User Principal Name",    value: credentials.upn,         id: "upn",     mono: true  },
    { label: "Organizational Unit",    value: credentials.ou,          id: "ou",      mono: true  },
    ...(credentials.primaryOwner ? [{ label: "Primary Owner", value: credentials.primaryOwner, id: "primary", mono: false }] : []),
    ...(credentials.backupOwner  ? [{ label: "Backup Owner",  value: credentials.backupOwner,  id: "backup",  mono: false }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={confirmed ? onClose : undefined} />

      {/* Card */}
      <div className="relative w-full max-w-lg glass rounded-2xl border border-amber-500/25 shadow-2xl shadow-black/60 flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-border/60 flex-shrink-0">
          <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-500/20 border border-amber-500/30">
            <Key className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground">Account Created Successfully</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {credentials.accountName} — credentials generated
            </p>
          </div>
          <div className="flex-shrink-0 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
            <span className="text-xs font-semibold text-emerald-400">✓ CREATED</span>
          </div>
        </div>

        {/* ── Warning banner ── */}
        <div className="mx-6 mt-5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 flex-shrink-0">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-300 mb-0.5">One-time password — save it now</p>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              This password is shown <strong className="text-amber-200">only once</strong> and is not stored anywhere.
              Copy it to a secure vault before closing this dialog.
            </p>
          </div>
        </div>

        {/* ── Scrollable credentials ── */}
        <div className="px-6 py-5 space-y-3 overflow-y-auto flex-1">
          {/* Non-sensitive rows */}
          {metaRows.map((r) => (
            <CredentialRow key={r.id} label={r.label} value={r.value} id={r.id} copied={copied} onCopy={copyToClipboard} mono={r.mono} />
          ))}

          {/* Password row — special treatment */}
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground pl-1">Password</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <div className={cn(
                  "px-3 py-2.5 pr-10 rounded-lg bg-muted/40 border border-amber-500/30 text-sm font-mono tracking-widest text-foreground",
                  !showPassword && "text-muted-foreground/70 tracking-[0.35em]",
                )}>
                  {showPassword ? credentials.password : "•".repeat(credentials.password.length)}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <CopyButton value={credentials.password} id="password" copied={copied} onCopy={copyToClipboard} />
            </div>
          </div>

          {/* Copy All */}
          <button
            type="button"
            onClick={copyAll}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 mt-2",
              copied === "all"
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                : "bg-muted/30 border-border text-foreground hover:bg-accent hover:border-primary/50",
            )}
          >
            {copied === "all" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied === "all" ? "All credentials copied to clipboard!" : "Copy All Credentials"}
          </button>
        </div>

        {/* ── Footer: confirmation + close ── */}
        <div className="px-6 pb-6 space-y-3 border-t border-border/40 pt-4 flex-shrink-0">
          {/* Confirmation checkbox */}
          <label className="flex items-center gap-3 cursor-pointer group select-none">
            <div
              className={cn(
                "w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all duration-150",
                confirmed
                  ? "bg-emerald-500 border-emerald-500"
                  : "border-border group-hover:border-primary/70 bg-transparent",
              )}
            >
              {confirmed && <Check className="w-3 h-3 text-white" />}
            </div>
            <input
              type="checkbox"
              className="sr-only"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              I have securely saved the password for this account
            </span>
          </label>

          {/* Close button */}
          <button
            type="button"
            onClick={confirmed ? onClose : undefined}
            disabled={!confirmed}
            className={cn(
              "w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200",
              confirmed
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:shadow-emerald-500/30 hover:brightness-110 active:scale-[0.99]"
                : "bg-muted/20 text-muted-foreground/40 cursor-not-allowed border border-border/30",
            )}
          >
            {confirmed ? "Done — Close" : "Check the box above to close"}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── AdUserTypeahead ───────────────────────────────────────────────────────────
// Self-contained typeahead input that searches AD users in real-time.
// The parent receives the UPN (value) on selection; the display label is
// managed internally so it decouples display text from the stored value.

interface AdUserTypeaheadProps {
  fieldName: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  value: string;           // The currently-stored UPN
  onChange: (upn: string) => void;
  hasError: boolean;
}

function AdUserTypeahead({
  fieldName,
  placeholder,
  value,
  onChange,
  hasError,
}: AdUserTypeaheadProps) {
  const [inputText,  setInputText]  = useState("");
  const [results,    setResults]    = useState<{ label: string; value: string }[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [open,       setOpen]       = useState(false);
  const [notFound,   setNotFound]   = useState(false);
  const [searchErr,  setSearchErr]  = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset display text when the external value is cleared (e.g. form reset)
  useEffect(() => {
    if (!value) setInputText("");
  }, [value]);

  // Close dropdown when clicking outside the component
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInput = (text: string) => {
    setInputText(text);
    setNotFound(false);
    setSearchErr("");

    if (!text.trim()) {
      onChange("");
      setResults([]);
      setOpen(false);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (text.trim().length < 2) return;
      setSearching(true);
      try {
        const res  = await fetch(`/api/ad/users/search?q=${encodeURIComponent(text.trim())}`);
        const data = await res.json();
        if (data.error) { setSearchErr(data.error); setResults([]); }
        else {
          const list = (data.users ?? []) as { label: string; value: string }[];
          setResults(list);
          setNotFound(list.length === 0);
        }
        setOpen(true);
      } catch {
        setSearchErr("Search failed — check AD connection");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelect = (user: { label: string; value: string }) => {
    setInputText(user.label);
    onChange(user.value);
    setOpen(false);
    setResults([]);
    setNotFound(false);
  };

  return (
    <div ref={containerRef} className="relative" data-field={fieldName}>
      <div className="relative">
        <input
          type="text"
          className={cn(
            "input-field pr-8",
            hasError && "border-rose-500/70 focus:border-rose-500 focus:shadow-rose-500/10",
          )}
          placeholder={placeholder ?? "Search by name, UPN, email or username…"}
          value={inputText}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          autoComplete="off"
        />
        {searching && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {results.map((u) => (
            <button
              key={u.value}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent/60 transition-colors text-foreground border-b border-border/40 last:border-0"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(u); }}
            >
              <span className="block font-medium leading-tight truncate">{u.label.split(" (")[0]}</span>
              <span className="block text-xs text-muted-foreground truncate">{u.value}</span>
            </button>
          ))}
        </div>
      )}

      {/* Status messages below the input */}
      {notFound && !searching && (
        <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          No user found in Active Directory
        </p>
      )}
      {searchErr && !searching && (
        <p className="text-xs text-amber-400 mt-1 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          {searchErr}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface TaskPageProps {
  task: TaskDefinition;
}

type TabType = "single" | "bulk";

export function TaskPage({ task }: TaskPageProps) {
  const Icon = ICON_MAP[task.icon] ?? Play;
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<TabType>(task.singleFields?.length ? "single" : "bulk");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<TaskExecutionResult | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkItemResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Populated after account creation — triggers CredentialsModal
  const [pendingCredentials, setPendingCredentials] = useState<ServiceAccountCredentials | null>(null);

  // ── AD user dropdown (for ad-user-select fields) ───────────────────────────
  const [adUsers, setAdUsers] = useState<{ label: string; value: string }[]>([]);
  const [adUsersLoading, setAdUsersLoading] = useState(false);
  const [adUsersError, setAdUsersError] = useState("");

  const hasAdUserSelect = (task.singleFields ?? []).some((f) => f.type === "ad-user-select");

  useEffect(() => {
    if (!hasAdUserSelect) return;
    setAdUsersLoading(true);
    setAdUsersError("");
    fetch("/api/ad/users")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setAdUsersError(data.error);
        setAdUsers(data.users ?? []);
      })
      .catch(() => setAdUsersError("Could not load AD users — check AD connection settings"))
      .finally(() => setAdUsersLoading(false));
  }, [hasAdUserSelect]);

  // ── AD OU dropdown (for ad-ou-select fields) ─────────────────────────────
  const [adOUs, setAdOUs] = useState<{ label: string; value: string }[]>([]);
  const [adOUsLoading, setAdOUsLoading] = useState(false);
  const [adOUsError, setAdOUsError] = useState("");

  const hasAdOUSelect = (task.singleFields ?? []).some((f) => f.type === "ad-ou-select");

  useEffect(() => {
    if (!hasAdOUSelect) return;
    setAdOUsLoading(true);
    setAdOUsError("");
    fetch("/api/ad/ous")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setAdOUsError(data.error);
        setAdOUs(data.ous ?? []);
      })
      .catch(() => setAdOUsError("Could not load OUs — check AD connection settings"))
      .finally(() => setAdOUsLoading(false));
  }, [hasAdOUSelect]);

  const gradient = task.gradient;

  /** Validate all single-operation fields. Returns true if valid. */
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    for (const field of task.singleFields ?? []) {
      const raw = formData[field.name] ?? "";
      const value = raw.trim();

      // Required check
      if (field.required && !value) {
        errors[field.name] = `${field.label} is required`;
        continue;
      }

      // Skip further checks if field is empty and not required
      if (!value) continue;

      // Email type — always enforce format
      if (field.type === "email") {
        const emailRe = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
        if (!emailRe.test(value)) {
          errors[field.name] =
            field.validation?.patternMessage ??
            "Must be a valid email address (e.g. user@domain.com)";
          continue;
        }
      }

      const v = field.validation;
      if (v) {
        if (v.minLength !== undefined && value.length < v.minLength) {
          errors[field.name] = `Must be at least ${v.minLength} character${v.minLength === 1 ? "" : "s"}`;
          continue;
        }
        if (v.maxLength !== undefined && value.length > v.maxLength) {
          errors[field.name] = `Must not exceed ${v.maxLength} characters`;
          continue;
        }
        if (v.pattern) {
          const re = new RegExp(v.pattern);
          if (!re.test(value)) {
            errors[field.name] = v.patternMessage ?? "Invalid format";
            continue;
          }
        }
      }
    }

    // ── Cross-field validation: Primary Owner ≠ Backup Owner ──────────────
    if (
      task.id === "CREATE_SERVICE_ACCOUNTS" ||
      task.id === "CREATE_RPA_ACCOUNTS" ||
      task.id === "CREATE_SHARED_ACCOUNTS"
    ) {
      const primary = (formData["primaryOwner"] ?? "").trim().toLowerCase();
      const backup  = (formData["backupOwner"]  ?? "").trim().toLowerCase();
      if (primary && backup && primary === backup) {
        errors["backupOwner"] = "Backup Owner cannot be the same as Primary Owner";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /** Clear the error for a single field as the user types */
  const clearError = (name: string) => {
    if (fieldErrors[name]) setFieldErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
  };

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();

    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          setCsvData(data);
          toast.success(`Loaded ${data.length} rows from ${file.name}`);
        } catch {
          toast.error("Failed to parse Excel file");
        }
      };
      reader.readAsBinaryString(file);
    } else {
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        setCsvData(parsed);
        toast.success(`Loaded ${parsed.length} rows from ${file.name}`);
      };
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
    maxFiles: 1,
  });

  const handleDownloadTemplate = () => {
    const headers = task.bulkColumns ?? [];
    const sample = task.csvTemplate ?? [];
    const content = generateCSVTemplate(headers, sample);
    downloadCSV(content, `${task.id.toLowerCase()}_template.csv`);
    toast.success("Template downloaded");
  };

  const executeSingle = async () => {
    if (!validateForm()) {
      toast.error("Please fix the highlighted errors before submitting");
      return;
    }
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch("/api/tasks/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: task.id, mode: "single", params: formData }),
      });
      const data: TaskExecutionResult = await res.json();
      setResult(data);
      if (data.success) {
        if (data.credentials) {
          // Show password modal instead of a simple toast for account-creation tasks
          setPendingCredentials(data.credentials);
        } else {
          toast.success("Task completed successfully!");
        }
      } else {
        toast.error(data.message ?? "Task failed");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setExecuting(false);
    }
  };

  const executeBulk = async () => {
    if (csvData.length === 0) {
      toast.error("Please upload a CSV/Excel file first");
      return;
    }
    setExecuting(true);
    setBulkResults([]);
    setProgress(0);

    const batchId = generateBatchId();

    try {
      const res = await fetch("/api/tasks/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: task.id, mode: "bulk", data: csvData, batchId }),
      });

      if (!res.ok) throw new Error("Request failed");

      const result = await res.json();
      setBulkResults(result.results ?? []);
      setProgress(100);

      const successCount = result.successCount ?? 0;
      const failCount = result.failureCount ?? 0;
      if (failCount === 0) toast.success(`All ${successCount} items processed successfully!`);
      else if (successCount === 0) toast.error(`All ${failCount} items failed`);
      else toast(`${successCount} succeeded, ${failCount} failed`, { icon: "⚠️" });
    } catch {
      toast.error("Bulk execution failed. Please try again.");
    } finally {
      setExecuting(false);
    }
  };

  const exportResults = () => {
    if (bulkResults.length === 0) return;
    const rows = bulkResults.map((r) => ({
      Row: r.row,
      Identifier: r.identifier,
      Status: r.status.toUpperCase(),
      Message: r.message,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, `${task.id.toLowerCase()}_results_${Date.now()}.xlsx`);
    toast.success("Results exported");
  };

  const successCount = bulkResults.filter((r) => r.status === "success").length;
  const failCount = bulkResults.filter((r) => r.status === "failure").length;

  return (
    <>
    <div className="space-y-6 animate-fade-in">
      {/* Page Header Card */}
      <div className={`relative glass rounded-2xl p-6 overflow-hidden`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-5`} />
        <div className="absolute top-0 right-0 w-48 h-48 -translate-y-12 translate-x-12 rounded-full opacity-10 bg-gradient-to-br from-white to-transparent" />
        <div className="relative flex items-center gap-4">
          <div className={`p-3.5 rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}>
            <Icon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{task.label}</h2>
            <p className="text-muted-foreground mt-0.5">{task.description}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 w-fit border border-border">
        {task.singleFields?.length ? (
          <button
            onClick={() => setActiveTab("single")}
            className={cn("px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150", activeTab === "single" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            Single Operation
          </button>
        ) : null}
        <button
          onClick={() => setActiveTab("bulk")}
          className={cn("px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150", activeTab === "bulk" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          Bulk Operation
        </button>
      </div>

      {/* Single Operation Form */}
      {activeTab === "single" && task.singleFields && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="form-section">
            <h3 className="font-semibold text-foreground mb-4">Task Parameters</h3>
            <div className="space-y-4">
              {task.singleFields.map((field) => {
                const hasError = !!fieldErrors[field.name];
                return (
                  <div key={field.name} className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground/90">
                      {field.label}
                      {field.required && <span className="text-rose-400 ml-1">*</span>}
                    </label>
                    {field.type === "textarea" ? (
                      <textarea
                        className={cn("input-field resize-none h-24", hasError && "border-rose-500/70 focus:border-rose-500 focus:shadow-rose-500/10")}
                        placeholder={field.placeholder}
                        value={formData[field.name] ?? ""}
                        onChange={(e) => { setFormData({ ...formData, [field.name]: e.target.value }); clearError(field.name); }}
                      />
                    ) : field.type === "select" ? (
                      <select
                        className={cn("input-field", hasError && "border-rose-500/70")}
                        value={formData[field.name] ?? ""}
                        onChange={(e) => { setFormData({ ...formData, [field.name]: e.target.value }); clearError(field.name); }}
                      >
                        <option value="">Select...</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : field.type === "ad-user-select" ? (
                      <>
                        <select
                          className={cn("input-field", hasError && "border-rose-500/70", adUsersLoading && "opacity-60")}
                          value={formData[field.name] ?? ""}
                          disabled={adUsersLoading}
                          onChange={(e) => { setFormData({ ...formData, [field.name]: e.target.value }); clearError(field.name); }}
                        >
                          <option value="">
                            {adUsersLoading ? "Loading AD users…" : adUsersError ? "Failed to load — see error below" : `Select ${field.label}…`}
                          </option>
                          {adUsers.map((u) => (
                            <option key={u.value} value={u.value}>{u.label}</option>
                          ))}
                        </select>
                        {adUsersError && !adUsersLoading && (
                          <p className="flex items-center gap-1.5 text-xs text-amber-400 mt-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                            {adUsersError}
                          </p>
                        )}
                        {!adUsersLoading && !adUsersError && adUsers.length === 0 && (
                          <p className="text-xs text-muted-foreground/60 mt-1">No matching users found in AD</p>
                        )}
                      </>
                    ) : field.type === "ad-ou-select" ? (
                      <>
                        <select
                          className={cn("input-field", hasError && "border-rose-500/70", adOUsLoading && "opacity-60")}
                          value={formData[field.name] ?? ""}
                          disabled={adOUsLoading}
                          onChange={(e) => { setFormData({ ...formData, [field.name]: e.target.value }); clearError(field.name); }}
                        >
                          <option value="">
                            {adOUsLoading ? "Loading OUs from AD…" : adOUsError ? "Failed to load — see error below" : "Select Organizational Unit…"}
                          </option>
                          {adOUs.map((ou) => (
                            <option key={ou.value} value={ou.value}>{ou.label}</option>
                          ))}
                        </select>
                        {adOUsError && !adOUsLoading && (
                          <p className="flex items-center gap-1.5 text-xs text-amber-400 mt-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                            {adOUsError}
                          </p>
                        )}
                        {!adOUsLoading && !adOUsError && adOUs.length === 0 && (
                          <p className="text-xs text-muted-foreground/60 mt-1">No OUs found in AD</p>
                        )}
                      </>
                    ) : field.type === "ad-user-typeahead" ? (
                      <AdUserTypeahead
                        fieldName={field.name}
                        label={field.label}
                        placeholder={field.placeholder}
                        required={field.required}
                        value={formData[field.name] ?? ""}
                        onChange={(upn) => { setFormData((prev) => ({ ...prev, [field.name]: upn })); clearError(field.name); }}
                        hasError={hasError}
                      />
                    ) : (
                      <input
                        type={field.type}
                        className={cn("input-field", hasError && "border-rose-500/70 focus:border-rose-500 focus:shadow-rose-500/10")}
                        placeholder={field.placeholder}
                        value={formData[field.name] ?? ""}
                        onChange={(e) => { setFormData({ ...formData, [field.name]: e.target.value }); clearError(field.name); }}
                      />
                    )}
                    {hasError && (
                      <p className="flex items-center gap-1.5 text-xs text-rose-400 mt-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        {fieldErrors[field.name]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={executeSingle}
              disabled={executing}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 mt-2"
            >
              {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {executing ? "Executing..." : "Execute Task"}
            </button>
          </div>

          {/* Single Result */}
          {result && (
            <div className={cn("form-section border", result.success ? "border-emerald-500/20" : "border-rose-500/20")}>
              <div className="flex items-center gap-3 mb-4">
                {result.success ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                ) : (
                  <XCircle className="w-6 h-6 text-rose-400" />
                )}
                <div>
                  <h3 className="font-semibold text-foreground">
                    {result.success ? "Task Completed" : "Task Failed"}
                  </h3>
                  <p className="text-xs text-muted-foreground">{result.duration ? formatDuration(result.duration) : ""}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{result.message}</p>
              {result.output && (
                <div>
                  <button
                    onClick={() => setShowRawOutput(!showRawOutput)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    {showRawOutput ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showRawOutput ? "Hide" : "Show"} Task Output
                  </button>
                  {showRawOutput && (
                    <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono text-muted-foreground overflow-x-auto border border-border">
                      {result.output}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bulk Operation */}
      {activeTab === "bulk" && (
        <div className="space-y-5">
          {/* Upload + Download Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Upload Zone */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">Upload Data File</h3>
                <button onClick={handleDownloadTemplate} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Download Template
                </button>
              </div>
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-150",
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-accent/50"
                )}
              >
                <input {...getInputProps()} />
                {csvData.length > 0 ? (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center mx-auto">
                      <FileText className="w-6 h-6 text-emerald-400" />
                    </div>
                    <p className="font-semibold text-foreground">{fileName}</p>
                    <p className="text-sm text-emerald-400">{csvData.length} rows loaded</p>
                    <button onClick={(e) => { e.stopPropagation(); setCsvData([]); setFileName(""); }} className="text-xs text-muted-foreground hover:text-rose-400 transition-colors flex items-center gap-1 mx-auto">
                      <X className="w-3 h-3" /> Clear file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} opacity-60 flex items-center justify-center mx-auto`}>
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{isDragActive ? "Drop file here" : "Drag & drop your file"}</p>
                      <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                    </div>
                    <p className="text-xs text-muted-foreground/60">Supports CSV, XLS, XLSX</p>
                  </div>
                )}
              </div>
            </div>

            {/* Column Guide */}
            <div className="form-section">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Required Columns</h3>
              </div>
              <div className="space-y-2">
                {(task.bulkColumns ?? []).map((col, i) => (
                  <div key={col} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    <code className="text-xs font-mono text-foreground/90">{col}</code>
                  </div>
                ))}
              </div>
              {task.csvTemplate && (
                <div className="mt-4 p-3 bg-muted/40 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Sample Row:</p>
                  {Object.entries(task.csvTemplate[0] ?? {}).slice(0, 3).map(([k, v]) => (
                    <p key={k} className="text-xs font-mono text-muted-foreground/80 truncate">{k}: <span className="text-foreground/70">{String(v)}</span></p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Preview Table */}
          {csvData.length > 0 && (
            <div className="glass rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h3 className="font-semibold text-foreground text-sm">Data Preview ({csvData.length} rows)</h3>
                <span className="text-xs text-muted-foreground">Showing first 5 rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full data-table">
                  <thead>
                    <tr>
                      {Object.keys(csvData[0] ?? {}).map((h) => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="text-muted-foreground text-xs font-mono max-w-[200px] truncate">{String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Execute Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={executeBulk}
              disabled={executing || csvData.length === 0}
              className="btn-primary flex items-center gap-2 py-2.5 px-6 disabled:opacity-50"
            >
              {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {executing ? `Processing ${csvData.length} items...` : `Execute Bulk (${csvData.length} items)`}
            </button>
            {bulkResults.length > 0 && (
              <button onClick={exportResults} className="btn-secondary flex items-center gap-2 py-2.5 px-4">
                <Download className="w-4 h-4" />
                Export Results
              </button>
            )}
          </div>

          {/* Progress Bar */}
          {executing && (
            <div className="glass rounded-xl p-4 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Processing bulk operation...</span>
                <span className="text-xs text-muted-foreground font-mono">{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${gradient} transition-all duration-300`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Bulk Results */}
          {bulkResults.length > 0 && (
            <div className="glass rounded-xl overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Execution Results</h3>
                <div className="flex items-center gap-3">
                  <span className="badge success"><CheckCircle2 className="w-3 h-3" />{successCount} Success</span>
                  <span className="badge failure"><XCircle className="w-3 h-3" />{failCount} Failed</span>
                </div>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full data-table">
                  <thead className="sticky top-0">
                    <tr>
                      <th>#</th>
                      <th>Identifier</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.map((r) => (
                      <tr key={r.row}>
                        <td className="text-muted-foreground text-xs font-mono">{r.row}</td>
                        <td className="text-foreground text-xs font-medium">{r.identifier}</td>
                        <td>
                          <span className={cn("badge", r.status)}>
                            {r.status === "success" ? <CheckCircle2 className="w-3 h-3" /> : r.status === "failure" ? <XCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            {r.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="text-muted-foreground text-xs max-w-xs truncate">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>

    {/* CredentialsModal sits outside animate-fade-in to avoid transform containing-block issue */}
    {pendingCredentials && (
      <CredentialsModal
        credentials={pendingCredentials}
        onClose={() => setPendingCredentials(null)}
      />
    )}
    </>
  );
}
