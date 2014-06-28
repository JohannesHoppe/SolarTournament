@ECHO OFF

%~d0
CD "%~dp0"

@echo Downloading Chocolatey
@powershell -NoProfile -ExecutionPolicy unrestricted -Command "iex ((new-object net.webclient).DownloadString('https://chocolatey.org/install.ps1'))"
SET PATH=%PATH%;%systemdrive%\chocolatey\bin

@echo Downloading Node.js with NPM
CALL cinst nodejs.install -Version 0.8.15

@echo Change folder for global node_modules
@echo (%appdata%\npm of NT AUTHORITY\SYSTEM does not work!)
CALL npm config set prefix %SystemDrive%\npm
SET PATH=%PATH%;%systemdrive%\npm

cd SolarTournament

@echo Downloading Node.js modules
CALL npm install