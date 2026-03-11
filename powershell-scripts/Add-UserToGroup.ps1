<#
.SYNOPSIS
    Adds an Active Directory user to a security group.
.PARAMETER userUpn
    User Principal Name of the user (e.g. user@company.com)
.PARAMETER groupName
    Name of the AD security group
.PARAMETER Credential
    Optional PSCredential (service-account run-as mode)
#>
param(
    [Parameter(Mandatory=$true)]  [string]$userUpn,
    [Parameter(Mandatory=$true)]  [string]$groupName,
    [Parameter(Mandatory=$false)] [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

try {
    Import-Module ActiveDirectory -ErrorAction Stop

    $adParams = @{}
    if ($Credential) { $adParams.Credential = $Credential }

    # Verify user exists
    $filterUser = "UserPrincipalName -eq '$userUpn'"
    $user = Get-ADUser -Filter $filterUser @adParams
    if (-not $user) {
        Write-Output "FAILURE: User '$userUpn' not found in Active Directory"
        exit 1
    }

    # Verify group exists
    $filterGroup = "Name -eq '$groupName'"
    $group = Get-ADGroup -Filter $filterGroup @adParams
    if (-not $group) {
        Write-Output "FAILURE: Group '$groupName' not found in Active Directory"
        exit 1
    }

    # Check if already a member
    $members = Get-ADGroupMember -Identity $group @adParams
    $isMember = $members | Where-Object { $_.SamAccountName -eq $user.SamAccountName }
    if ($isMember) {
        Write-Output "INFO: User '$userUpn' is already a member of '$groupName'"
        Write-Output "SUCCESS: No change needed - user already in group"
        exit 0
    }

    # Add user to group
    Add-ADGroupMember -Identity $group -Members $user @adParams
    Write-Output "SUCCESS: User '$userUpn' added to group '$groupName'"
    Write-Output "INFO: SamAccountName : $($user.SamAccountName)"
    Write-Output "INFO: Group DN       : $($group.DistinguishedName)"
    exit 0

} catch {
    Write-Output "FAILURE: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
