<#
.SYNOPSIS
    Registers a Windows Task Scheduler task that runs morning-automation.ps1
    every weekday at 08:30.

.NOTES
    Run once as Administrator. The task runs under the current user account.
    Modify $StartTime and $Mode below as needed.
#>
param(
    [string] $StartTime = '08:30',
    [string] $Mode      = 'smart'
)

$ErrorActionPreference = 'Stop'
$taskName  = 'TP-MorningAutomation'
$repoRoot  = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot 'scripts\morning-automation.ps1'

$action = New-ScheduledTaskAction `
    -Execute    'powershell.exe' `
    -Argument   "-NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`" -Mode $Mode" `
    -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger `
    -Weekly `
    -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday `
    -At $StartTime

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $taskName `
    -Action   $action `
    -Trigger  $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Force

Write-Host "Task '$taskName' registrato: ogni giorno feriale alle $StartTime." -ForegroundColor Green
Write-Host "Modifica da Task Scheduler se necessario." -ForegroundColor Gray
