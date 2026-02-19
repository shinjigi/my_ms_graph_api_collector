param(
  [Parameter(Mandatory = $true)]
  [string]$AppObjectId,

  [int]$Top = 25,

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

$envContent = @(
  "TENANT_ID=$tenantId"
  "CLIENT_ID=$clientId"
  "TOP=$Top"
) -join [Environment]::NewLine

Set-Content -Path $OutputPath -Value $envContent -Encoding UTF8
Write-Host "File $OutputPath generato con successo." -ForegroundColor Green
