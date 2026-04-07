###############################################################################
# duplicate-project.ps1
# Duplica el proyecto dashboard-europastry → dashboard-qualitahub
# Renombra todos los recursos Azure, branding y referencias internas.
###############################################################################

param(
    [string]$SourceDir = (Split-Path $PSScriptRoot -Parent),
    [string]$TargetDir = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "dashboard-qualitahub")
)

$ErrorActionPreference = 'Stop'

Write-Host "=== Duplicando proyecto ===" -ForegroundColor Cyan
Write-Host "  Origen:  $SourceDir"
Write-Host "  Destino: $TargetDir"
Write-Host ""

# ── 1. Copiar todo excepto node_modules, dist, .git, .venv ──────────────
if (Test-Path $TargetDir) {
    Write-Host "AVISO: $TargetDir ya existe. Eliminando..." -ForegroundColor Yellow
    Remove-Item $TargetDir -Recurse -Force
}

$excludeDirs = @('node_modules', 'dist', '.git', '.venv', 'package-lock.json')

Write-Host "Copiando archivos..." -ForegroundColor Green
robocopy $SourceDir $TargetDir /E /XD node_modules dist .git .venv /XF package-lock.json /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null

# Remove the scripts folder from the copy (not needed in the new project)
$scriptsCopy = Join-Path $TargetDir "scripts"
if (Test-Path $scriptsCopy) { Remove-Item $scriptsCopy -Recurse -Force }

Write-Host "Archivos copiados." -ForegroundColor Green
Write-Host ""

# ── 2. Definir reemplazos de texto ───────────────────────────────────────
# Orden importa: más específicos primero

$replacements = [ordered]@{
    # Azure Resource Names (full FQDN first to avoid double-replace)
    'sqlserver-agent-ai-services.database.windows.net' = 'sqlserver-agent-ai-services-qualitahub.database.windows.net'
    'db-agent-ai-services'                             = 'db-agent-ai-services-qualitahub'
    'swa-agent-ai-services'                            = 'swa-agent-ai-services-qualitahub'
    'stagentaiservices'                                = 'staaservicesqhub'
    'rg-europastry-cobros'                             = 'rg-agent-ai-services-qualitahub'

    # Package / project names
    'agent-ai-services-dashboard'                      = 'agent-ai-services-qualitahub-dashboard'
    'dashboard-europastry'                              = 'dashboard-qualitahub'

    # Branding - title and labels
    'Agent AI Services — Europastry'                   = 'Agent AI Services — QualitaHub'
    'Europastry rebranding'                            = 'QualitaHub rebranding'
    'Europastry corporativo'                           = 'QualitaHub corporativo'
    'branding Europastry'                              = 'branding QualitaHub'
    'Europastry (logo'                                 = 'QualitaHub (logo'
    'Cobros Europastry'                                = 'QualitaHub'
    'Agentes Europastry'                               = 'Agentes QualitaHub'
    'No Europastry branding'                           = 'No legacy branding'

    # Logo references in code
    'europastry_logo_white.svg'                        = 'qualitahub_logo_white.svg'
    'europastry_logo_dark.svg'                         = 'qualitahub_logo_dark.svg'
    'europastry_circle.svg'                            = 'qualitahub_circle.svg'
    'favicon_europastry.png'                           = 'favicon_qualitahub.png'

    # Alt text and labels
    'alt="Europastry"'                                 = 'alt="QualitaHub"'
    '<span>Europastry</span>'                          = '<span>QualitaHub</span>'

    # Tailwind color prefix
    'euro-green'                                       = 'qhub-green'
    'euro-cream'                                       = 'qhub-cream'

    # Remaining standalone Europastry references in docs
    'Europastry'                                       = 'QualitaHub'
}

# ── 3. Aplicar reemplazos en archivos de texto ───────────────────────────
$textExtensions = @('.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '.md',
                     '.html', '.css', '.config.js', '.config.ts', '.svg')

$files = Get-ChildItem -Path $TargetDir -Recurse -File |
    Where-Object {
        $ext = $_.Extension.ToLower()
        ($textExtensions -contains $ext) -and
        ($_.FullName -notmatch '\\node_modules\\') -and
        ($_.FullName -notmatch '\\dist\\') -and
        ($_.Name -ne 'package-lock.json')
    }

Write-Host "Aplicando reemplazos en $($files.Count) archivos..." -ForegroundColor Green

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    if (-not $content) { continue }

    $changed = $false
    foreach ($key in $replacements.Keys) {
        if ($content.Contains($key)) {
            $content = $content.Replace($key, $replacements[$key])
            $changed = $true
        }
    }
    if ($changed) {
        Set-Content $file.FullName $content -Encoding UTF8 -NoNewline
        Write-Host "  Actualizado: $($file.FullName.Replace($TargetDir, '.'))" -ForegroundColor DarkGray
    }
}

Write-Host ""

# ── 4. Renombrar archivos con 'europastry' en el nombre ─────────────────
Write-Host "Renombrando archivos con 'europastry' en el nombre..." -ForegroundColor Green

$fileRenames = @{
    'europastry_logo_white.svg' = 'qualitahub_logo_white.svg'
    'europastry_logo_dark.svg'  = 'qualitahub_logo_dark.svg'
    'europastry_circle.svg'     = 'qualitahub_circle.svg'
    'favicon_europastry.png'    = 'favicon_qualitahub.png'
}

foreach ($oldName in $fileRenames.Keys) {
    $found = Get-ChildItem -Path $TargetDir -Recurse -Filter $oldName
    foreach ($f in $found) {
        $newPath = Join-Path $f.DirectoryName $fileRenames[$oldName]
        Rename-Item $f.FullName $newPath
        Write-Host "  $($f.Name) -> $($fileRenames[$oldName])" -ForegroundColor DarkGray
    }
}

Write-Host ""

# ── 5. Limpiar credenciales en local.settings.json ──────────────────────
Write-Host "Limpiando credenciales de local.settings.json..." -ForegroundColor Green

$localSettings = Join-Path $TargetDir "api\local.settings.json"
if (Test-Path $localSettings) {
    $ls = Get-Content $localSettings -Raw -Encoding UTF8
    # Reset password and storage key to placeholders
    $ls = $ls -replace '"SQL_PASSWORD":\s*"[^"]*"', '"SQL_PASSWORD": "<SET_NEW_PASSWORD>"'
    $ls = $ls -replace '"AZURE_STORAGE_KEY":\s*"[^"]*"', '"AZURE_STORAGE_KEY": "<SET_STORAGE_KEY>"'
    Set-Content $localSettings $ls -Encoding UTF8 -NoNewline
    Write-Host "  Credenciales reseteadas a placeholders." -ForegroundColor DarkGray
}

# Also clean _query-execs.cjs if it has hardcoded credentials
$queryExecs = Join-Path $TargetDir "api\_query-execs.cjs"
if (Test-Path $queryExecs) {
    $qe = Get-Content $queryExecs -Raw -Encoding UTF8
    $qe = $qe -replace "password:\s*'[^']*'", "password: '<SET_NEW_PASSWORD>'"
    Set-Content $queryExecs $qe -Encoding UTF8 -NoNewline
    Write-Host "  _query-execs.cjs credenciales limpiadas." -ForegroundColor DarkGray
}

Write-Host ""

# ── 6. Inicializar git ──────────────────────────────────────────────────
Write-Host "Inicializando repositorio git..." -ForegroundColor Green
Push-Location $TargetDir
git init | Out-Null
git add -A | Out-Null
git commit -m "Initial commit: duplicated from dashboard-europastry for QualitaHub" | Out-Null
Pop-Location
Write-Host "  Repo inicializado con commit inicial." -ForegroundColor DarkGray

Write-Host ""
Write-Host "=== Proyecto duplicado exitosamente ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proximos pasos:" -ForegroundColor Yellow
Write-Host "  1. cd '$TargetDir'"
Write-Host "  2. Reemplazar logos SVG/PNG en public/img/ con los de QualitaHub"
Write-Host "  3. npm install && cd api && npm install"
Write-Host "  4. Ejecutar scripts/setup-azure.ps1 para crear los recursos Azure"
Write-Host "  5. Configurar credenciales en api/local.settings.json"
Write-Host "  6. Crear repo en GitHub: gh repo create qualita/dashboard-agentes-qualitahub --private --source ."
Write-Host "  7. git remote add origin https://github.com/qualita/dashboard-agentes-qualitahub.git"
Write-Host "  8. git push -u origin main"
Write-Host ""
