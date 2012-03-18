@ECHO off
CALL azure_cmd.cmd
SET COMMAND="Start-AzureEmulator -launch"

cd SolarTournament
%powerShellDir%\powershell.exe -Command %LOAD_AZURE_CMDLETS% %COMMAND%

pause