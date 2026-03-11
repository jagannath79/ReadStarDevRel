export type UserRole = "ADMIN" | "OPERATOR" | "VIEWER" | "USER";

export type TaskType =
  | "ADD_USER_TO_GROUP"
  | "BULK_ADD_USERS_TO_GROUP"
  | "CREATE_SERVICE_ACCOUNTS"
  | "CREATE_RPA_ACCOUNTS"
  | "CREATE_SHARED_ACCOUNTS"
  | "IL_TO_EL_CONVERSION"
  | "ONBOARD_WORKDAY"
  | "ONBOARD_VNDLY";

export type TaskStatus = "SUCCESS" | "FAILURE" | "PARTIAL" | "RUNNING" | "PENDING";

export type AuthProvider = "credentials" | "azure-ad" | "both";

export interface TaskDefinition {
  id: TaskType;
  label: string;
  description: string;
  icon: string;
  color: string;
  gradient: string;
  href: string;
  category: string;
  singleFields?: FormField[];
  bulkColumns?: string[];
  csvTemplate?: Record<string, string>[];
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  /** A regex string (without delimiters) the value must match */
  pattern?: string;
  /** Human-readable message shown when pattern fails */
  patternMessage?: string;
}

export interface FormField {
  name: string;
  label: string;
  /**
   * ad-user-select:    static dropdown auto-populated from /api/ad/users
   * ad-ou-select:      dropdown of all OUs fetched from /api/ad/ous
   * ad-user-typeahead: live search input that queries /api/ad/users/search
   */
  type: "text" | "email" | "select" | "textarea" | "password" | "ad-user-select" | "ad-ou-select" | "ad-user-typeahead";
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  validation?: FieldValidation;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  action: string;
  taskType: string;
  status: TaskStatus;
  details?: Record<string, unknown>;
  targetUsers?: string[];
  duration?: number;
  errorMessage?: string;
  ipAddress?: string;
  batchId?: string;
  itemCount?: number;
  successCount?: number;
  failureCount?: number;
  psScript?: string;
}

export interface AppSettings {
  general: {
    appName: string;
    company: string;
    timezone: string;
    dateFormat: string;
    sessionTimeout: number;
  };
  auth: {
    provider: AuthProvider;
    upnDomain: string;
    requireMFA: boolean;
    sessionDuration: number;
    entraAd: {
      enabled: boolean;
      clientId: string;
      tenantId: string;
      clientSecret: string;
      redirectUri: string;
    };
  };
  powershell: {
    scriptsPath: string;
    executionPolicy: string;
    timeoutMs: number;
    verboseLogging: boolean;
  };
  activeDirectory: {
    domain: string;
    dcServer: string;
    baseOu: string;
    ouUsers: string;
    ouService: string;
    ouRpa: string;
    ouShared: string;
  };
  notifications: {
    emailEnabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpFrom: string;
    notifyOnFailure: boolean;
    notifyOnSuccess: boolean;
  };
}

export interface ServiceAccountCredentials {
  accountName: string;
  upn: string;
  password: string;
  ou: string;
  primaryOwner?: string;
  backupOwner?: string;
}

export interface TaskExecutionResult {
  success: boolean;
  status: TaskStatus;
  message: string;
  details?: Record<string, unknown>;
  duration?: number;
  output?: string;
  error?: string;
  /** Populated for service/RPA/shared account creation — shown once in UI. */
  credentials?: ServiceAccountCredentials;
}

export interface BulkTaskResult {
  batchId: string;
  total: number;
  successCount: number;
  failureCount: number;
  results: BulkItemResult[];
  duration?: number;
}

export interface BulkItemResult {
  row: number;
  identifier: string;
  status: "success" | "failure" | "skipped";
  message: string;
  details?: Record<string, unknown>;
}

export interface DashboardStats {
  totalExecutions: number;
  successRate: number;
  activeUsers: number;
  todayExecutions: number;
  weeklyTrend: { date: string; count: number; success: number; failure: number }[];
  taskDistribution: { name: string; value: number; color: string }[];
  recentActivity: AuditLog[];
}

export interface SidebarItem {
  label: string;
  href: string;
  icon: string;
  badge?: string | number;
  children?: SidebarItem[];
}
