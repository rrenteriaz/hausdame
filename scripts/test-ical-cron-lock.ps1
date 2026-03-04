# Test manual: dos requests casi simultáneos a /api/cron/sync-ical
# Requisito: servidor corriendo (npm run dev) con CRON_SECRET en .env
# Ejecutar: .\scripts\test-ical-cron-lock.ps1

$baseUrl = "http://localhost:3000"
$secret = $env:CRON_SECRET
if (-not $secret) {
  $line = Get-Content .env -ErrorAction SilentlyContinue | Where-Object { $_ -match '^CRON_SECRET=' } | Select-Object -First 1
  if ($line) { $secret = $line -replace '^CRON_SECRET=(.*)$', '$1' }
}
if (-not $secret) {
  Write-Host "ERROR: CRON_SECRET no definido. Añade CRON_SECRET=tu-secret a .env"
  exit 1
}

$uri = "$baseUrl/api/cron/sync-ical"
$auth = "Bearer $secret"

Write-Host "Enviando 2 requests en paralelo a $uri ..."
$job1 = Start-Job -ScriptBlock { Invoke-RestMethod -Uri $args[0] -Headers @{ "Authorization" = $args[1] } -Method Get } -ArgumentList $uri, $auth
$job2 = Start-Job -ScriptBlock { Invoke-RestMethod -Uri $args[0] -Headers @{ "Authorization" = $args[1] } -Method Get } -ArgumentList $uri, $auth

$r1 = Receive-Job $job1 -Wait
$r2 = Receive-Job $job2 -Wait
Remove-Job $job1, $job2 -ErrorAction SilentlyContinue

Write-Host "`n--- Respuesta 1 ---"
$r1 | ConvertTo-Json -Depth 3
Write-Host "`n--- Respuesta 2 ---"
$r2 | ConvertTo-Json -Depth 3

$skipped = ($r1.skipped -eq $true -and $r1.reason -eq "lock_held") -or ($r2.skipped -eq $true -and $r2.reason -eq "lock_held")
if ($skipped) {
  Write-Host "`nOK: Una respuesta tiene skipped=true, reason=lock_held (lock funciona)"
} else {
  Write-Host "`nNOTA: Ambas ejecutaron. Si no hubo solapamiento, ambas pueden obtener resultado normal."
  Write-Host "Para forzar: ejecutar varias veces o añadir delay artificial en la ruta."
}
