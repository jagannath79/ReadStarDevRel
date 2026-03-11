import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import { Client } from "ldapts";
import type tls from "tls";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

// ── LDAP / Active Directory authentication ─────────────────────────────────
// Used as a fallback when the user is not found in the local DB.
// This lets real AD users log in with their domain credentials without
// needing a pre-provisioned local account.

interface LDAPUserInfo {
  name: string | null;
  email: string;
  upn: string;
}

/**
 * Attempt to authenticate a user directly against Active Directory via LDAP
 * by performing a simple bind with the supplied UPN and password.
 *
 * Returns the user's display name + email on success, null on failure.
 *
 * Connection fallback order (same strategy as ad.ts):
 *  1. LDAPS (port 636) — encrypted from the start; accepts self-signed certs.
 *  2. LDAP + StartTLS (port 389 → TLS) — satisfies DC channel binding.
 *  3. Plain LDAP (port 389) — last resort; may be blocked by modern DCs.
 */
async function authenticateViaLDAP(
  upn: string,
  password: string,
): Promise<LDAPUserInfo | null> {
  try {
    const dc = process.env.AD_DC_SERVER;
    if (!dc) return null; // LDAP not configured

    const ldapsUrl = `ldaps://${dc}:636`;
    const ldapUrl  = `ldap://${dc}:389`;
    const domain   = process.env.AD_DOMAIN ?? "virtulux.in";
    const baseDN   = process.env.AD_BASE_OU ??
      `DC=${domain.split(".").join(",DC=")}`;

    let client: Client | null = null;

    // Strategy 1 — LDAPS
    try {
      client = new Client({ url: ldapsUrl, tlsOptions: { rejectUnauthorized: false }, connectTimeout: 4_000 });
      await client.bind(upn, password);
    } catch {
      if (client) { try { await client.unbind(); } catch { /* ignore */ } client = null; }

      // Strategy 2 — LDAP + StartTLS
      try {
        const tlsOpts: tls.ConnectionOptions = { rejectUnauthorized: false };
        client = new Client({ url: ldapUrl, tlsOptions: tlsOpts, connectTimeout: 4_000 });
        await client.startTLS(tlsOpts);
        await client.bind(upn, password);
      } catch {
        if (client) { try { await client.unbind(); } catch { /* ignore */ } client = null; }

        // Strategy 3 — plain LDAP
        try {
          client = new Client({ url: ldapUrl, connectTimeout: 4_000 });
          await client.bind(upn, password);
        } catch {
          if (client) { try { await client.unbind(); } catch { /* ignore */ } }
          return null; // all strategies failed → wrong password or DC unreachable
        }
      }
    }

    // Bind succeeded — fetch user attributes
    try {
      const { searchEntries } = await client.search(baseDN, {
        scope: "sub",
        filter: `(|(userPrincipalName=${upn})(mail=${upn}))`,
        attributes: ["displayName", "cn", "mail", "userPrincipalName"],
        sizeLimit: 1,
      });

      const entry = searchEntries[0];
      const resolvedEmail = (
        (entry?.mail as string | undefined) ??
        (entry?.userPrincipalName as string | undefined) ??
        upn
      ).toLowerCase();
      const resolvedName: string | null =
        (entry?.displayName as string | undefined) ??
        (entry?.cn as string | undefined) ??
        null;

      return { name: resolvedName, email: resolvedEmail, upn: (entry?.userPrincipalName as string | undefined ?? upn).toLowerCase() };
    } finally {
      try { await client.unbind(); } catch { /* ignore */ }
    }
  } catch (err) {
    // Unexpected errors (e.g. DNS resolution failure)
    console.error("[Auth] LDAP unexpected error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ── Entra RBAC — group Object ID → application role ───────────────────────
//
// Two Entra security groups control access to this application:
//   IAMOneStop_Admin     (440465df-…) → full access including Settings
//   IAMOneStop_Operators (557247c7-…) → task/audit access; Settings hidden
//
// Group membership is resolved on every Azure AD sign-in via the
// Microsoft Graph /me/memberOf endpoint and stored in the DB so that
// subsequent JWT refreshes continue to use the correct role.
//
// Priority: ADMIN > OPERATOR.  Users in neither group are denied sign-in.

const ENTRA_GROUP_ADMIN    = "440465df-d398-4db8-866b-27644049c700"; // IAMOneStop_Admin
const ENTRA_GROUP_OPERATOR = "557247c7-111b-4971-b380-cd0f21b731e3"; // IAMOneStop_Operators

/**
 * Call Microsoft Graph /me/memberOf and return every group Object ID the
 * signed-in user is a direct member of.
 *
 * Requires at least the User.Read delegated permission on the Azure AD app
 * (this is already included in the AzureADProvider scope below).
 * Times out after 5 s so a slow Graph response never blocks sign-in indefinitely.
 */
async function fetchEntraGroupIds(accessToken: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5_000);

    const res = await fetch(
      "https://graph.microsoft.com/v1.0/me/memberOf?$select=id&$top=999",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      },
    );
    clearTimeout(tid);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Auth] Graph /me/memberOf returned ${res.status}:`, body);
      return [];
    }

    const json = await res.json() as { value?: Array<{ id: string }> };
    return (json.value ?? []).map((g) => g.id);
  } catch (err) {
    console.error("[Auth] fetchEntraGroupIds error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Given the list of Entra group IDs the user belongs to, return the
 * highest-privilege application role they should receive.
 *
 *   ADMIN    — member of IAMOneStop_Admin
 *   OPERATOR — member of IAMOneStop_Operators (but not Admin)
 *   NONE     — not in any authorised group → sign-in should be denied
 */
function resolveRoleFromGroups(groupIds: string[]): "ADMIN" | "OPERATOR" | "NONE" {
  if (groupIds.includes(ENTRA_GROUP_ADMIN))    return "ADMIN";
  if (groupIds.includes(ENTRA_GROUP_OPERATOR)) return "OPERATOR";
  return "NONE";
}

// ── Provider list ──────────────────────────────────────────────────────────
const providers: NextAuthOptions["providers"] = [];

// ── Credentials provider (local DB + LDAP fallback) ───────────────────────
providers.push(
  CredentialsProvider({
    id: "credentials",
    name: "UPN & Password",
    credentials: {
      upn:      { label: "User Principal Name", type: "email" },
      password: { label: "Password",            type: "password" },
    },
    async authorize(credentials) {
      try {
        if (!credentials?.upn || !credentials?.password) return null;

        const inputUpn = credentials.upn.trim().toLowerCase();

        // ── Step 1: Try local DB ───────────────────────────────────────────
        const dbUser = await prisma.user.findFirst({
          where: {
            OR: [{ upn: inputUpn }, { email: inputUpn }],
            isActive: true,
          },
        });

        if (dbUser?.password) {
          const isValid = await bcrypt.compare(credentials.password, dbUser.password);
          if (isValid) {
            // Local credentials match — update last login and return
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { lastLoginAt: new Date() },
            });
            return {
              id:    dbUser.id,
              name:  dbUser.name  ?? dbUser.email,
              email: dbUser.email,
              role:  dbUser.role,
            };
          }
          // Local user exists but password wrong — do NOT fall through to LDAP
          // for security: if an account is in the local DB we trust that record.
          console.warn("[Auth] Local user found but password mismatch for:", inputUpn);
          return null;
        }

        // ── Step 2: LDAP / Active Directory fallback ───────────────────────
        // Reached when: (a) user not in local DB, or (b) user exists but has
        // no local password (SSO-only account with a blank password field).
        console.log("[Auth] No local credentials for", inputUpn, "— trying LDAP…");
        const ldapInfo = await authenticateViaLDAP(credentials.upn, credentials.password);
        if (!ldapInfo) {
          console.log("[Auth] LDAP authentication failed for:", inputUpn);
          return null;
        }

        console.log("[Auth] LDAP authentication succeeded for:", inputUpn);

        // Auto-provision (or reactivate) the AD user in our DB
        const now = new Date();
        let provisionedUser = await prisma.user.findFirst({
          where: { OR: [{ email: ldapInfo.email }, { upn: ldapInfo.upn }] },
        });

        if (!provisionedUser) {
          provisionedUser = await prisma.user.create({
            data: {
              email:       ldapInfo.email,
              upn:         ldapInfo.upn,
              name:        ldapInfo.name,
              role:        "OPERATOR",   // default role; admins can elevate in the portal
              isActive:    true,
              lastLoginAt: now,
            },
          });
          console.log("[Auth] Provisioned new LDAP user:", provisionedUser.email);
        } else {
          provisionedUser = await prisma.user.update({
            where: { id: provisionedUser.id },
            data: {
              lastLoginAt: now,
              isActive:    true,
              ...(ldapInfo.name ? { name: ldapInfo.name } : {}),
            },
          });
        }

        return {
          id:    provisionedUser.id,
          name:  provisionedUser.name  ?? provisionedUser.email,
          email: provisionedUser.email,
          role:  provisionedUser.role,
        };
      } catch (err) {
        console.error("[Auth] authorize error:", err);
        return null;
      }
    },
  })
);

// ── Entra ID / Azure AD SSO (enabled via .env) ─────────────────────────────
// Note: the main (dynamic) route handler in /api/auth/[...nextauth]/route.ts
// also registers this provider from DB settings, overriding the env-var path.
if (
  process.env.AZURE_AD_CLIENT_ID &&
  process.env.AZURE_AD_CLIENT_SECRET &&
  process.env.AZURE_AD_TENANT_ID
) {
  providers.push(
    AzureADProvider({
      clientId:     process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      tenantId:     process.env.AZURE_AD_TENANT_ID,
      // User.Read is sufficient to call GET /me/memberOf for security groups.
      // If group membership unexpectedly returns empty, add GroupMember.Read.All
      // and grant admin consent in the Entra portal.
      authorization: { params: { scope: "openid profile email User.Read" } },
    })
  );
}

// ── NextAuth config ─────────────────────────────────────────────────────────
export const authOptions: NextAuthOptions = {
  // NOTE: No database adapter here — we use JWT sessions.
  // The adapter is intentionally omitted; CredentialsProvider requires JWT strategy
  // and adding PrismaAdapter causes a conflict with the credentials sign-in flow.
  // Azure AD OAuth account data is stored manually inside the signIn callback below.
  providers,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    error:  "/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // ── Initial sign-in ──────────────────────────────────────────────────
      // `user` and `account` are only present on the very first sign-in call.
      if (user && account) {
        if (account.provider === "azure-ad") {
          // For SSO users, look up the DB record that the signIn callback just
          // created (or already existed) so we embed the REAL DB id and role.
          // The role has already been resolved from Entra groups by signIn().
          try {
            const dbUser = await prisma.user.findFirst({
              where: { email: user.email! },
              select: { id: true, role: true },
            });
            token.id   = dbUser?.id   ?? user.id;   // prefer DB cuid over MS GUID
            token.role = dbUser?.role ?? "OPERATOR"; // preserve Entra-derived DB role
          } catch {
            token.id   = user.id;
            token.role = "OPERATOR";
          }
          token.accessToken = account.access_token;
          token.provider    = "azure-ad";
        } else {
          // Credentials provider — user object already has our DB id & role
          token.id   = user.id;
          token.role = (user as { role?: string }).role ?? "USER";
        }
      }
      return token;
    },

    async session({ session, token }) {
      // Expose custom token fields to the session object
      session.user.id       = token.id as string;
      session.user.role     = (token.role as string) ?? "USER";
      session.user.provider = token.provider as string | undefined;
      // Expose access token for Entra users so profile API can call MS Graph
      if (token.provider === "azure-ad" && token.accessToken) {
        session.user.accessToken = token.accessToken as string;
      }
      return session;
    },

    async signIn({ user, account }) {
      // ── Azure AD / Entra SSO ─────────────────────────────────────────────
      if (account?.provider === "azure-ad") {
        if (!user.email) {
          console.error("[Auth] Azure AD user has no email — blocking sign-in");
          return false;
        }

        // ── 1. Resolve role from Entra group memberships ─────────────────
        // The access_token from the OAuth flow has User.Read scope and is
        // valid for Microsoft Graph, so we can call /me/memberOf directly.
        let entraRole: "ADMIN" | "OPERATOR" = "OPERATOR"; // fallback if no token

        if (account.access_token) {
          const groupIds = await fetchEntraGroupIds(account.access_token);
          const resolved = resolveRoleFromGroups(groupIds);

          if (resolved === "NONE") {
            // User authenticated with Entra but is not a member of either
            // authorised group — deny access to this application.
            console.warn(
              `[Auth] ${user.email} is not a member of IAMOneStop_Admin or ` +
              `IAMOneStop_Operators — sign-in denied.`,
            );
            // NextAuth will redirect to /login?error=AccessDenied
            return false;
          }

          entraRole = resolved;
          console.log(`[Auth] Entra RBAC → ${user.email} resolved to role=${entraRole}`);
        } else {
          console.warn("[Auth] No access_token on account — cannot verify Entra groups; defaulting to OPERATOR");
        }

        // ── 2. Upsert the DB user with the Entra-derived role ────────────
        // The role is always synced on every login so that Entra group changes
        // take effect no later than the user's next sign-in (JWT max age = 8 h).
        try {
          const existing = await prisma.user.findFirst({
            where: { email: user.email },
          });

          if (!existing) {
            await prisma.user.create({
              data: {
                email:       user.email,
                name:        user.name ?? null,
                upn:         user.email,
                role:        entraRole,
                isActive:    true,
                lastLoginAt: new Date(),
              },
            });
            console.log(`[Auth] Provisioned new Entra user: ${user.email} role=${entraRole}`);
          } else {
            await prisma.user.update({
              where: { id: existing.id },
              data: {
                lastLoginAt: new Date(),
                role:        entraRole, // always sync — role may have changed in Entra
                ...(user.name ? { name: user.name } : {}),
                // Re-activate if the account was previously disabled
                ...(existing.isActive ? {} : { isActive: true }),
              },
            });
          }
        } catch (err) {
          console.error("[Auth] Azure AD signIn DB error:", err);
          // Allow sign-in even if DB upsert fails — JWT will carry the role
        }
      }

      return true;
    },
  },

  debug: process.env.NODE_ENV === "development",
};

// ── Type augmentation ───────────────────────────────────────────────────────
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      provider?: string;
      accessToken?: string; // exposed for azure-ad users to call MS Graph
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    provider?: string;
    accessToken?: string;
  }
}
