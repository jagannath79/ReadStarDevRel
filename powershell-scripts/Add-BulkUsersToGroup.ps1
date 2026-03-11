<#
.SYNOPSIS
    Adds multiple AD users to security groups from a CSV/bulk data set.
.PARAMETER UserUPN
    User Principal Name of the user
.PARAMETER GroupName
    Name of the AD security group
.PARAMETER Credential
    Optional PSCredential
#>
param(
    [Parameter(Mandatory=$true)]  [string]$UserUPN,
    [Parameter(Mandatory=$true)]  [string]$GroupName,
    [Parameter(Mandatory=$false)] [System.Management.Automation.PSCredential]$Credential
)

$ErrorActionPreference = "Stop"

try {
    Import-Module ActiveDirectory -ErrorAction Stop

    $adParams = @{}
    if ($Credential) { $adParams.Credential = $Credential }

    $user = Get-ADUser -Filter "UserPrincipalName -eq '$UserUPN'" @adParams
    if (-not $user) { Write-Output "FAILURE: User '$UserUPN' not found"; exit 1 }

    $group = Get-ADGroup -Filter "Name -eq '$GroupName'" @adParams
    if (-not $group) { Write-Output "FAILURE: Group '$GroupName' not found"; exit 1 }

    $isMember = Get-ADGroupMember -Identity $group @adParams |
                Where-Object { $_.SamAccountName -eq $user.SamAccountName }
    if ($isMember) {
        Write-Output "SUCCESS: '$UserUPN' already in '$GroupName' - no change"
        exit 0
    }

    Add-ADGroupMember -Identity $group -Members $user @adParams
    Write-Output "SUCCESS: '$UserUPN' added to '$GroupName'"
    exit 0

} catch {
    Write-Output "FAILURE: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
