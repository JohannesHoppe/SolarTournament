@ECHO off

%~d0
CD "%~dp0"

if 1==2 goto PRODUCTION
goto DEVELOPMENT

:PRODUCTION

echo Simulating PRODUCTION
echo .
set NODE_ENV=production
node SolarTournament/app.js
goto END

:DEVELOPMENT

echo Simulating DEVELOPMENT
echo .
set NODE_ENV=development
node SolarTournament/app.js
goto END

:END
pause