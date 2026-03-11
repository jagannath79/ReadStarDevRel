<#
.SYNOPSIS
    Converts an Internal Labor (IL) AD account to External Labor (EL).
.PARAMETER userUpn
    UPN of the IL user to convert
.PARAMETER vendorName
    Vendor/company name for the contractor
.PARAMETER contractEndDate
    Contract end date in YYYY-MM-DD format (sets account expiry)
.PARAMETER Credential
    Optional PSCredential
#>
param(
    [Parameter(Mandatory=$true)]  [string]$userUpn,
    [Parameter(Mandatory=$true)]  [string]$vendorName,
    [Parameter(Mandatory=$false)] [string]$contractEndDate = "",
    [Parameter(Mandatory=$false)] [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

try {
    Import-Module ActiveDirectory -ErrorAction Stop

    $adParams = @{}
    if ($Credential) { $adParams.Credential = $Credential }

    $user = Get-ADUser -Filter "UserPrincipalName -eq '$userUpn'" -Properties Description, AccountExpirationDate @adParams
    if (-not $user) {
        Write-Output "FAILURE: User '$userUpn' not found in Active Directory"
        exit 1
    }

    # Update description to reflect EL status
    $newDescription = "EL - $vendorName"
    Set-ADUser -Identity $user -Description $newDescription @adParams

    # Set account expiry if provided
    if ($contractEndDate -and $contractEndDate -match '^\d{4}-\d{2}-\d{2}$') {
        $expiry = [datetime]::ParseExact($contractEndDate, "yyyy-MM-dd", $null)
        Set-ADAccountExpiration -Identity $user -DateTime $expiry @adParams
        Write-Output "INFO: Account expiry set to $contractEndDate"
    }

    Write-Output "SUCCESS: User '$userUpn' converted to EL (Vendor: $vendorName)"
    Write-Output "INFO: Description updated to: $newDescription"
    exit 0

} catch {
    Write-Output "FAILURE: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
