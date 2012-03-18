@echo off


if 1==1 goto PRODUCTION
goto DEVELOPMENT

:PRODUCTION

echo Simulating PRODUCTION
echo .
set NODE_ENV=production
nodemon --debug SolarTournament/app.js
goto END

:DEVELOPMENT

echo Simulating DEVELOPMENT
echo .
set NODE_ENV=development
nodemon --debug SolarTournament/app.js
goto END

:END
pause