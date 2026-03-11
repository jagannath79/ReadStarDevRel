<#
.SYNOPSIS
    Creates a new service account in Active Directory.
.PARAMETER accountName
    SAM account name (e.g. svc-app1-prod)
.PARAMETER description
    Description / purpose of the service account
.PARAMETER ou
    Target OU Distinguished Name (uses adOuService from settings if omitted)
.PARAMETER Credential
    Optional PSCredential
#>
param(
    [Parameter(Mandatory=$true)]  [string]$accountName,
    [Parameter(Mandatory=$true)]  [string]$description,
    [Parameter(Mandatory=$false)] [string]$ou = $env:AD_OU_SERVICE,
    [Parameter(Mandatory=$false)] [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

try {
    Import-Module ActiveDirectory -ErrorAction Stop

    $adParams = @{}
    if ($Credential) { $adParams.Credential = $Credential }

    # Check if account already exists
    $existing = Get-ADUser -Filter "SamAccountName -eq '$accountName'" @adParams -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Output "FAILURE: Service account '$accountName' already exists"
        exit 1
    }

    $upn = "$accountName@$env:AD_DOMAIN"

    $newParams = @{
        Name              = $accountName
        SamAccountName    = $accountName
        UserPrincipalName = $upn
        Description       = $description
        Path              = $ou
        AccountPassword   = (ConvertTo-SecureString ([System.Web.Security.Membership]::GeneratePassword(16,2)) -AsPlainText -Force)
        Enabled           = $true
        PasswordNeverExpires = $true
        CannotChangePassword = $true
    }
    if ($Credential) { $newParams.Credential = $Credential }

    New-ADUser @newParams
    Write-Output "SUCCESS: Service account '$accountName' created in '$ou'"
    Write-Output "INFO: UPN: $upn"
    exit 0

} catch {
    Write-Output "FAILURE: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
