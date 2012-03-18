%~d0
CD "%~dp0"


SET LOAD_AZURE_CMDLETS="Get-ChildItem '%ProgramFiles(x86)%\Microsoft SDKs\Windows Azure\Nodejs\Nov2011\PowerShell\*cmdlets.dll' | ForEach-Object {Import-Module $_};"

IF EXIST %WINDIR%\SysWow64 (
set powerShellDir=%WINDIR%\SysWow64\windowspowershell\v1.0
) ELSE (
set powerShellDir=%WINDIR%\system32\windowspowershell\v1.0
)
