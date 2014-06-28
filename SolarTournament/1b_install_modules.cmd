@ECHO OFF

%~d0
CD "%~dp0"

cd SolarTournament

@echo Downloading Node.js modules
CALL npm install

pause
