param(
  [switch]$Start,
  [switch]$Stop,
  [switch]$Logs
)

# Despliega el backend BotIgg a la Raspberry Pi con Docker.
# Uso:
#   .\deploy-raspberry.ps1             -> solo sube los archivos
#   .\deploy-raspberry.ps1 -Start      -> sube, compila imagen y arranca en Docker (segundo plano)
#   .\deploy-raspberry.ps1 -Stop       -> detiene el contenedor
#   .\deploy-raspberry.ps1 -Logs       -> muestra los logs del contenedor

$ErrorActionPreference = 'Stop'

$user      = 'denis'
$hostName  = '192.168.18.31'
$remoteDir = '/home/denis/botigg-backend'
$archive   = Join-Path $env:TEMP 'botigg-backend.tar.gz'

if ($Stop) {
    Write-Host "==> Deteniendo el backend en la Raspberry..." -ForegroundColor Cyan
    ssh "$user@${hostName}" "cd $remoteDir && docker compose down"
    return
}

if ($Logs) {
    Write-Host "==> Logs del backend (Ctrl+C para salir)..." -ForegroundColor Cyan
    ssh "$user@${hostName}" "cd $remoteDir && docker compose logs -f backend"
    return
}

Write-Host "==> Empaquetando backend..." -ForegroundColor Cyan
Remove-Item -LiteralPath $archive -ErrorAction SilentlyContinue
Push-Location backend
tar -czf $archive --exclude=node_modules --exclude=dist .
Pop-Location

Write-Host "==> Subiendo a $user@$hostName (ingresa la contrasena cuando la pida)..." -ForegroundColor Cyan
scp $archive "${user}@${hostName}:~"

Write-Host "==> Extrayendo en la Raspberry..." -ForegroundColor Cyan
ssh "$user@${hostName}" "mkdir -p $remoteDir && tar -xzf ~/botigg-backend.tar.gz -C $remoteDir && rm ~/botigg-backend.tar.gz"

if ($Start) {
    Write-Host "==> Compilando imagen y arrancando en Docker (puede tardar la primera vez)..." -ForegroundColor Cyan
    ssh "$user@${hostName}" "cd $remoteDir && docker compose up -d --build"
    Write-Host "==> Backend corriendo en segundo plano: http://$hostName`:3100" -ForegroundColor Green
} else {
    Write-Host "==> Archivos subidos. Para compilar y arrancar con Docker:" -ForegroundColor Green
    Write-Host "    .\deploy-raspberry.ps1 -Start"
}
