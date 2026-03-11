<#
.SYNOPSIS
    Onboards a Workday associate into Active Directory.
.PARAMETER employeeId
    Workday Employee ID (e.g. WD-12345)
.PARAMETER firstName
    Employee first name
.PARAMETER lastName
    Employee last name
.PARAMETER department
    Department name
.PARAMETER manager
    Manager UPN
.PARAMETER Credential
    Optional PSCredential
#>
param(
    [Parameter(Mandatory=$true)]  [string]$employeeId,
    [Parameter(Mandatory=$true)]  [string]$firstName,
    [Parameter(Mandatory=$true)]  [string]$lastName,
    [Parameter(Mandatory=$false)] [string]$department = "",
    [Parameter(Mandatory=$false)] [string]$manager = "",
    [Parameter(Mandatory=$false)] [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

try {
    Import-Module ActiveDirectory -ErrorAction Stop

    $adParams = @{}
    if ($Credential) { $adParams.Credential = $Credential }

    # Generate SAM account name: first initial + last name, max 20 chars
    $samBase   = ($firstName.Substring(0,1) + $lastName) -replace '[^a-zA-Z0-9]',''
    $sam       = $samBase.Substring(0, [Math]::Min($samBase.Length, 20)).ToLower()
    $upn       = "$sam@$env:AD_DOMAIN"
    $ou        = $env:AD_OU_USERS

    # Deduplicate SAM
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
        DisplayName       = "$firstName $lastName"
        Department        = $department
        EmployeeID        = $employeeId
        Path              = $ou
        AccountPassword   = (ConvertTo-SecureString ([System.Web.Security.Membership]::GeneratePassword(14,2)) -AsPlainText -Force)
        Enabled           = $true
        ChangePasswordAtLogon = $true
    }
    if ($Credential) { $newParams.Credential = $Credential }

    New-ADUser @newParams

    # Set manager if provided
    if ($manager -and $manager.Trim() -ne "") {
        $managerUser = Get-ADUser -Filter "UserPrincipalName -eq '$manager'" @adParams -ErrorAction SilentlyContinue
        if ($managerUser) {
            Set-ADUser -Identity $sam -Manager $managerUser @adParams
            Write-Output "INFO: Manager set to $manager"
        } else {
            Write-Output "WARN: Manager '$manager' not found - skipped"
        }
    }

    Write-Output "SUCCESS: Workday associate '$firstName $lastName' (ID: $employeeId) onboarded"
    Write-Output "INFO: UPN           : $upn"
    Write-Output "INFO: SamAccountName: $sam"
    Write-Output "INFO: OU            : $ou"
    exit 0

} catch {
    Write-Output "FAILURE: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
