@ECHO OFF

%~d0
CD "%~dp0"

@echo Downloading Chocolatey
@powershell -NoProfile -ExecutionPolicy unrestricted -Command "iex ((new-object net.webclient).DownloadString('http://bit.ly/psChocInstall'))"
SET PATH=%PATH%;%systemdrive%\chocolatey\bin

@echo Downloading Node.js with NPM
CALL cinst nodejs.install

@echo Installing Jam (package manager for JavaScript)
CALL npm install -g jamjs

@echo Installing Node Inspector globally (a debugger interface for nodeJS using the WebKit Web Inspector)
CALL npm install -g node-inspector

@echo Installing Nodemon globally (will reload your application each time it changes so you don’t need to restart it.)
CALL npm install -g nodemon

pause