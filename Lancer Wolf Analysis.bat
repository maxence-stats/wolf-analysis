@echo off
REM Lance Wolf Analysis via un petit serveur local (http://localhost) au lieu
REM d'ouvrir index.html directement en file:// - corrige le cache navigateur qui
REM servait une ancienne version de l'appli malgre les mises a jour. Le serveur
REM envoie Cache-Control: no-cache sur chaque reponse.
REM
REM Le port n'est plus code en dur ici : Windows exclut periodiquement certaines
REM plages de ports (reservees dynamiquement, notamment par Hyper-V/WSL NAT), ce qui
REM a deja rendu 3 ports fixes successifs injoignables (8091, 8137, 8189). Le script
REM static-server.ps1 choisit maintenant lui-meme un port bindable (avec repli
REM automatique si son port prefere est exclu) et l'ecrit dans server-port.txt - ce
REM script se contente de le relire, ce qui le rend auto-reparant sans intervention
REM manuelle a chaque nouvelle exclusion.
setlocal
set ROOT=%~dp0
set PORTFILE=%ROOT%.claude\server-port.txt
set DEFAULT_PORT=8189

if exist "%PORTFILE%" (
  set /p PORT=<"%PORTFILE%"
) else (
  set PORT=%DEFAULT_PORT%
)

powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('localhost', %PORT%); exit 0 } catch { exit 1 }" >nul 2>&1
set SERVER_UP=0
if not errorlevel 1 set SERVER_UP=1

REM Un serveur deja lance mais PERIME (demarre avant une mise a jour de static-server.ps1)
REM ne connait pas /api/ia/ping : le Portefeuille IA afficherait "Sauvegarde impossible".
REM On le detecte et on le remplace, sans intervention manuelle.
if "%SERVER_UP%"=="1" (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:%PORT%/api/ia/ping -TimeoutSec 4; if ($r.Content -match 'v.:18') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
  if errorlevel 1 (
    powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -match 'static-server' -and $_.CommandLine -notmatch '-Port' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
    timeout /t 2 /nobreak >nul
    set SERVER_UP=0
  )
)

if "%SERVER_UP%"=="0" (
  start "Wolf Analysis - serveur local" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ROOT%.claude\static-server.ps1"
  timeout /t 2 /nobreak >nul
  if exist "%PORTFILE%" set /p PORT=<"%PORTFILE%"
)

start "" "http://localhost:%PORT%/"
