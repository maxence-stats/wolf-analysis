@echo off
REM Lance Wolf Analysis via un petit serveur local (http://localhost) au lieu
REM d'ouvrir index.html directement en file:// - corrige le cache navigateur qui
REM servait une ancienne version de l'appli malgre les mises a jour. Le serveur
REM envoie Cache-Control: no-cache sur chaque reponse.
setlocal
set ROOT=%~dp0
set PORT=8137

powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('localhost', %PORT%); exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  start "Wolf Analysis - serveur local" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ROOT%.claude\static-server.ps1"
  timeout /t 1 /nobreak >nul
)

start "" "http://localhost:%PORT%/"
