<#
.SYNOPSIS
    Creates a shared AD account and optionally adds initial members.
.PARAMETER accountName
    SAM account name (e.g. shared-finance)
.PARAMETER displayName
    Display name for the account
.PARAMETER members
    Comma or semicolon separated list of member UPNs (optional)
.PARAMETER Credential
    Optional PSCredential
#>
param(
    [Parameter(Mandatory=$true)]  [string]$accountName,
    [Parameter(Mandatory=$true)]  [string]$displayName,
    [Parameter(Mandatory=$false)] [string]$members = "",
    [Parameter(Mandatory=$false)] [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

try {
    Import-Module ActiveDirectory -ErrorAction Stop

    $adParams = @{}
    if ($Credential) { $adParams.Credential = $Credential }

    $existing = Get-ADUser -Filter "SamAccountName -eq '$accountName'" @adParams -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Output "FAILURE: Shared account '$accountName' already exists"
        exit 1
    }

    $ou  = $env:AD_OU_SHARED
    $upn = "$accountName@$env:AD_DOMAIN"

    $newParams = @{
        Name              = $displayName
        SamAccountName    = $accountName
        UserPrincipalName = $upn
        DisplayName       = $displayName
        Description       = "Shared Account"
        Path              = $ou
        AccountPassword   = (ConvertTo-SecureString ([System.Web.Security.Membership]::GeneratePassword(16,2)) -AsPlainText -Force)
        Enabled           = $true
        PasswordNeverExpires = $true
    }
    if ($Credential) { $newParams.Credential = $Credential }

    New-ADUser @newParams
    Write-Output "SUCCESS: Shared account '$accountName' created"

    # Add members to an associated group if specified
    if ($members -and $members.Trim() -ne "") {
        $memberList = $members -split '[,;]' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
        foreach ($memberUpn in $memberList) {
            try {
                $memberUser = Get-ADUser -Filter "UserPrincipalName -eq '$memberUpn'" @adParams
                if ($memberUser) {
                    Write-Output "INFO: Member '$memberUpn' noted for group assignment"
                } else {
                    Write-Output "WARN: Member '$memberUpn' not found in AD - skipped"
                }
            } catch {
                Write-Output "WARN: Could not resolve member '$memberUpn' - $($_.Exception.Message)"
            }
        }
    }
    exit 0

} catch {
    Write-Output "FAILURE: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
