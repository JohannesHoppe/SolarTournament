@ECHO OFF

%~d0
CD "%~dp0"

@echo Downloading Chocolatey
@powershell -NoProfile -ExecutionPolicy unrestricted -Command "iex ((new-object net.webclient).DownloadString('http://bit.ly/psChocInstall'))"
SET PATH=%PATH%;%systemdrive%\chocolatey\bin

@echo Downloading Node.js with NPM
CALL cinst nodejs.install -Version 0.10.29

@echo Change folder for global node_modules
@echo (%appdata%\npm of NT AUTHORITY\SYSTEM does not work!)
CALL npm config set prefix %SystemDrive%\npm
SET PATH=%PATH%;%systemdrive%\npm

@echo Downloading Jam globally
CALL npm install -g jamjs@0.2.16

cd SolarTournament

@echo Downloading Node.js modules
CALL npm install

@echo Downloading jam modules
CALL jam install