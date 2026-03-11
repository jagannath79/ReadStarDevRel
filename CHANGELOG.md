# Changelog

All notable changes to IAMOneStop are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] — 2026-03-09 🎉 Initial Release

### ✨ Features

#### Authentication & Identity
- **Microsoft Entra ID (Azure AD) SSO** — sign-in via Entra with group-based role resolution
- **Credentials + LDAP fallback** — local DB login with automatic AD bind for domain users
- **Entra RBAC** — two Entra security groups control application access:
  - `IAMOneStop_Admin` → full access including Settings
  - `IAMOneStop_Operators` → IAM task + audit access
- **Stale-JWT fix** — email fallback lookup resolves Azure GUID vs DB CUID mismatch

#### IAM Task Engine (8 tasks)
- **Add User to Group** — add a single AD user to one or more security groups
- **Bulk Add Users** — add multiple users via CSV upload
- **Create Service Accounts** — provision AD service accounts (`svc-*`) with OU selection
- **Create RPA Accounts** — provision RPA accounts (`RPA-*`) for automation bots
- **Create Shared Accounts** — provision shared mailbox/AD accounts (`SHR-*`)
- **IL to EL Conversion** — convert Internal Labour accounts to External Labour
- **Onboard Workday Associates** — bulk onboard new hires from Workday exports
- **Onboard VNDLY ELs** — bulk onboard external contractors from VNDLY exports
- Real PowerShell execution with mock fallback for dev environments
- Full form validation on all single and bulk task forms
- AD OU picker and user typeahead search (live AD queries)

#### Audit & Logging
- Complete audit trail for every task execution (success / failure / partial / running)
- Paginated audit log with filtering by status, task type, and date range
- Export audit logs to CSV
- Admin-only log deletion with date range picker

#### Live Activity Notifications
- Real-time Server-Sent Events (SSE) stream — one connection per browser tab
- Processing → Success / Error / Partial lifecycle updates
- Notification bell with unread badge and error indicator
- Slide-over panel with tab filters (All / Tasks / Running)
- DB persistence with fallback broadcast-only mode if DB is unavailable
- Smart SSE merge strategy preserving task metadata across updates

#### User Profile Panel
- Slide-over profile card for the signed-in user
- Displays: name, email, UPN, role, department, member since, last login
- Email fallback lookup to handle Entra users with stale JWTs

#### Settings (Admin only)
- **General** — app name, company, timezone, session timeout
- **Authentication** — provider selection, Entra ID client config, MFA toggle
- **PowerShell** — scripts path, execution policy, timeout, verbose logging
- **Active Directory** — domain, DC server, OUs, run-as mode (process or service account)
- **Notifications** — SMTP configuration, notify-on-failure / notify-on-success
- **Operator Access** — per-task enable/disable toggles for Operator role users
- All settings persisted atomically via Prisma transaction

#### Role-Based Access Control
- Edge middleware (NextAuth `withAuth`) protects `/settings/*` — ADMIN only
- Server-side redirect on Settings page (defence-in-depth)
- Settings API `POST` restricted to ADMIN
- Sidebar Settings link hidden for OPERATOR role
- Role badge displayed in sidebar user profile section
- Admin can enable/disable individual IAM tasks per Operator in Settings
- Task routes blocked server-side if operator navigates to a disabled task URL

### 🔧 Technical Highlights
- **Next.js 14** App Router with server components + client components separation
- **Prisma + SQLite** — zero-config embedded database (migration path to PostgreSQL supported)
- **React portals** — notification and profile panels rendered at `document.body` to escape CSS `backdrop-filter` containing blocks
- **SSR-safe relative time** — `<RelativeTime>` component eliminates hydration mismatches from `formatDistanceToNow`
- **Prisma `$transaction`** — atomic settings saves (fixes SQLite lock contention)
- **TypeScript strict** — zero type errors across entire codebase

### 🚀 Infrastructure
- Azure DevOps Dev pipeline (`azure-pipelines-dev.yml`) — triggers on `dev` branch
- Azure DevOps Production pipeline (`azure-pipelines-prod.yml`) — triggers on `main` + `v*` tags
- Azure App Service Linux (Node 20 LTS) deployment with persistent SQLite on `/home/data/`
- `startup.sh` — schema sync + app start on every container boot

---

## Upcoming (v1.1.0 — planned)

- Password reset workflow for local accounts
- Bulk audit log export (Excel)
- Email notification templates
- Dashboard date-range picker for analytics
- Additional IAM task types (TBD)
