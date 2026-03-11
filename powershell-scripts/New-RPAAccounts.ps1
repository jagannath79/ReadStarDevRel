<#
.SYNOPSIS
    Creates a new RPA (Robotic Process Automation) service account in AD.
.PARAMETER accountName
    SAM account name (e.g. rpa-invoice-proc)
.PARAMETER processName
    Human-readable name of the RPA process
.PARAMETER owner
    UPN of the process owner
.PARAMETER Credential
    Optional PSCredential
#>
param(
    [Parameter(Mandatory=$true)]  [string]$accountName,
    [Parameter(Mandatory=$true)]  [string]$processName,
    [Parameter(Mandatory=$true)]  [string]$owner,
    [Parameter(Mandatory=$false)] [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

try {
    Import-Module ActiveDirectory -ErrorAction Stop

    $adParams = @{}
    if ($Credential) { $adParams.Credential = $Credential }

    $existing = Get-ADUser -Filter "SamAccountName -eq '$accountName'" @adParams -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Output "FAILURE: RPA account '$accountName' already exists"
        exit 1
    }

    $ou  = $env:AD_OU_RPA
    $upn = "$accountName@$env:AD_DOMAIN"

    $newParams = @{
        Name              = $accountName
        SamAccountName    = $accountName
        UserPrincipalName = $upn
        Description       = "RPA Account - $processName (Owner: $owner)"
        Path              = $ou
        AccountPassword   = (ConvertTo-SecureString ([System.Web.Security.Membership]::GeneratePassword(16,2)) -AsPlainText -Force)
        Enabled           = $true
        PasswordNeverExpires = $true
        CannotChangePassword = $true
    }
    if ($Credential) { $newParams.Credential = $Credential }

    New-ADUser @newParams
    Write-Output "SUCCESS: RPA account '$accountName' created for process '$processName'"
    Write-Output "INFO: Owner : $owner"
    Write-Output "INFO: OU    : $ou"
    exit 0

} catch {
    Write-Output "FAILURE: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
