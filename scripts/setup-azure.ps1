###############################################################################
# setup-azure.ps1
# Crea los recursos Azure para agent-ai-services-qualitahub
# Requiere: Azure CLI (az) autenticado
###############################################################################

$ErrorActionPreference = 'Stop'

# ── Configuración ────────────────────────────────────────────────────────
$RESOURCE_GROUP   = 'rg-agent-ai-services-qualitahub'
$LOCATION         = 'swedencentral'
$SQL_SERVER       = 'sqlserver-agent-ai-services-qualitahub'
$SQL_DATABASE     = 'db-agent-ai-services-qualitahub'
$SQL_ADMIN_USER   = 'sqladmin'
$STORAGE_ACCOUNT  = 'staaservicesqhub'
$STORAGE_CONTAINER = 'agent-files'
$SWA_NAME         = 'swa-agent-ai-services-qualitahub'

Write-Host "=== Creando recursos Azure para QualitaHub ===" -ForegroundColor Cyan
Write-Host "  Resource Group:   $RESOURCE_GROUP"
Write-Host "  Location:         $LOCATION"
Write-Host "  SQL Server:       $SQL_SERVER"
Write-Host "  SQL Database:     $SQL_DATABASE"
Write-Host "  Storage Account:  $STORAGE_ACCOUNT"
Write-Host "  SWA:              $SWA_NAME"
Write-Host ""

# ── 1. Solicitar contraseña SQL ──────────────────────────────────────────
$sqlPassword = Read-Host -AsSecureString "Introduce la contraseña para el SQL admin ($SQL_ADMIN_USER)"
$sqlPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sqlPassword)
)

# ── 2. Resource Group ────────────────────────────────────────────────────
Write-Host "[1/6] Creando Resource Group..." -ForegroundColor Green
az group create --name $RESOURCE_GROUP --location $LOCATION --output none
Write-Host "  OK: $RESOURCE_GROUP" -ForegroundColor DarkGray

# ── 3. SQL Server ────────────────────────────────────────────────────────
Write-Host "[2/6] Creando SQL Server..." -ForegroundColor Green
az sql server create `
    --name $SQL_SERVER `
    --resource-group $RESOURCE_GROUP `
    --location $LOCATION `
    --admin-user $SQL_ADMIN_USER `
    --admin-password $sqlPasswordPlain `
    --output none

# Permitir servicios Azure
az sql server firewall-rule create `
    --server $SQL_SERVER `
    --resource-group $RESOURCE_GROUP `
    --name AllowAzureServices `
    --start-ip-address 0.0.0.0 `
    --end-ip-address 0.0.0.0 `
    --output none

Write-Host "  OK: $SQL_SERVER.database.windows.net" -ForegroundColor DarkGray

# ── 4. SQL Database ─────────────────────────────────────────────────────
Write-Host "[3/6] Creando SQL Database (Basic 5 DTU)..." -ForegroundColor Green
az sql db create `
    --name $SQL_DATABASE `
    --server $SQL_SERVER `
    --resource-group $RESOURCE_GROUP `
    --edition Basic `
    --capacity 5 `
    --output none
Write-Host "  OK: $SQL_DATABASE" -ForegroundColor DarkGray

# ── 5. Storage Account ──────────────────────────────────────────────────
Write-Host "[4/6] Creando Storage Account..." -ForegroundColor Green
az storage account create `
    --name $STORAGE_ACCOUNT `
    --resource-group $RESOURCE_GROUP `
    --location $LOCATION `
    --sku Standard_LRS `
    --kind StorageV2 `
    --access-tier Hot `
    --output none

# Crear container
$storageKey = (az storage account keys list `
    --account-name $STORAGE_ACCOUNT `
    --resource-group $RESOURCE_GROUP `
    --query '[0].value' -o tsv)

az storage container create `
    --name $STORAGE_CONTAINER `
    --account-name $STORAGE_ACCOUNT `
    --account-key $storageKey `
    --output none

Write-Host "  OK: $STORAGE_ACCOUNT / $STORAGE_CONTAINER" -ForegroundColor DarkGray

# ── 6. Static Web App ───────────────────────────────────────────────────
Write-Host "[5/6] Creando Static Web App..." -ForegroundColor Green
az staticwebapp create `
    --name $SWA_NAME `
    --resource-group $RESOURCE_GROUP `
    --location $LOCATION `
    --sku Free `
    --output none
Write-Host "  OK: $SWA_NAME" -ForegroundColor DarkGray

# ── 7. Obtener deployment token ─────────────────────────────────────────
Write-Host "[6/6] Obteniendo deployment token..." -ForegroundColor Green
$deployToken = (az staticwebapp secrets list `
    --name $SWA_NAME `
    --resource-group $RESOURCE_GROUP `
    --query 'properties.apiKey' -o tsv)

Write-Host ""
Write-Host "=== Recursos creados exitosamente ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuración para api/local.settings.json:" -ForegroundColor Yellow
Write-Host @"
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "SQL_SERVER": "$SQL_SERVER.database.windows.net",
    "SQL_DATABASE": "$SQL_DATABASE",
    "SQL_USER": "$SQL_ADMIN_USER",
    "SQL_PASSWORD": "<LA_CONTRASEÑA_QUE_ELEGISTE>",
    "AZURE_STORAGE_ACCOUNT": "$STORAGE_ACCOUNT",
    "AZURE_STORAGE_KEY": "$storageKey",
    "AZURE_STORAGE_CONTAINER": "$STORAGE_CONTAINER"
  }
}
"@
Write-Host ""
Write-Host "SWA Deployment Token:" -ForegroundColor Yellow
Write-Host "  $deployToken"
Write-Host ""
Write-Host "Deploy command:" -ForegroundColor Yellow
Write-Host "  npx swa deploy ./dist --api-location ./api --env production --api-language node --api-version 18 --deployment-token `"$deployToken`""
Write-Host ""
Write-Host "NOTA: Recuerda ejecutar el SQL schema en la nueva base de datos." -ForegroundColor Yellow
Write-Host "  Puedes exportar el schema de la DB original con:"
Write-Host "  sqlcmd o Azure Data Studio -> Script Database as -> CREATE TO"
Write-Host ""
