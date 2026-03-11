/**
 * Active Directory operations via LDAP.
 * All AD tasks execute from the Next.js server — no PowerShell, no WinRM,
 * no domain-joined client required. The server connects to the DC using an
 * explicit service account bind.
 *
 * Connection strategy (tried in order):
 *  1. LDAPS (port 636) — preferred; fully encrypted from the start.
 *  2. LDAP + StartTLS (port 389 → TLS upgrade) — works when port 636 is
 *     blocked but the DC enforces channel binding on port 389. The connection
 *     is upgraded to TLS before the bind, satisfying the DC requirement.
 *  3. Plain LDAP (port 389) — last resort for non-password operations only.
 *     Modern Windows Server 2019/2022 DCs with KB4520412 enforce LDAP channel
 *     binding, causing unsigned binds to be reset (ECONNRESET). This fallback
 *     works only on DCs that have not enabled that policy.
 *
 *  Password-setting operations (account creation) require a secure channel
 *  (LDAPS or StartTLS) and will fail with a clear error if neither is available.
 */

import { Client, Attribute, Change } from "ldapts";
import crypto from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ADCredentials {
  /** Full UPN or DN of the bind account, e.g. "Administrator@virtulux.in" */
  bindDN: string;
  password: string;
}

/** Structured credentials returned after account creation. */
export interface ADCredentialResult {
  accountName: string;
  upn: string;
  password: string;
  ou: string;
  primaryOwner?: string;
  backupOwner?: string;
}

export interface ADResult {
  success: boolean;
  message: string;
  /** Additional informational lines shown in the task output panel */
  info?: string[];
  /**
   * Populated only for account-creation operations.
   * Contains the generated password — shown once in the UI and never stored.
   */
  credentials?: ADCredentialResult;
}

// ── Config ────────────────────────────────────────────────────────────────────

function getConfig() {
  const dc = process.env.AD_DC_SERVER;
  if (!dc) throw new Error("AD_DC_SERVER is not configured in environment");
  return {
    ldapUrl:  `ldap://${dc}:389`,
    ldapsUrl: `ldaps://${dc}:636`,
    baseDN:   process.env.AD_BASE_OU    ?? "DC=virtulux,DC=in",
    usersOU:  process.env.AD_OU_USERS   ?? `OU=UsersAndGroups,DC=virtulux,DC=in`,
    svcOU:    process.env.AD_OU_SERVICE ?? `OU=ServiceAccounts,DC=virtulux,DC=in`,
    rpaOU:    process.env.AD_OU_RPA     ?? `OU=ServiceAccounts,DC=virtulux,DC=in`,
    sharedOU: process.env.AD_OU_SHARED  ?? `OU=ServiceAccounts,DC=virtulux,DC=in`,
    domain:   process.env.AD_DOMAIN     ?? "virtulux.in",
  };
}

// ── Client helpers ────────────────────────────────────────────────────────────

/**
 * Create and bind an LDAP client using a 3-level connection fallback.
 *
 * @param requireSsl  true  → secure channel required (LDAPS or StartTLS).
 *                            Needed for unicodePwd / account creation operations.
 *                    false → also try plain LDAP as last resort.
 *
 * Fallback order:
 *   1. LDAPS (port 636)        — encrypted from the start; needs DC cert
 *   2. LDAP + StartTLS (389)   — upgrades to TLS mid-connection; satisfies DC
 *                                 channel binding without LDAPS cert on port 636
 *   3. Plain LDAP (389)        — requireSsl=false only; may be dropped by DC if
 *                                 channel binding policy is enabled (ECONNRESET)
 */
async function createClient(creds: ADCredentials, requireSsl = false): Promise<Client> {
  const cfg = getConfig();
  const errors: string[] = [];

  // ── Strategy 1: LDAPS (port 636) ──────────────────────────────────────────
  try {
    const client = new Client({
      url: cfg.ldapsUrl,
      tlsOptions: { rejectUnauthorized: false },   // accept self-signed DC certs
      connectTimeout: 8000,
    });
    await client.bind(creds.bindDN, creds.password);
    return client;
  } catch (err: unknown) {
    errors.push(`[${cfg.ldapsUrl}] ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Strategy 2: LDAP + StartTLS (port 389 → TLS upgrade) ─────────────────
  // Preferred fallback: port 389 is open, but DC enforces channel binding.
  // StartTLS upgrades the plaintext connection to TLS before the bind, which
  // satisfies the DC's channel-binding requirement (KB4520412).
  try {
    const client = new Client({
      url: cfg.ldapUrl,
      tlsOptions: { rejectUnauthorized: false },
      connectTimeout: 8000,
    });
    await client.startTLS({ rejectUnauthorized: false });
    await client.bind(creds.bindDN, creds.password);
    return client;
  } catch (err: unknown) {
    errors.push(
      `[${cfg.ldapUrl} + StartTLS] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Strategy 3: Plain LDAP (port 389) — non-password operations only ──────
  // Last resort. Fails on DCs with channel-binding enforcement. Skip entirely
  // when a secure channel is mandatory (password-setting operations).
  if (!requireSsl) {
    try {
      const client = new Client({
        url: cfg.ldapUrl,
        connectTimeout: 8000,
      });
      await client.bind(creds.bindDN, creds.password);
      return client;
    } catch (err: unknown) {
      errors.push(
        `[${cfg.ldapUrl} plain] ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── All strategies failed ─────────────────────────────────────────────────
  const dc = process.env.AD_DC_SERVER ?? "unknown-dc";
  const hint = requireSsl
    ? `A secure channel (LDAPS or StartTLS) is required for password management on DC '${dc}'. ` +
      `Ensure either: (a) LDAPS is enabled on port 636 (install a DC certificate via: certutil -pulse), ` +
      `or (b) StartTLS is allowed on port 389 (default on most Windows DCs).`
    : `All connection strategies failed for DC '${dc}'. ` +
      `Check: 1) DC is reachable from this server, ` +
      `2) service account credentials in Settings → Active Directory are correct, ` +
      `3) Windows Firewall on the DC allows ports 389 and/or 636.`;

  throw new Error(`Active Directory connection failed:\n${errors.join("\n")}\n\n${hint}`);
}

async function withClient<T>(
  creds: ADCredentials,
  requireSsl: boolean,
  fn: (client: Client, cfg: ReturnType<typeof getConfig>) => Promise<T>,
): Promise<T> {
  const cfg = getConfig();
  const client = await createClient(creds, requireSsl);
  try {
    return await fn(client, cfg);
  } finally {
    try { await client.unbind(); } catch { /* ignore unbind errors */ }
  }
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/** Escape special characters in LDAP filter values (RFC 4515). */
function escapeFilter(v: string): string {
  return v
    .replace(/\\/g, "\\5c")
    .replace(/\*/g,  "\\2a")
    .replace(/\(/g,  "\\28")
    .replace(/\)/g,  "\\29")
    .replace(/\0/g,  "\\00");
}

/** Generate a 16-character password meeting AD complexity requirements. */
function generatePassword(): string {
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower   = "abcdefghjkmnpqrstuvwxyz";
  const digits  = "23456789";
  const special = "!@#$%&*";
  const all     = upper + lower + digits + special;

  const pick = (set: string, n: number) =>
    Array.from(crypto.randomBytes(n)).map((b) => set[b % set.length]).join("");

  // Guarantee at least 2 of each class
  const core = pick(upper, 2) + pick(lower, 2) + pick(digits, 2) + pick(special, 2) + pick(all, 8);

  // Shuffle with Fisher-Yates
  const arr = core.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

/** Encode a password for the AD `unicodePwd` attribute (requires LDAPS). */
function encodePassword(pw: string): Buffer {
  return Buffer.from(`"${pw}"`, "utf16le");
}

/**
 * Convert a JS Date to Windows FILETIME (100-nanosecond intervals since
 * 1 Jan 1601) used by AD's `accountExpires` attribute.
 */
function dateToWindowsFiletime(date: Date): string {
  // 100-nanosecond intervals between Unix epoch (1970) and Windows epoch (1601)
  const EPOCH_DIFF = BigInt("116444736000000000");
  const ns100 = BigInt(date.getTime()) * BigInt(10000);
  return (ns100 + EPOCH_DIFF).toString();
}

/** Look up an AD user by UPN; returns null if not found. */
async function findUserByUpn(client: Client, baseDN: string, upn: string) {
  const { searchEntries } = await client.search(baseDN, {
    scope: "sub",
    filter: `(userPrincipalName=${escapeFilter(upn)})`,
    attributes: ["dn", "sAMAccountName", "info", "displayName", "cn"],
  });
  return searchEntries[0] ?? null;
}

/**
 * Fetch all enabled AD accounts where extensionAttribute2 is "Associate"
 * or "Non Associate". Used to populate the Primary/Backup Owner dropdowns.
 */
export async function fetchEnabledAssociates(
  creds: ADCredentials,
): Promise<{ displayName: string; upn: string; samAccountName: string }[]> {
  return withClient(creds, false, async (client, cfg) => {
    const { searchEntries } = await client.search(cfg.baseDN, {
      scope: "sub",
      // Enabled accounts (bit 2 of UAC not set) with Associate/Non Associate extensionAttribute2
      filter: `(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(|(extensionAttribute2=Associate)(extensionAttribute2=Non Associate)))`,
      attributes: ["displayName", "userPrincipalName", "sAMAccountName", "cn"],
    });

    return searchEntries
      .map((e) => ({
        displayName: String(e.displayName ?? e.cn ?? e.sAMAccountName ?? ""),
        upn: String(e.userPrincipalName ?? ""),
        samAccountName: String(e.sAMAccountName ?? ""),
      }))
      .filter((e) => e.upn)          // skip accounts with no UPN
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  });
}

/**
 * Fetch all Organizational Units (OUs) from the directory tree.
 * Used to populate the OU dropdown on account-creation forms.
 */
export async function fetchOUs(
  creds: ADCredentials,
): Promise<{ dn: string; name: string }[]> {
  return withClient(creds, false, async (client, cfg) => {
    const { searchEntries } = await client.search(cfg.baseDN, {
      scope: "sub",
      filter: "(objectClass=organizationalUnit)",
      attributes: ["distinguishedName", "name"],
    });
    return searchEntries
      .map((e) => ({
        dn:   String(e.dn  ?? ""),
        name: String((e.name as string | undefined) ?? e.dn ?? ""),
      }))
      .filter((e) => e.dn)
      .sort((a, b) => a.dn.localeCompare(b.dn));
  });
}

/**
 * Search enabled AD users by partial name, UPN, email, or sAMAccountName.
 * Returns up to 15 results — used for the typeahead owner picker.
 */
export async function searchADUsers(
  creds: ADCredentials,
  query: string,
): Promise<{ displayName: string; upn: string; sAMAccountName: string }[]> {
  if (!query?.trim() || query.trim().length < 2) return [];
  const q = escapeFilter(query.trim());
  return withClient(creds, false, async (client, cfg) => {
    const filter =
      `(&(objectClass=user)` +
      `(!(userAccountControl:1.2.840.113556.1.4.803:=2))` +
      `(|(displayName=*${q}*)(sAMAccountName=*${q}*)(userPrincipalName=*${q}*)(mail=*${q}*)(cn=*${q}*)))`;
    const { searchEntries } = await client.search(cfg.baseDN, {
      scope:      "sub",
      filter,
      attributes: ["userPrincipalName", "displayName", "sAMAccountName"],
      sizeLimit:  15,
    });
    return searchEntries
      .filter((e) => e.userPrincipalName)
      .map((e) => ({
        displayName:    String(e.displayName ?? e.cn ?? e.userPrincipalName ?? ""),
        upn:            String(e.userPrincipalName),
        sAMAccountName: String(e.sAMAccountName ?? ""),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  });
}

/** Look up an AD group by CN; returns null if not found. */
async function findGroupByCN(client: Client, baseDN: string, groupName: string) {
  const { searchEntries } = await client.search(baseDN, {
    scope: "sub",
    filter: `(&(objectClass=group)(cn=${escapeFilter(groupName)}))`,
    attributes: ["dn", "member"],
  });
  return searchEntries[0] ?? null;
}

/** Return true if an account with the given sAMAccountName already exists. */
async function accountExists(client: Client, baseDN: string, sam: string): Promise<boolean> {
  const { searchEntries } = await client.search(baseDN, {
    scope: "sub",
    filter: `(sAMAccountName=${escapeFilter(sam)})`,
    attributes: ["dn"],
  });
  return searchEntries.length > 0;
}

/**
 * Find a unique sAMAccountName by appending a counter if the base is taken.
 * Returns the unique SAM (max 20 chars, AD limit).
 */
async function uniqueSAM(client: Client, baseDN: string, base: string): Promise<string> {
  const trimmed = base.substring(0, 20);
  if (!(await accountExists(client, baseDN, trimmed))) return trimmed;

  for (let i = 1; i <= 99; i++) {
    const candidate = `${base.substring(0, 18)}${i}`.substring(0, 20);
    if (!(await accountExists(client, baseDN, candidate))) return candidate;
  }
  throw new Error(`Cannot generate a unique sAMAccountName for base '${base}'`);
}

// ── AD Operations ─────────────────────────────────────────────────────────────

/**
 * Add a single user to an AD security group.
 * When a requestNumber is supplied, prepends a timestamped audit entry to the
 * user's AD Notes (info attribute), retaining any previously stored notes.
 */
export async function addUserToGroup(
  userUpn: string,
  groupName: string,
  creds: ADCredentials,
  requestNumber?: string,
): Promise<ADResult> {
  return withClient(creds, false, async (client, cfg) => {
    const user = await findUserByUpn(client, cfg.baseDN, userUpn);
    if (!user) {
      return { success: false, message: `User '${userUpn}' not found in Active Directory` };
    }

    const group = await findGroupByCN(client, cfg.baseDN, groupName);
    if (!group) {
      return { success: false, message: `Group '${groupName}' not found in Active Directory` };
    }

    // Check if already a member
    const raw = group.member;
    const members: string[] = !raw
      ? []
      : Array.isArray(raw)
        ? (raw as string[])
        : [raw as string];

    if (members.some((m) => m.toLowerCase() === user.dn.toLowerCase())) {
      return {
        success: true,
        message: `User '${userUpn}' is already a member of '${groupName}'`,
        info: ["No change needed — user was already in the group"],
      };
    }

    // ── Add user to group ────────────────────────────────────────────────────
    await client.modify(group.dn, [
      new Change({
        operation: "add",
        modification: new Attribute({ type: "member", values: [user.dn] }),
      }),
    ]);

    const infoLines: string[] = [
      `sAMAccountName : ${user.sAMAccountName as string}`,
      `Group DN       : ${group.dn}`,
    ];

    // ── Append request number to user's AD Notes (info attribute) ───────────
    if (requestNumber?.trim()) {
      const reqNum  = requestNumber.trim();
      const dateStr = new Date().toISOString().replace("T", " ").substring(0, 19); // YYYY-MM-DD HH:MM:SS
      const newNote = `[${reqNum}] ${dateStr} UTC - Added to group '${groupName}'`;

      // Existing notes: retain them, prepend the new entry at the top
      const existingRaw  = user.info;
      // AD Notes (info) is a Windows field — must use CRLF for visible line breaks.
      const existingNote = existingRaw
        ? (Array.isArray(existingRaw) ? (existingRaw as string[]).join("\r\n") : String(existingRaw))
        : "";

      const updatedNote = existingNote ? `${newNote}\r\n${existingNote}` : newNote;

      await client.modify(user.dn, [
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "info", values: [updatedNote] }),
        }),
      ]);

      infoLines.push(`Notes updated  : ${newNote}`);
    }

    return {
      success: true,
      message: `User '${userUpn}' successfully added to group '${groupName}'`,
      info: infoLines,
    };
  });
}

/**
 * Create a service account (svc-*) in AD.
 * Requires a secure channel (LDAPS or StartTLS) to set the initial password.
 *
 * After creation:
 *  - Sets the `manager` attribute to the Primary Owner's DN.
 *  - Writes a structured audit note to the `info` (Notes) attribute:
 *      [<requestNumber>] : Service Account Creation <YYYY-MM-DD>
 *      Primary Owner Name: <displayName>
 *      Backup Owner Name: <displayName>
 *      Business Justification: <text>
 */
export async function createServiceAccount(
  accountName: string,
  description: string,
  ou: string,
  creds: ADCredentials,
  requestNumber?: string,
  primaryOwnerUpn?: string,
  backupOwnerUpn?: string,
  businessJustification?: string,
): Promise<ADResult> {
  // ── Validate: primary and backup owner cannot be the same person ───────────
  if (
    primaryOwnerUpn?.trim() &&
    backupOwnerUpn?.trim() &&
    primaryOwnerUpn.trim().toLowerCase() === backupOwnerUpn.trim().toLowerCase()
  ) {
    return {
      success: false,
      message: "Primary Owner and Backup Owner cannot be the same person. Please select different owners.",
    };
  }

  const cfg      = getConfig();
  const targetOU = ou?.trim() || cfg.svcOU;
  const upn      = `${accountName}@${cfg.domain}`;
  const userDN   = `CN=${accountName},${targetOU}`;
  const password = generatePassword();

  return withClient(creds, true, async (client) => {
    if (await accountExists(client, cfg.baseDN, accountName)) {
      return { success: false, message: `Account '${accountName}' already exists in Active Directory` };
    }

    // ── Step 1: create disabled account ────────────────────────────────────
    try {
      await client.add(userDN, {
        objectClass: ["top", "person", "organizationalPerson", "user"],
        cn:                 accountName,
        sAMAccountName:     accountName,
        userPrincipalName:  upn,
        displayName:        accountName,  // ← Display Name = account name
        description,
        userAccountControl: "514", // disabled, normal account
      });
    } catch (addErr: unknown) {
      // LDAP error code 32 = NO_SUCH_OBJECT → the OU path doesn't exist in AD
      const code = (addErr as { code?: number }).code;
      if (code === 32) {
        return {
          success: false,
          message:
            `The Organizational Unit (OU) "${targetOU}" does not exist in Active Directory. ` +
            `Please verify the OU path (e.g. OU=ServiceAccounts,DC=domain,DC=com) and try again.`,
        };
      }
      // LDAP error code 68 = ENTRY_ALREADY_EXISTS (race condition)
      if (code === 68) {
        return { success: false, message: `Account '${accountName}' already exists in Active Directory` };
      }
      // All other LDAP errors — return a clean message without raw hex codes
      const rawMsg = addErr instanceof Error ? addErr.message : String(addErr);
      return {
        success: false,
        message: `Failed to create account '${accountName}': ${rawMsg}`,
      };
    }

    // ── Step 2: set password (requires TLS channel) ─────────────────────────
    await client.modify(userDN, [
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "unicodePwd", values: [encodePassword(password)] }),
      }),
    ]);

    // ── Step 3: enable account + password never expires ─────────────────────
    await client.modify(userDN, [
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "userAccountControl", values: ["66048"] }),
      }),
    ]);

    // ── Step 4: tag as Service Id via extensionAttribute2 ───────────────────
    await client.modify(userDN, [
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "extensionAttribute2", values: ["Service Id"] }),
      }),
    ]);

    const infoLines: string[] = [
      `UPN      : ${upn}`,
      `OU       : ${targetOU}`,
      `Password : ${password}  ← Save this now, it will not be shown again`,
    ];

    // ── Step 4: resolve owner display names from AD ─────────────────────────
    let primaryOwnerDN          = "";
    let primaryOwnerDisplayName = primaryOwnerUpn ?? "";
    let backupOwnerDisplayName  = backupOwnerUpn  ?? "";

    if (primaryOwnerUpn?.trim()) {
      const primaryUser = await findUserByUpn(client, cfg.baseDN, primaryOwnerUpn.trim());
      if (primaryUser) {
        primaryOwnerDN          = primaryUser.dn;
        primaryOwnerDisplayName = String(primaryUser.displayName ?? primaryUser.cn ?? primaryOwnerUpn);
      }
    }

    if (backupOwnerUpn?.trim()) {
      const backupUser = await findUserByUpn(client, cfg.baseDN, backupOwnerUpn.trim());
      if (backupUser) {
        backupOwnerDisplayName = String(backupUser.displayName ?? backupUser.cn ?? backupOwnerUpn);
      }
    }

    // ── Step 5: set manager attribute to Primary Owner ──────────────────────
    if (primaryOwnerDN) {
      await client.modify(userDN, [
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "manager", values: [primaryOwnerDN] }),
        }),
      ]);
      infoLines.push(`Manager  : ${primaryOwnerDisplayName}`);
    }

    // ── Step 6: write structured notes to info (Notes) attribute ────────────
    const dateStr   = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const reqPrefix = requestNumber?.trim() ? `[${requestNumber.trim()}]` : "[REQ-N/A]";
    // AD Notes (info) is a Windows field — must use CRLF (\r\n) for visible line breaks.
    const notesText = [
      `${reqPrefix} : Service Account Creation ${dateStr}`,
      `Primary Owner Name: ${primaryOwnerDisplayName}`,
      `Backup Owner Name: ${backupOwnerDisplayName}`,
      ``,                                                            // blank separator line
      `Business Justification: ${businessJustification?.trim() ?? ""}`,
    ].join("\r\n");

    await client.modify(userDN, [
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "info", values: [notesText] }),
      }),
    ]);
    infoLines.push(`Notes    : Ownership and justification recorded`);

    return {
      success: true,
      message: `Service account '${accountName}' created successfully`,
      info: infoLines,
      credentials: {
        accountName,
        upn,
        password,
        ou: targetOU,
        primaryOwner: primaryOwnerDisplayName || undefined,
        backupOwner:  backupOwnerDisplayName  || undefined,
      },
    };
  });
}

/**
 * Create an RPA account (RPA-*) in AD.
 * Mirrors createServiceAccount: sets extensionAttribute2="RPA Account", manager,
 * structured info notes (CRLF), and returns one-time credentials.
 */
export async function createRPAAccount(
  accountName: string,
  processName: string,
  ou: string,
  creds: ADCredentials,
  requestNumber?: string,
  primaryOwnerUpn?: string,
  backupOwnerUpn?: string,
  businessJustification?: string,
): Promise<ADResult> {
  // ── Validate: primary and backup owner cannot be the same person ───────────
  if (
    primaryOwnerUpn?.trim() &&
    backupOwnerUpn?.trim() &&
    primaryOwnerUpn.trim().toLowerCase() === backupOwnerUpn.trim().toLowerCase()
  ) {
    return {
      success: false,
      message: "Primary Owner and Backup Owner cannot be the same person. Please select different owners.",
    };
  }

  const cfg      = getConfig();
  const targetOU = ou?.trim() || cfg.rpaOU;
  const upn      = `${accountName}@${cfg.domain}`;
  const userDN   = `CN=${accountName},${targetOU}`;
  const password = generatePassword();

  return withClient(creds, true, async (client) => {
    if (await accountExists(client, cfg.baseDN, accountName)) {
      return { success: false, message: `RPA account '${accountName}' already exists in Active Directory` };
    }

    // ── Step 1: create disabled account ────────────────────────────────────
    try {
      await client.add(userDN, {
        objectClass: ["top", "person", "organizationalPerson", "user"],
        cn:                 accountName,
        sAMAccountName:     accountName,
        userPrincipalName:  upn,
        displayName:        accountName,
        description:        processName ? `RPA Account - ${processName}` : "RPA Account",
        userAccountControl: "514",
      });
    } catch (addErr: unknown) {
      const code = (addErr as { code?: number }).code;
      if (code === 32) {
        return {
          success: false,
          message: `The Organizational Unit (OU) "${targetOU}" does not exist in Active Directory. Please verify the OU path and try again.`,
        };
      }
      if (code === 68) {
        return { success: false, message: `RPA account '${accountName}' already exists in Active Directory` };
      }
      return { success: false, message: `Failed to create account '${accountName}': ${addErr instanceof Error ? addErr.message : String(addErr)}` };
    }

    // ── Step 2: set password ────────────────────────────────────────────────
    await client.modify(userDN, [
      new Change({ operation: "replace", modification: new Attribute({ type: "unicodePwd", values: [encodePassword(password)] }) }),
    ]);

    // ── Step 3: enable account + password never expires ─────────────────────
    await client.modify(userDN, [
      new Change({ operation: "replace", modification: new Attribute({ type: "userAccountControl", values: ["66048"] }) }),
    ]);

    // ── Step 4: tag as RPA Account via extensionAttribute2 ──────────────────
    await client.modify(userDN, [
      new Change({ operation: "replace", modification: new Attribute({ type: "extensionAttribute2", values: ["RPA Account"] }) }),
    ]);

    const infoLines: string[] = [
      `UPN      : ${upn}`,
      `OU       : ${targetOU}`,
      `Password : ${password}  ← Save this now, it will not be shown again`,
    ];

    // ── Step 5: resolve owner display names ─────────────────────────────────
    let primaryOwnerDN          = "";
    let primaryOwnerDisplayName = primaryOwnerUpn ?? "";
    let backupOwnerDisplayName  = backupOwnerUpn  ?? "";

    if (primaryOwnerUpn?.trim()) {
      const primaryUser = await findUserByUpn(client, cfg.baseDN, primaryOwnerUpn.trim());
      if (primaryUser) {
        primaryOwnerDN          = primaryUser.dn;
        primaryOwnerDisplayName = String(primaryUser.displayName ?? primaryUser.cn ?? primaryOwnerUpn);
      }
    }
    if (backupOwnerUpn?.trim()) {
      const backupUser = await findUserByUpn(client, cfg.baseDN, backupOwnerUpn.trim());
      if (backupUser) {
        backupOwnerDisplayName = String(backupUser.displayName ?? backupUser.cn ?? backupOwnerUpn);
      }
    }

    // ── Step 6: set manager attribute to Primary Owner ──────────────────────
    if (primaryOwnerDN) {
      await client.modify(userDN, [
        new Change({ operation: "replace", modification: new Attribute({ type: "manager", values: [primaryOwnerDN] }) }),
      ]);
      infoLines.push(`Manager  : ${primaryOwnerDisplayName}`);
    }

    // ── Step 7: write structured notes (CRLF for Windows AD text box) ───────
    const dateStr   = new Date().toISOString().split("T")[0];
    const reqPrefix = requestNumber?.trim() ? `[${requestNumber.trim()}]` : "[REQ-N/A]";
    const notesText = [
      `${reqPrefix} : RPA Account Creation ${dateStr}`,
      `Primary Owner Name: ${primaryOwnerDisplayName}`,
      `Backup Owner Name: ${backupOwnerDisplayName}`,
      ``,
      `Business Justification: ${businessJustification?.trim() ?? ""}`,
    ].join("\r\n");

    await client.modify(userDN, [
      new Change({ operation: "replace", modification: new Attribute({ type: "info", values: [notesText] }) }),
    ]);
    infoLines.push(`Notes    : Ownership and justification recorded`);

    return {
      success: true,
      message: `RPA account '${accountName}' created successfully`,
      info: infoLines,
      credentials: {
        accountName,
        upn,
        password,
        ou: targetOU,
        primaryOwner: primaryOwnerDisplayName || undefined,
        backupOwner:  backupOwnerDisplayName  || undefined,
      },
    };
  });
}

/**
 * Create a shared account (SHR-*) in AD.
 * Mirrors createServiceAccount: sets extensionAttribute2="Shared Account", manager,
 * structured info notes (CRLF), and returns one-time credentials.
 */
export async function createSharedAccount(
  accountName: string,
  displayName: string,
  members: string | undefined,
  ou: string,
  creds: ADCredentials,
  requestNumber?: string,
  primaryOwnerUpn?: string,
  backupOwnerUpn?: string,
  businessJustification?: string,
): Promise<ADResult> {
  // ── Validate: primary and backup owner cannot be the same person ───────────
  if (
    primaryOwnerUpn?.trim() &&
    backupOwnerUpn?.trim() &&
    primaryOwnerUpn.trim().toLowerCase() === backupOwnerUpn.trim().toLowerCase()
  ) {
    return {
      success: false,
      message: "Primary Owner and Backup Owner cannot be the same person. Please select different owners.",
    };
  }

  const cfg      = getConfig();
  const targetOU = ou?.trim() || cfg.sharedOU;
  const upn      = `${accountName}@${cfg.domain}`;
  const userDN   = `CN=${accountName},${targetOU}`;
  const password = generatePassword();

  return withClient(creds, true, async (client) => {
    if (await accountExists(client, cfg.baseDN, accountName)) {
      return { success: false, message: `Shared account '${accountName}' already exists in Active Directory` };
    }

    // ── Step 1: create disabled account ────────────────────────────────────
    try {
      await client.add(userDN, {
        objectClass: ["top", "person", "organizationalPerson", "user"],
        cn:                 accountName,
        sAMAccountName:     accountName,
        userPrincipalName:  upn,
        displayName:        displayName || accountName,
        description:        "Shared Account",
        userAccountControl: "514",
      });
    } catch (addErr: unknown) {
      const code = (addErr as { code?: number }).code;
      if (code === 32) {
        return {
          success: false,
          message: `The Organizational Unit (OU) "${targetOU}" does not exist in Active Directory. Please verify the OU path and try again.`,
        };
      }
      if (code === 68) {
        return { success: false, message: `Shared account '${accountName}' already exists in Active Directory` };
      }
      return { success: false, message: `Failed to create account '${accountName}': ${addErr instanceof Error ? addErr.message : String(addErr)}` };
    }

    // ── Step 2: set password ────────────────────────────────────────────────
    await client.modify(userDN, [
      new Change({ operation: "replace", modification: new Attribute({ type: "unicodePwd", values: [encodePassword(password)] }) }),
    ]);

    // ── Step 3: enable account + password never expires ─────────────────────
    await client.modify(userDN, [
      new Change({ operation: "replace", modification: new Attribute({ type: "userAccountControl", values: ["66048"] }) }),
    ]);

    // ── Step 4: tag as Shared Account via extensionAttribute2 ───────────────
    await client.modify(userDN, [
      new Change({ operation: "replace", modification: new Attribute({ type: "extensionAttribute2", values: ["Shared Account"] }) }),
    ]);

    const infoLines: string[] = [
      `UPN      : ${upn}`,
      `OU       : ${targetOU}`,
      `Password : ${password}  ← Save this now, it will not be shown again`,
    ];

    // ── Step 5: resolve owner display names ─────────────────────────────────
    let primaryOwnerDN          = "";
    let primaryOwnerDisplayName = primaryOwnerUpn ?? "";
    let backupOwnerDisplayName  = backupOwnerUpn  ?? "";

    if (primaryOwnerUpn?.trim()) {
      const primaryUser = await findUserByUpn(client, cfg.baseDN, primaryOwnerUpn.trim());
      if (primaryUser) {
        primaryOwnerDN          = primaryUser.dn;
        primaryOwnerDisplayName = String(primaryUser.displayName ?? primaryUser.cn ?? primaryOwnerUpn);
      }
    }
    if (backupOwnerUpn?.trim()) {
      const backupUser = await findUserByUpn(client, cfg.baseDN, backupOwnerUpn.trim());
      if (backupUser) {
        backupOwnerDisplayName = String(backupUser.displayName ?? backupUser.cn ?? backupOwnerUpn);
      }
    }

    // ── Step 6: set manager attribute to Primary Owner ──────────────────────
    if (primaryOwnerDN) {
      await client.modify(userDN, [
        new Change({ operation: "replace", modification: new Attribute({ type: "manager", values: [primaryOwnerDN] }) }),
      ]);
      infoLines.push(`Manager  : ${primaryOwnerDisplayName}`);
    }

    // ── Step 7: resolve and add initial members ──────────────────────────────
    if (members?.trim()) {
      const memberUpns = members.split(/[,;]/).map((m) => m.trim()).filter(Boolean);
      for (const mUpn of memberUpns) {
        try {
          const mUser = await findUserByUpn(client, cfg.baseDN, mUpn);
          infoLines.push(mUser ? `Member found : ${mUpn}` : `WARN: Member not found in AD: ${mUpn}`);
        } catch {
          infoLines.push(`WARN: Could not resolve member ${mUpn}`);
        }
      }
    }

    // ── Step 8: write structured notes (CRLF for Windows AD text box) ───────
    const dateStr   = new Date().toISOString().split("T")[0];
    const reqPrefix = requestNumber?.trim() ? `[${requestNumber.trim()}]` : "[REQ-N/A]";
    const notesText = [
      `${reqPrefix} : Shared Account Creation ${dateStr}`,
      `Primary Owner Name: ${primaryOwnerDisplayName}`,
      `Backup Owner Name: ${backupOwnerDisplayName}`,
      ``,
      `Business Justification: ${businessJustification?.trim() ?? ""}`,
    ].join("\r\n");

    await client.modify(userDN, [
      new Change({ operation: "replace", modification: new Attribute({ type: "info", values: [notesText] }) }),
    ]);
    infoLines.push(`Notes    : Ownership and justification recorded`);

    return {
      success: true,
      message: `Shared account '${accountName}' created successfully`,
      info: infoLines,
      credentials: {
        accountName,
        upn,
        password,
        ou: targetOU,
        primaryOwner: primaryOwnerDisplayName || undefined,
        backupOwner:  backupOwnerDisplayName  || undefined,
      },
    };
  });
}

/**
 * Convert an IL (Internal Labor) account to EL (External Labor).
 * Updates description and optionally sets account expiration.
 * Uses plain LDAP (port 389) — no TLS required.
 */
export async function convertILtoEL(
  userUpn: string,
  vendorName: string,
  contractEndDate: string | undefined,
  creds: ADCredentials,
): Promise<ADResult> {
  return withClient(creds, false, async (client, cfg) => {
    const user = await findUserByUpn(client, cfg.baseDN, userUpn);
    if (!user) {
      return { success: false, message: `User '${userUpn}' not found in Active Directory` };
    }

    const description = `EL - ${vendorName}`;
    const mods: Change[] = [
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "description", values: [description] }),
      }),
    ];

    const info = [`Description updated to: ${description}`];

    if (contractEndDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const expiry = new Date(`${contractEndDate}T00:00:00Z`);
      mods.push(
        new Change({
          operation: "replace",
          modification: new Attribute({
            type: "accountExpires",
            values: [dateToWindowsFiletime(expiry)],
          }),
        }),
      );
      info.push(`Account expiry set to: ${contractEndDate}`);
    }

    await client.modify(user.dn, mods);

    return {
      success: true,
      message: `User '${userUpn}' converted to EL (Vendor: ${vendorName})`,
      info,
    };
  });
}

/**
 * Onboard a Workday associate into Active Directory.
 * Requires LDAPS (port 636) to set the initial password.
 */
export async function onboardWorkdayUser(
  employeeId: string,
  firstName: string,
  lastName: string,
  department: string | undefined,
  manager: string | undefined,
  creds: ADCredentials,
): Promise<ADResult> {
  const cfg      = getConfig();
  const password = generatePassword();
  const fullName = `${firstName} ${lastName}`;
  const samBase  = `${firstName.charAt(0)}${lastName}`.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  return withClient(creds, true, async (client) => {
    const sam    = await uniqueSAM(client, cfg.baseDN, samBase);
    const upn    = `${sam}@${cfg.domain}`;
    const userDN = `CN=${fullName},${cfg.usersOU}`;

    const entry: Record<string, string | string[]> = {
      objectClass: ["top", "person", "organizationalPerson", "user"],
      cn: fullName,
      givenName: firstName,
      sn: lastName,
      sAMAccountName: sam,
      userPrincipalName: upn,
      displayName: fullName,
      description: `Workday Employee ID: ${employeeId}`,
      userAccountControl: "514",
    };

    if (department?.trim()) entry.department = department.trim();
    if (employeeId?.trim())  entry.employeeID = employeeId.trim();

    if (manager?.trim()) {
      const mgr = await findUserByUpn(client, cfg.baseDN, manager.trim());
      if (mgr) entry.manager = mgr.dn;
    }

    await client.add(userDN, entry);

    await client.modify(userDN, [
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "unicodePwd", values: [encodePassword(password)] }),
      }),
    ]);

    // Enable account; user must change password at next logon (pwdLastSet = 0)
    await client.modify(userDN, [
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "userAccountControl", values: ["512"] }),
      }),
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "pwdLastSet", values: ["0"] }),
      }),
    ]);

    return {
      success: true,
      message: `Workday associate '${fullName}' (${employeeId}) onboarded`,
      info: [
        `UPN           : ${upn}`,
        `sAMAccountName: ${sam}`,
        `Temp Password : ${password}  ← Save this now, it will not be shown again`,
      ],
    };
  });
}

/**
 * Onboard a VNDLY External Labor contractor into Active Directory.
 * Requires LDAPS (port 636) to set the initial password.
 */
export async function onboardVNDLYUser(
  vndlyId: string,
  firstName: string,
  lastName: string,
  vendor: string,
  contractEnd: string | undefined,
  creds: ADCredentials,
): Promise<ADResult> {
  const cfg      = getConfig();
  const password = generatePassword();
  const fullName = `${firstName} ${lastName}`;
  const samBase  = `el.${firstName.charAt(0)}${lastName}`.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();

  return withClient(creds, true, async (client) => {
    const sam    = await uniqueSAM(client, cfg.baseDN, samBase);
    const upn    = `${sam}@${cfg.domain}`;
    const userDN = `CN=${fullName},${cfg.usersOU}`;

    const entry: Record<string, string | string[]> = {
      objectClass: ["top", "person", "organizationalPerson", "user"],
      cn: fullName,
      givenName: firstName,
      sn: lastName,
      sAMAccountName: sam,
      userPrincipalName: upn,
      displayName: `${fullName} (${vendor})`,
      description: `EL Contractor - ${vendor} | VNDLY: ${vndlyId}`,
      department: vendor,
      userAccountControl: "514",
    };

    await client.add(userDN, entry);

    await client.modify(userDN, [
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "unicodePwd", values: [encodePassword(password)] }),
      }),
    ]);

    const enableMods: Change[] = [
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "userAccountControl", values: ["512"] }),
      }),
      new Change({
        operation: "replace",
        modification: new Attribute({ type: "pwdLastSet", values: ["0"] }),
      }),
    ];

    if (contractEnd?.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const expiry = new Date(`${contractEnd}T00:00:00Z`);
      enableMods.push(
        new Change({
          operation: "replace",
          modification: new Attribute({
            type: "accountExpires",
            values: [dateToWindowsFiletime(expiry)],
          }),
        }),
      );
    }

    await client.modify(userDN, enableMods);

    const info = [
      `UPN          : ${upn}`,
      `Vendor       : ${vendor}`,
      `Temp Password: ${password}  ← Save this now, it will not be shown again`,
    ];
    if (contractEnd) info.push(`Contract ends: ${contractEnd}`);

    return {
      success: true,
      message: `VNDLY contractor '${fullName}' (${vndlyId}) onboarded successfully`,
      info,
    };
  });
}

// ── Credential resolver ───────────────────────────────────────────────────────

/**
 * Resolve AD bind credentials.
 * Priority: DB settings → environment variables.
 * Throws if no credentials are available.
 */
export async function resolveADCredentials(
  dbSettings: Record<string, string>,
): Promise<ADCredentials> {
  const username =
    process.env.AD_SERVICE_ACCOUNT ??
    dbSettings.adServiceAccount ??
    "";

  const password =
    process.env.AD_SERVICE_ACCOUNT_PASSWORD ??
    dbSettings.adServiceAccountPassword ??
    "";

  if (!username || !password) {
    throw new Error(
      "AD credentials are not configured. Go to Settings → Active Directory and set the service account.",
    );
  }

  return { bindDN: username, password };
}
