<#
.SYNOPSIS
    First-run Nibol setup: opens a visible Chrome window with the persistent
    profile so the user can log in manually. The session is saved for future
    headless runs.

.NOTES
    Run this script once before using morning-automation.ps1.
    After login, close the browser window — the session is automatically persisted.
#>
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

# Load .env to get NIBOL_PROFILE_DIR
$envFile = Join-Path $repoRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
        }
    }
}

$profileDir = $env:NIBOL_PROFILE_DIR
if (-not $profileDir) {
    throw 'NIBOL_PROFILE_DIR non configurato in .env'
}

Write-Host "Avvio sessione Nibol su profilo: $profileDir" -ForegroundColor Cyan
Write-Host 'Esegui il login nel browser che si apre, poi chiudi la finestra.' -ForegroundColor Yellow

Set-Location $repoRoot

# Run a minimal Playwright script that opens the browser for manual login
$setupScript = @"
const { chromium } = require('playwright');
(async () => {
    const ctx  = await chromium.launchPersistentContext(process.env.NIBOL_PROFILE_DIR, {
        headless: false,
        args:     ['--no-sandbox'],
    });
    const page = await ctx.newPage();
    await page.goto('https://app.nibol.co');
    console.log('Browser aperto. Effettua il login, poi chiudi il browser.');
    await page.waitForEvent('close', { timeout: 300_000 }).catch(() => {});
    await ctx.close();
    console.log('Sessione Nibol salvata.');
})();
"@

$tempScript = Join-Path $env:TEMP 'nibol-setup.js'
Set-Content -Path $tempScript -Value $setupScript -Encoding UTF8

node $tempScript

Remove-Item $tempScript -Force
Write-Host 'Setup completato.' -ForegroundColor Green
