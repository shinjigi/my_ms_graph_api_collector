<#
.SYNOPSIS
    Morning automation script: registers Smart Working in Zucchetti and
    books a Nibol desk for today (or the date passed as argument).

.PARAMETER Date
    Target date in YYYY-MM-DD format. Defaults to today.

.PARAMETER Mode
    'smart'       → full-day Smart Working in Zucchetti + Nibol booking
    'office'      → Nibol check-in only
    'half-smart'  → half-day SW + half-day leave in Zucchetti

.EXAMPLE
    .\scripts\morning-automation.ps1 -Mode smart
    .\scripts\morning-automation.ps1 -Date 2026-03-11 -Mode office
#>
param(
    [string] $Date = (Get-Date -Format 'yyyy-MM-dd'),
    [ValidateSet('smart', 'office', 'half-smart')]
    [string] $Mode = 'smart'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Morning automation — $Date — Mode: $Mode" -ForegroundColor Cyan

# Ensure .env variables are available
$envFile = Join-Path $repoRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
        }
    }
}

$nodeExe   = 'node'
$zucScript = Join-Path $repoRoot 'zucchetti_automation\update_data.js'

switch ($Mode) {
    'smart' {
        Write-Host 'Registrazione Smart Working (full day)...'
        & $nodeExe $zucScript --date=$Date '--type=SMART WORKING' --full-day=true
        if ($LASTEXITCODE -ne 0) { throw "Zucchetti update failed (exit $LASTEXITCODE)" }

        Write-Host 'Prenotazione Nibol...'
        & $nodeExe -e "require('./src/collectors/nibol').nibolBookDesk('$Date').catch(e => { console.error(e); process.exit(1); })" `
            --require tsx/cjs `
            -- $null
    }

    'office' {
        Write-Host 'Check-in Nibol...'
        & $nodeExe -e "require('./src/collectors/nibol').nibolCheckIn('$Date').catch(e => { console.error(e); process.exit(1); })"
    }

    'half-smart' {
        Write-Host 'Registrazione Smart Working (mezza giornata)...'
        & $nodeExe $zucScript --date=$Date '--type=SMART WORKING' --hours=3 --minutes=51
        if ($LASTEXITCODE -ne 0) { throw "Zucchetti SW update failed" }

        Write-Host 'Registrazione Ferie (mezza giornata)...'
        & $nodeExe $zucScript --date=$Date --type=FERIE --hours=3 --minutes=51
        if ($LASTEXITCODE -ne 0) { throw "Zucchetti Ferie update failed" }
    }
}

Write-Host 'Morning automation completata.' -ForegroundColor Green
