import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export interface ServiceAccountCredential {
  username: string;   // UPN e.g. svc-iam@company.com
  password: string;
  domain?: string;    // optional NetBIOS domain e.g. COMPANY
}

export interface PSExecutionOptions {
  timeout?: number;
  scriptName: string;
  params?: Record<string, string | string[]>;
  /** When set, a PSCredential is built inside PowerShell and -Credential is passed to the script */
  serviceAccount?: ServiceAccountCredential;
}

export interface PSResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export function buildPSParams(params: Record<string, string | string[]>): string {
  return Object.entries(params)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        const arrayStr = value.map((v) => `"${v.replace(/"/g, '`"')}"`).join(",");
        return `-${key} @(${arrayStr})`;
      }
      return `-${key} "${String(value).replace(/"/g, '`"')}"`;
    })
    .join(" ");
}

export async function executePowerShell(options: PSExecutionOptions): Promise<PSResult> {
  const scriptsPath = process.env.PS_SCRIPTS_PATH ?? "C:\\Scripts\\IAM";
  const executionPolicy = process.env.PS_EXECUTION_POLICY ?? "RemoteSigned";
  const timeout = options.timeout ?? parseInt(process.env.PS_TIMEOUT_MS ?? "300000");

  const scriptPath = path.join(scriptsPath, options.scriptName);
  const childEnv: NodeJS.ProcessEnv = { ...process.env };

  // ── Remote execution via PowerShell Remoting (WinRM) ─────────────────────
  // When AD_DC_SERVER is configured, scripts are sent to and executed ON the
  // DC using Invoke-Command -FilePath. This lets a non-domain-joined machine
  // perform AD operations without local AD connectivity.
  //
  // One-time setup on this machine (run as Admin in PowerShell):
  //   Set-Item WSMan:\localhost\Client\TrustedHosts -Value "<DC_FQDN>" -Force
  // ──────────────────────────────────────────────────────────────────────────
  const dcServer = process.env.AD_DC_SERVER;
  const useRemote = !!dcServer && process.env.PS_REMOTE_EXEC !== "false";

  let command: string;

  if (useRemote) {
    // Build positional ArgumentList for Invoke-Command -FilePath.
    // -FilePath copies the local script to the DC and binds ArgumentList values
    // positionally to the script's param() block (in declaration order).
    // The inner scripts' optional $Credential param is intentionally omitted:
    // the WinRM session itself already runs as the service account identity.
    const argValues = options.params
      ? Object.values(options.params).map(
          (v) => `'${String(Array.isArray(v) ? v.join(",") : v).replace(/'/g, "''")}'`
        )
      : [];
    const argListStr = argValues.join(", ");
    const escapedScriptPath = scriptPath.replace(/'/g, "''");

    const invokeParts = [
      `Invoke-Command -ComputerName '${dcServer}'`,
      `-FilePath '${escapedScriptPath}'`,
      argListStr ? `-ArgumentList @(${argListStr})` : "",
    ].filter(Boolean).join(" ");

    if (options.serviceAccount) {
      // Credentials passed via env vars — never visible in process listings
      childEnv._PS_SVC_USER = options.serviceAccount.username;
      childEnv._PS_SVC_PASS = options.serviceAccount.password;

      command = [
        `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy ${executionPolicy}`,
        `-Command "& {`,
        `$pw = ConvertTo-SecureString $env:_PS_SVC_PASS -AsPlainText -Force;`,
        `$cred = New-Object System.Management.Automation.PSCredential($env:_PS_SVC_USER, $pw);`,
        `${invokeParts} -Credential $cred`,
        `}"`,
      ].join(" ");
    } else {
      // No explicit credential — uses the Node.js process identity.
      // Set adRunAsMode=serviceaccount in Settings > Active Directory for
      // reliable auth from a non-domain-joined machine.
      command = `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy ${executionPolicy} -Command "${invokeParts}"`;
    }
  } else {
    // ── Local execution (original behaviour) ─────────────────────────────────
    // Used when AD_DC_SERVER is not set (domain-joined machine with local AD).
    if (options.serviceAccount) {
      childEnv._PS_SVC_USER = options.serviceAccount.username;
      childEnv._PS_SVC_PASS = options.serviceAccount.password;

      const escapedPath = scriptPath.replace(/'/g, "''");
      const params = buildPSParams(options.params ?? {});

      command = [
        `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy ${executionPolicy}`,
        `-Command "& {`,
        `$pw = ConvertTo-SecureString $env:_PS_SVC_PASS -AsPlainText -Force;`,
        `$cred = New-Object System.Management.Automation.PSCredential($env:_PS_SVC_USER, $pw);`,
        `& '${escapedPath}' ${params} -Credential $cred`,
        `}"`,
      ].join(" ");
    } else {
      const params = options.params ? buildPSParams(options.params) : "";
      command = `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy ${executionPolicy} -File "${scriptPath}" ${params}`;
    }
  }

  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      windowsHide: true,
      encoding: "utf8",
      env: childEnv,
    });

    return {
      success: true,
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      exitCode: 0,
      duration: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
    return {
      success: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? (error.killed ? "Process timed out" : "Unknown error"),
      exitCode: error.code ?? 1,
      duration: Date.now() - startTime,
    };
  } finally {
    // Scrub sensitive env keys from the child env object (GC-friendly)
    delete childEnv._PS_SVC_USER;
    delete childEnv._PS_SVC_PASS;
  }
}

export function parsePSOutput(stdout: string): { success: string[]; failure: string[]; messages: string[] } {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const success: string[] = [];
  const failure: string[] = [];
  const messages: string[] = [];

  for (const line of lines) {
    if (line.startsWith("SUCCESS:")) success.push(line.replace("SUCCESS:", "").trim());
    else if (line.startsWith("FAILURE:")) failure.push(line.replace("FAILURE:", "").trim());
    else if (line.startsWith("INFO:") || line.startsWith("WARN:")) messages.push(line);
  }

  return { success, failure, messages };
}

// Mock execution for development/testing when PS is not available
export async function executePowerShellMock(options: PSExecutionOptions): Promise<PSResult> {
  await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));

  // Reject if no params supplied at all
  if (!options.params || Object.keys(options.params).length === 0) {
    return {
      success: false,
      stdout: "",
      stderr: "FAILURE: No parameters were supplied to the script. Please provide all required fields.",
      exitCode: 1,
      duration: 200,
    };
  }

  // Reject if any param value is blank
  const emptyKeys = Object.entries(options.params)
    .filter(([, v]) => !v || String(v).trim() === "")
    .map(([k]) => k);
  if (emptyKeys.length > 0) {
    return {
      success: false,
      stdout: "",
      stderr: `FAILURE: The following required parameters are empty: ${emptyKeys.join(", ")}`,
      exitCode: 1,
      duration: 200,
    };
  }

  const isSuccess = Math.random() > 0.1;
  const credInfo = options.serviceAccount
    ? `RunAs: ${options.serviceAccount.username}`
    : "RunAs: process identity";
  return {
    success: isSuccess,
    stdout: isSuccess
      ? `SUCCESS: Operation completed\nINFO: Script ${options.scriptName} executed\nINFO: ${credInfo}\nINFO: Params: ${JSON.stringify(options.params)}`
      : `FAILURE: Operation failed\nERR: Access denied or object not found in Active Directory`,
    stderr: isSuccess ? "" : "Error: The specified user or group was not found in Active Directory",
    exitCode: isSuccess ? 0 : 1,
    duration: 800,
  };
}

// Use real PowerShell when:
//  - Running in production, OR
//  - PS_USE_REAL=true is set (for dev machines with AD access)
export const runPS =
  process.env.NODE_ENV === "production" || process.env.PS_USE_REAL === "true"
    ? executePowerShell
    : executePowerShellMock;
