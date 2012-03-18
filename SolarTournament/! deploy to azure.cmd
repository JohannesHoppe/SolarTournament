@ECHO off
CALL azure_cmd.cmd
SET COMMAND="Publish-AzureService -name SolarTournament -location \"North Europe\" -launch"

cd SolarTournament
%powerShellDir%\powershell.exe -Command %LOAD_AZURE_CMDLETS% %COMMAND%

pause