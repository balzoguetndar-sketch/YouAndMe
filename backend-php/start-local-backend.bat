@echo off
title "YouAndMe Local Backend (PHP 8.3 et MySQL 8.4)"
echo ==========================================================
echo    DEMARRAGE DU BACKEND LOCAL YOUANDME (PHP / MYSQL)
echo ==========================================================
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start-local-backend.ps1"
pause

