@ECHO OFF

%~d0
CD "%~dp0"

@echo Downloading Chocolatey
@powershell -NoProfile -ExecutionPolicy unrestricted -Command "iex ((new-object net.webclient).DownloadString('https://chocolatey.org/install.ps1'))"

rem First is the legacy path, second the current path (lets take both to be sure) 
SET PATH=%PATH%;%systemdrive%\chocolatey\bin
SET PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin

rem Ensures that node and npm can be found, too
SET PATH=%PATH%;%ProgramFiles%\nodejs
SET PATH=%PATH%;%ProgramFiles(x86)%\nodejs

@echo Downloading Node.js with NPM
CALL cinst nodejs.install -Version 0.8.15 --force -y

@echo Change folder for global node_modules
@echo (%appdata%\npm of NT AUTHORITY\SYSTEM does not work!)
CALL npm config set prefix %SystemDrive%\npm
SET PATH=%PATH%;%systemdrive%\npm

cd SolarTournament

@echo Downloading Node.js modules
CALL npm install