<#
.SYNOPSIS
    Onboards a VNDLY External Labor contractor into Active Directory.
.PARAMETER vndlyId
    VNDLY Worker ID (e.g. VN-12345)
.PARAMETER firstName / lastName
    Contractor name
.PARAMETER vendor
    Vendor company name
.PARAMETER contractEnd
    Contract end date YYYY-MM-DD (sets account expiry)
.PARAMETER Credential
    Optional PSCredential
#>
param(
    [Parameter(Mandatory=$true)]  [string]$vndlyId,
    [Parameter(Mandatory=$true)]  [string]$firstName,
    [Parameter(Mandatory=$true)]  [string]$lastName,
    [Parameter(Mandatory=$true)]  [string]$vendor,
    [Parameter(Mandatory=$false)] [string]$contractEnd = "",
    [Parameter(Mandatory=$false)] [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

try {
    Import-Module ActiveDirectory -ErrorAction Stop

    $adParams = @{}
    if ($Credential) { $adParams.Credential = $Credential }

    $samBase = ("el." + $firstName.Substring(0,1) + $lastName) -replace '[^a-zA-Z0-9\.]',''
    $sam     = $samBase.Substring(0, [Math]::Min($samBase.Length, 20)).ToLower()
    $upn     = "$sam@$env:AD_DOMAIN"
    $ou      = $env:AD_OU_USERS

    $counter = 1
    while (Get-ADUser -Filter "SamAccountName -eq '$sam'" @adParams -ErrorAction SilentlyContinue) {
        $sam = "$samBase$counter".Substring(0, [Math]::Min(($samBase + $counter).Length, 20)).ToLower()
        $upn = "$sam@$env:AD_DOMAIN"
        $counter++
    }

    $newParams = @{
        Name              = "$firstName $lastName"
        GivenName         = $firstName
        Surname           = $lastName
        SamAccountName    = $sam
        UserPrincipalName = $upn
        DisplayName       = "$firstName $lastName ($vendor)"
        Description       = "EL Contractor - $vendor | VNDLY: $vndlyId"
        Department        = $vendor
        Path              = $ou
        AccountPassword   = (ConvertTo-SecureString ([System.Web.Security.Membership]::GeneratePassword(14,2)) -AsPlainText -Force)
        Enabled           = $true
        ChangePasswordAtLogon = $true
    }
    if ($Credential) { $newParams.Credential = $Credential }

    New-ADUser @newParams

    if ($contractEnd -and $contractEnd -match '^\d{4}-\d{2}-\d{2}$') {
        $expiry = [datetime]::ParseExact($contractEnd, "yyyy-MM-dd", $null)
        Set-ADAccountExpiration -Identity $sam -DateTime $expiry @adParams
        Write-Output "INFO: Account expiry set to $contractEnd"
    }

    Write-Output "SUCCESS: VNDLY contractor '$firstName $lastName' (ID: $vndlyId) onboarded"
    Write-Output "INFO: UPN    : $upn"
    Write-Output "INFO: Vendor : $vendor"
    exit 0

} catch {
    Write-Output "FAILURE: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
