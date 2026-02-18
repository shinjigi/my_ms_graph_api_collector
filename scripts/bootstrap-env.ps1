param(
  [Parameter(Mandatory = $true)]
  [string]$AppObjectId,

  [Parameter(Mandatory = $true)]
  [string]$GraphUserUpn,

  [int]$Top = 25,

  [switch]$RotateSecret,

  [int]$SecretDurationYears = 1,

  [string]$OutputPath = ".env"
)

$ErrorActionPreference = "Stop"

function Ensure-AzCli {
  if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI non trovato. Installa Azure CLI: https://learn.microsoft.com/cli/azure/install-azure-cli"
  }
}

function Ensure-Login {
  try {
    az account show --output none | Out-Null
  } catch {
    Write-Host "Non risulti autenticato. Avvio 'az login'..." -ForegroundColor Yellow
    az login --output none | Out-Null
  }
}

Ensure-AzCli
Ensure-Login

$tenantId = az account show --query tenantId -o tsv
if (-not $tenantId) {
  throw "Impossibile leggere tenantId da 'az account show'."
}

$clientId = az ad app show --id $AppObjectId --query appId -o tsv
if (-not $clientId) {
  throw "Impossibile leggere appId per AppObjectId '$AppObjectId'."
}

$upn = az ad user show --id $GraphUserUpn --query userPrincipalName -o tsv
if (-not $upn) {
  throw "Impossibile trovare utente '$GraphUserUpn'."
}

$clientSecret = ""
if ($RotateSecret) {
  $displayName = "graph-collector-secret-$(Get-Date -Format yyyyMMdd-HHmmss)"
  $endDate = (Get-Date).AddYears($SecretDurationYears).ToString("yyyy-MM-dd")

  $clientSecret = az ad app credential reset `
    --id $AppObjectId `
    --append `
    --display-name $displayName `
    --end-date $endDate `
    --query password `
    -o tsv

  if (-not $clientSecret) {
    throw "Impossibile creare/restituire il client secret."
  }

  Write-Host "Creato nuovo secret '$displayName' con scadenza $endDate" -ForegroundColor Green
} else {
  Write-Host "Nessun reset secret richiesto: lascia CLIENT_SECRET vuoto e incollalo manualmente." -ForegroundColor Yellow
}

$envContent = @(
  "TENANT_ID=$tenantId"
  "CLIENT_ID=$clientId"
  "CLIENT_SECRET=$clientSecret"
  "GRAPH_USER_ID=$upn"
  "TOP=$Top"
) -join [Environment]::NewLine

Set-Content -Path $OutputPath -Value $envContent -Encoding UTF8
Write-Host "File $OutputPath generato con successo." -ForegroundColor Green
