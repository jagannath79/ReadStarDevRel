# AD Identity Management Portal

Enterprise-grade web application for Active Directory Identity and Access Management tasks.

## Features

| Feature | Description |
|---|---|
| Add User to Group | Add a single user to an AD security group |
| Bulk Add Users to Group | CSV/Excel bulk user-to-group assignment |
| Create Service Accounts | Bulk provision service accounts in AD |
| Create RPA Accounts | Bulk provision RPA automation accounts |
| Create Shared Accounts | Provision shared mailbox/AD accounts |
| IL to EL Conversion | Convert Internal Labor to External Labor accounts |
| Onboard Workday Associates | Bulk onboard from Workday export |
| Onboard VNDLY ELs | Bulk onboard external contractors from VNDLY |
| Audit & Logging | Complete audit trail with filters, export, and drill-down |
| Settings | Configure auth, PowerShell, AD, and notifications |

## Quick Start

### 1. Copy environment file
```bash
cp .env.example .env
# Edit .env with your settings
```

### 2. Setup database & seed
```bash
npm run setup
```

### 3. Start development server
```bash
npm run dev
```

Open http://localhost:3000

### Default Login Credentials
| Role | UPN | Password |
|---|---|---|
| Admin | admin@company.com | Admin@123456 |
| Operator | operator@company.com | Operator@123456 |

> **Change these immediately in production!**

---

## PowerShell Script Integration

Place your PowerShell scripts in the configured scripts directory (`C:\Scripts\IAM` by default).

### Expected Script Names

| Task | Script Name |
|---|---|
| Add User to Group | `Add-UserToGroup.ps1` |
| Bulk Add Users | `Add-BulkUsersToGroup.ps1` |
| Create Service Accounts | `New-ServiceAccounts.ps1` |
| Create RPA Accounts | `New-RPAAccounts.ps1` |
| Create Shared Accounts | `New-SharedAccounts.ps1` |
| IL to EL Conversion | `Convert-ILtoEL.ps1` |
| Onboard Workday | `Onboard-WorkdayUsers.ps1` |
| Onboard VNDLY | `Onboard-VNDLYUsers.ps1` |

Scripts receive parameters matching the CSV column names as PowerShell named parameters.

---

## Microsoft Entra ID SSO Setup

1. Go to **Settings → Authentication** in the portal
2. Enable **Microsoft Entra ID SSO** toggle
3. Enter your Azure AD **Client ID**, **Tenant ID**, and **Client Secret**
4. Add the Redirect URI to your Azure App Registration:
   ```
   http://localhost:3000/api/auth/callback/azure-ad
   ```
5. Update `.env` with the Azure credentials
6. Restart the server

---

## Architecture

```
src/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (dashboard)/
│   │   ├── dashboard/         # Main dashboard
│   │   ├── tasks/             # 8 IAM task pages
│   │   ├── audit/             # Audit & logging
│   │   └── settings/          # Configuration
│   └── api/
│       ├── auth/              # NextAuth handlers
│       ├── tasks/execute/     # PowerShell executor
│       ├── audit/             # Audit log API
│       └── settings/          # Settings API
├── components/
│   ├── layout/                # Sidebar, Header
│   └── tasks/                 # Shared task page component
├── lib/
│   ├── auth.ts                # NextAuth config (UPN + Entra SSO)
│   ├── powershell.ts          # PS script executor
│   ├── prisma.ts              # Database client
│   ├── tasks.ts               # Task definitions
│   └── utils.ts               # Utilities
└── types/index.ts             # TypeScript types
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (dark theme, glass morphism)
- **Auth**: NextAuth.js (UPN credentials + Azure AD SSO)
- **Database**: Prisma + SQLite (upgradeable to PostgreSQL)
- **Charts**: Recharts
- **Tables**: TanStack Table
- **Forms**: React Hook Form + Zod
- **Toasts**: react-hot-toast

## Production Deployment

1. Switch `DATABASE_URL` to PostgreSQL
2. Set a strong `NEXTAUTH_SECRET` (min 32 chars)
3. Set `NODE_ENV=production`
4. Run `npm run build && npm start`
5. Configure Entra SSO with production redirect URI
