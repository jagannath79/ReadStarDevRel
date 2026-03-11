import type { TaskDefinition } from "@/types";

export const TASKS: TaskDefinition[] = [
  {
    id: "ADD_USER_TO_GROUP",
    label: "Add User to Group",
    description: "Add a single AD user to one or more Active Directory security groups",
    icon: "UserPlus",
    color: "indigo",
    gradient: "from-indigo-500 to-violet-600",
    href: "/tasks/add-user-to-group",
    category: "Group Management",
    singleFields: [
      {
        name: "userUpn", label: "User UPN", type: "email", placeholder: "user@company.com", required: true,
        validation: {
          pattern: "^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$",
          patternMessage: "Must be a valid UPN / email address (e.g. user@company.com)",
          maxLength: 256,
        },
      },
      {
        name: "groupName", label: "Group Name", type: "text", placeholder: "SG-Department-Access", required: true,
        validation: {
          minLength: 2,
          maxLength: 128,
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9 _\\-\\.]*$",
          patternMessage: "Group name must start with a letter or number and contain only letters, numbers, spaces, hyphens, underscores, or dots",
        },
      },
      {
        name: "requestNumber", label: "Request Number", type: "text", placeholder: "REQ-12345", required: true,
        validation: {
          minLength: 2,
          maxLength: 50,
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9 _\\-\\.#]*$",
          patternMessage: "Request number must start with a letter or number and contain only letters, numbers, spaces, hyphens, underscores, dots, or #",
        },
      },
    ],
    bulkColumns: ["UserUPN", "GroupName", "RequestNumber"],
    csvTemplate: [{ UserUPN: "john.doe@company.com", GroupName: "SG-IT-Access", RequestNumber: "REQ-12345" }],
  },
  {
    id: "BULK_ADD_USERS_TO_GROUP",
    label: "Bulk Add Users to Group",
    description: "Add multiple users to Active Directory groups via CSV upload",
    icon: "Users",
    color: "violet",
    gradient: "from-violet-500 to-purple-600",
    href: "/tasks/bulk-add-users",
    category: "Group Management",
    bulkColumns: ["UserUPN", "GroupName"],
    csvTemplate: [
      { UserUPN: "john.doe@company.com", GroupName: "SG-IT-Access" },
      { UserUPN: "jane.smith@company.com", GroupName: "SG-Finance-Access" },
    ],
  },
  {
    id: "CREATE_SERVICE_ACCOUNTS",
    label: "Create Service Accounts",
    description: "Provision new service accounts in Active Directory",
    icon: "Server",
    color: "cyan",
    gradient: "from-cyan-500 to-blue-600",
    href: "/tasks/service-accounts",
    category: "Account Provisioning",
    singleFields: [
      {
        name: "requestNumber", label: "Request Number", type: "text", placeholder: "REQ-12345", required: true,
        validation: {
          minLength: 2, maxLength: 50,
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9 _\\-\\.#]*$",
          patternMessage: "Request number must start with a letter or number",
        },
      },
      {
        name: "accountName", label: "Account Name", type: "text", placeholder: "svc-appname-env", required: true,
        validation: {
          minLength: 3, maxLength: 64,
          pattern: "^svc-[a-zA-Z0-9][a-zA-Z0-9\\-]*$",
          patternMessage: "Service account name must start with 'svc-' and contain only letters, numbers, and hyphens",
        },
      },
      {
        name: "description", label: "Description", type: "text", placeholder: "Service account for...", required: true,
        validation: { minLength: 5, maxLength: 256 },
      },
      {
        name: "ou", label: "Organizational Unit (OU)", type: "ad-ou-select",
        placeholder: "Select an OU from Active Directory", required: true,
      },
      {
        name: "primaryOwner", label: "Service Account Primary Owner", type: "ad-user-typeahead",
        placeholder: "Search by name, UPN, email or username…", required: true,
      },
      {
        name: "backupOwner", label: "Service Account Backup Owner", type: "ad-user-typeahead",
        placeholder: "Search by name, UPN, email or username…", required: true,
      },
      {
        name: "businessJustification", label: "Business Justification", type: "textarea",
        placeholder: "Describe the business need for this service account...", required: true,
        validation: { minLength: 10, maxLength: 1000 },
      },
    ],
    bulkColumns: ["RequestNumber", "AccountName", "Description", "OU", "PrimaryOwner", "BackupOwner", "BusinessJustification"],
    csvTemplate: [{
      RequestNumber: "REQ-12345",
      AccountName: "svc-app1-prod",
      Description: "Service account for App1 production",
      OU: "OU=ServiceAccounts,DC=company,DC=com",
      PrimaryOwner: "john.doe@company.com",
      BackupOwner: "jane.smith@company.com",
      BusinessJustification: "Required for automated deployments",
    }],
  },
  {
    id: "CREATE_RPA_ACCOUNTS",
    label: "Create RPA Accounts",
    description: "Provision Robotic Process Automation accounts in Active Directory",
    icon: "Bot",
    color: "emerald",
    gradient: "from-emerald-500 to-teal-600",
    href: "/tasks/rpa-accounts",
    category: "Account Provisioning",
    singleFields: [
      {
        name: "requestNumber", label: "Request Number", type: "text", placeholder: "REQ-12345", required: true,
        validation: {
          minLength: 2, maxLength: 50,
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9 _\\-\\.#]*$",
          patternMessage: "Request number must start with a letter or number",
        },
      },
      {
        name: "accountName", label: "RPA Account Name", type: "text", placeholder: "RPA-process-name", required: true,
        validation: {
          minLength: 3, maxLength: 64,
          pattern: "^RPA-[a-zA-Z0-9][a-zA-Z0-9\\-]*$",
          patternMessage: "RPA account name must start with 'RPA-' and contain only letters, numbers, and hyphens",
        },
      },
      {
        name: "processName", label: "Process Name", type: "text", placeholder: "Invoice Processing Bot", required: true,
        validation: { minLength: 3, maxLength: 128 },
      },
      {
        name: "ou", label: "Organizational Unit (OU)", type: "ad-ou-select",
        placeholder: "Select an OU from Active Directory", required: true,
      },
      {
        name: "primaryOwner", label: "RPA Account Primary Owner", type: "ad-user-typeahead",
        placeholder: "Search by name, UPN, email or username…", required: true,
      },
      {
        name: "backupOwner", label: "RPA Account Backup Owner", type: "ad-user-typeahead",
        placeholder: "Search by name, UPN, email or username…", required: true,
      },
      {
        name: "businessJustification", label: "Business Justification", type: "textarea",
        placeholder: "Describe the business need for this RPA account...", required: true,
        validation: { minLength: 10, maxLength: 1000 },
      },
    ],
    bulkColumns: ["RequestNumber", "AccountName", "ProcessName", "OU", "PrimaryOwner", "BackupOwner", "BusinessJustification"],
    csvTemplate: [{
      RequestNumber: "REQ-12345",
      AccountName: "RPA-invoice-proc",
      ProcessName: "Invoice Processing",
      OU: "OU=RPAAccounts,DC=company,DC=com",
      PrimaryOwner: "john.doe@company.com",
      BackupOwner: "jane.smith@company.com",
      BusinessJustification: "Required for automated invoice processing",
    }],
  },
  {
    id: "CREATE_SHARED_ACCOUNTS",
    label: "Create Shared Accounts",
    description: "Provision shared mailbox and AD accounts for teams",
    icon: "Share2",
    color: "orange",
    gradient: "from-orange-500 to-amber-600",
    href: "/tasks/shared-accounts",
    category: "Account Provisioning",
    singleFields: [
      {
        name: "requestNumber", label: "Request Number", type: "text", placeholder: "REQ-12345", required: true,
        validation: {
          minLength: 2, maxLength: 50,
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9 _\\-\\.#]*$",
          patternMessage: "Request number must start with a letter or number",
        },
      },
      {
        name: "accountName", label: "Shared Account Name", type: "text", placeholder: "SHR-teamname", required: true,
        validation: {
          minLength: 3, maxLength: 64,
          pattern: "^SHR-[a-zA-Z0-9][a-zA-Z0-9\\-]*$",
          patternMessage: "Shared account name must start with 'SHR-' and contain only letters, numbers, and hyphens",
        },
      },
      {
        name: "displayName", label: "Display Name", type: "text", placeholder: "Team Shared Account", required: true,
        validation: { minLength: 3, maxLength: 128 },
      },
      {
        name: "members", label: "Initial Members (UPNs)", type: "textarea", placeholder: "user1@company.com, user2@company.com",
        validation: {
          maxLength: 2048,
          pattern: "^(\\s*[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}\\s*[,;]?\\s*)*$",
          patternMessage: "Must be a comma or semicolon-separated list of valid email addresses",
        },
      },
      {
        name: "ou", label: "Organizational Unit (OU)", type: "ad-ou-select",
        placeholder: "Select an OU from Active Directory", required: true,
      },
      {
        name: "primaryOwner", label: "Shared Account Primary Owner", type: "ad-user-typeahead",
        placeholder: "Search by name, UPN, email or username…", required: true,
      },
      {
        name: "backupOwner", label: "Shared Account Backup Owner", type: "ad-user-typeahead",
        placeholder: "Search by name, UPN, email or username…", required: true,
      },
      {
        name: "businessJustification", label: "Business Justification", type: "textarea",
        placeholder: "Describe the business need for this shared account...", required: true,
        validation: { minLength: 10, maxLength: 1000 },
      },
    ],
    bulkColumns: ["RequestNumber", "AccountName", "DisplayName", "Members", "OU", "PrimaryOwner", "BackupOwner", "BusinessJustification"],
    csvTemplate: [{
      RequestNumber: "REQ-12345",
      AccountName: "SHR-finance",
      DisplayName: "Finance Team Shared",
      Members: "user1@company.com;user2@company.com",
      OU: "OU=SharedAccounts,DC=company,DC=com",
      PrimaryOwner: "john.doe@company.com",
      BackupOwner: "jane.smith@company.com",
      BusinessJustification: "Required for Finance team collaboration",
    }],
  },
  {
    id: "IL_TO_EL_CONVERSION",
    label: "IL to EL Conversion",
    description: "Convert Internal Labor (IL) accounts to External Labor (EL) accounts",
    icon: "ArrowLeftRight",
    color: "rose",
    gradient: "from-rose-500 to-pink-600",
    href: "/tasks/il-to-el",
    category: "Account Management",
    singleFields: [
      {
        name: "userUpn", label: "User UPN (IL)", type: "email", placeholder: "user@company.com", required: true,
        validation: {
          pattern: "^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$",
          patternMessage: "Must be a valid UPN / email address (e.g. user@company.com)",
          maxLength: 256,
        },
      },
      {
        name: "vendorName", label: "Vendor/Company Name", type: "text", placeholder: "Vendor Corp", required: true,
        validation: { minLength: 2, maxLength: 128 },
      },
      {
        name: "contractEndDate", label: "Contract End Date", type: "text", placeholder: "2025-12-31",
        validation: {
          pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$",
          patternMessage: "Date must be in YYYY-MM-DD format (e.g. 2025-12-31)",
        },
      },
    ],
    bulkColumns: ["UserUPN", "VendorName", "ContractEndDate", "NewOU", "Manager"],
    csvTemplate: [{ UserUPN: "user@company.com", VendorName: "Vendor Corp", ContractEndDate: "2025-12-31", NewOU: "OU=EL,DC=company,DC=com", Manager: "manager@company.com" }],
  },
  {
    id: "ONBOARD_WORKDAY",
    label: "Onboard Workday Associates",
    description: "Bulk onboard new associates from Workday into Active Directory",
    icon: "Briefcase",
    color: "blue",
    gradient: "from-blue-500 to-indigo-600",
    href: "/tasks/onboard-workday",
    category: "Onboarding",
    singleFields: [
      {
        name: "employeeId", label: "Workday Employee ID", type: "text", placeholder: "WD-12345", required: true,
        validation: {
          pattern: "^WD-\\d{4,10}$",
          patternMessage: "Must be a valid Workday ID in format WD-XXXXX (e.g. WD-12345)",
          maxLength: 20,
        },
      },
      {
        name: "firstName", label: "First Name", type: "text", placeholder: "John", required: true,
        validation: { minLength: 1, maxLength: 64, pattern: "^[a-zA-Z\\s\\-']+$", patternMessage: "First name can only contain letters, spaces, hyphens, and apostrophes" },
      },
      {
        name: "lastName", label: "Last Name", type: "text", placeholder: "Doe", required: true,
        validation: { minLength: 1, maxLength: 64, pattern: "^[a-zA-Z\\s\\-']+$", patternMessage: "Last name can only contain letters, spaces, hyphens, and apostrophes" },
      },
      {
        name: "department", label: "Department", type: "text", placeholder: "Engineering",
        validation: { minLength: 2, maxLength: 64 },
      },
      {
        name: "manager", label: "Manager UPN", type: "email", placeholder: "manager@company.com",
        validation: {
          pattern: "^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$",
          patternMessage: "Must be a valid UPN / email address (e.g. manager@company.com)",
          maxLength: 256,
        },
      },
    ],
    bulkColumns: ["EmployeeID", "FirstName", "LastName", "Department", "Title", "Manager", "StartDate", "Location"],
    csvTemplate: [{ EmployeeID: "WD-12345", FirstName: "John", LastName: "Doe", Department: "Engineering", Title: "Software Engineer", Manager: "manager@company.com", StartDate: "2025-01-15", Location: "HQ" }],
  },
  {
    id: "ONBOARD_VNDLY",
    label: "Onboard VNDLY ELs",
    description: "Bulk onboard External Labor contractors from VNDLY into Active Directory",
    icon: "Building2",
    color: "purple",
    gradient: "from-purple-500 to-indigo-600",
    href: "/tasks/onboard-vndly",
    category: "Onboarding",
    singleFields: [
      {
        name: "vndlyId", label: "VNDLY Worker ID", type: "text", placeholder: "VN-12345", required: true,
        validation: {
          pattern: "^VN-\\d{4,10}$",
          patternMessage: "Must be a valid VNDLY ID in format VN-XXXXX (e.g. VN-12345)",
          maxLength: 20,
        },
      },
      {
        name: "firstName", label: "First Name", type: "text", placeholder: "Jane", required: true,
        validation: { minLength: 1, maxLength: 64, pattern: "^[a-zA-Z\\s\\-']+$", patternMessage: "First name can only contain letters, spaces, hyphens, and apostrophes" },
      },
      {
        name: "lastName", label: "Last Name", type: "text", placeholder: "Smith", required: true,
        validation: { minLength: 1, maxLength: 64, pattern: "^[a-zA-Z\\s\\-']+$", patternMessage: "Last name can only contain letters, spaces, hyphens, and apostrophes" },
      },
      {
        name: "vendor", label: "Vendor Company", type: "text", placeholder: "Tech Staffing Inc", required: true,
        validation: { minLength: 2, maxLength: 128 },
      },
      {
        name: "contractEnd", label: "Contract End Date", type: "text", placeholder: "2025-12-31",
        validation: {
          pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$",
          patternMessage: "Date must be in YYYY-MM-DD format (e.g. 2025-12-31)",
        },
      },
    ],
    bulkColumns: ["VNDLYWorkerID", "FirstName", "LastName", "VendorCompany", "Title", "HiringManager", "StartDate", "ContractEndDate"],
    csvTemplate: [{ VNDLYWorkerID: "VN-12345", FirstName: "Jane", LastName: "Smith", VendorCompany: "Tech Staffing Inc", Title: "Contractor", HiringManager: "manager@company.com", StartDate: "2025-01-15", ContractEndDate: "2025-12-31" }],
  },
];

export const TASK_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  indigo: { bg: "bg-indigo-500/20", text: "text-indigo-400", border: "border-indigo-500/30", glow: "shadow-indigo-500/20" },
  violet: { bg: "bg-violet-500/20", text: "text-violet-400", border: "border-violet-500/30", glow: "shadow-violet-500/20" },
  cyan: { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30", glow: "shadow-cyan-500/20" },
  emerald: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30", glow: "shadow-emerald-500/20" },
  orange: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30", glow: "shadow-orange-500/20" },
  rose: { bg: "bg-rose-500/20", text: "text-rose-400", border: "border-rose-500/30", glow: "shadow-rose-500/20" },
  blue: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30", glow: "shadow-blue-500/20" },
  purple: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/30", glow: "shadow-purple-500/20" },
};
