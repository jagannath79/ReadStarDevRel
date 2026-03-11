<#
.SYNOPSIS
    Tests Active Directory connectivity and reports diagnostics.
.PARAMETER dcServer
    Domain Controller hostname or IP
.PARAMETER domain
    AD domain name
.PARAMETER baseOu
    Base OU Distinguished Name
.PARAMETER Credential
    Optional PSCredential
#>
param(
    [Parameter(Mandatory=$true)]  [string]$dcServer,
    [Parameter(Mandatory=$true)]  [string]$domain,
    [Parameter(Mandatory=$false)] [string]$baseOu = "",
    [Parameter(Mandatory=$false)] [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = "Stop"
$results = @()

# ── 1. Network reachability (ping) ────────────────────────────────────────
try {
    $ping = Test-Connection -ComputerName $dcServer -Count 1 -Quiet
    if ($ping) {
        $results += "SUCCESS: DC '$dcServer' is reachable (ping OK)"
    } else {
        $results += "FAILURE: DC '$dcServer' is not reachable (ping failed)"
    }
} catch {
    $results += "FAILURE: Ping test failed - $($_.Exception.Message)"
}

# ── 2. LDAP port 389 ─────────────────────────────────────────────────────
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $async = $tcp.BeginConnect($dcServer, 389, $null, $null)
    $wait  = $async.AsyncWaitHandle.WaitOne(3000, $false)
    if ($wait -and $tcp.Connected) {
        $results += "SUCCESS: LDAP port 389 is open on '$dcServer'"
    } else {
        $results += "FAILURE: LDAP port 389 is not reachable on '$dcServer'"
    }
    $tcp.Close()
} catch {
    $results += "FAILURE: LDAP port check failed - $($_.Exception.Message)"
}

# ── 3. AD module + domain query ───────────────────────────────────────────
try {
    Import-Module ActiveDirectory -ErrorAction Stop
    $adParams = @{ Server = $dcServer }
    if ($Credential) { $adParams.Credential = $Credential }

    $domainObj = Get-ADDomain -Server $dcServer @(if ($Credential) { @{Credential=$Credential} } else { @{} })
    $results += "SUCCESS: Connected to domain '$($domainObj.DNSRoot)' (DC: $($domainObj.PDCEmulator))"
} catch {
    $results += "FAILURE: AD domain query failed - $($_.Exception.Message)"
}

# ── 4. Base OU exists ─────────────────────────────────────────────────────
if ($baseOu -and $baseOu.Trim() -ne "") {
    try {
        $adParams2 = @{ Server = $dcServer }
        if ($Credential) { $adParams2.Credential = $Credential }
        Get-ADObject -Identity $baseOu @adParams2 | Out-Null
        $results += "SUCCESS: Base OU '$baseOu' exists and is accessible"
    } catch {
        $results += "FAILURE: Base OU '$baseOu' not found or not accessible - $($_.Exception.Message)"
    }
}

# ── 5. Scripts path ───────────────────────────────────────────────────────
$scriptsPath = $env:PS_SCRIPTS_PATH
if ($scriptsPath) {
    if (Test-Path $scriptsPath) {
        $scripts = Get-ChildItem -Path $scriptsPath -Filter "*.ps1" | Select-Object -ExpandProperty Name
        $results += "SUCCESS: Scripts path '$scriptsPath' exists ($($scripts.Count) scripts found)"
        $results += "INFO: Scripts: $($scripts -join ', ')"
    } else {
        $results += "FAILURE: Scripts path '$scriptsPath' does not exist"
    }
}

# Output all results
$results | ForEach-Object { Write-Output $_ }

$failures = $results | Where-Object { $_ -like "FAILURE:*" }
if ($failures.Count -eq 0) { exit 0 } else { exit 1 }
