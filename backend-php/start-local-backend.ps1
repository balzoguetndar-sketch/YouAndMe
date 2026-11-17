# Script de démarrage local du Backend PHP pour YouAndMe
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$phpExe = "C:\Users\adiop\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   DÉMARRAGE DU BACKEND LOCAL YOUANDME (PHP 8.3)          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "`nBase de données locale connectée : storage/yam_local.sqlite" -ForegroundColor Yellow
Write-Host ">>> Votre API PHP locale est prête sur http://0.0.0.0:8000 (accessible en local et sur votre Wi-Fi) <<<" -ForegroundColor Green
Write-Host "Appuyez sur Ctrl+C pour arrêter le serveur.`n" -ForegroundColor Gray

& $phpExe -c php.ini -S 0.0.0.0:8000 index.php
