using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace NodeHost
{
    public static class ProcessControl
    {
        public static bool RedirectOutput { get; set; }

        public static void StartProcess(string fileName, string arguments, string workingDirectory, IEnumerable<string[]> environmentVariables = null)
        {
            RedirectOutput = true;

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                CreateNoWindow = false,
                UseShellExecute = false,
                RedirectStandardOutput = RedirectOutput,
                RedirectStandardError = RedirectOutput,
                WorkingDirectory = workingDirectory
            };

            if (environmentVariables != null)
            {
                foreach (var env in environmentVariables)
                {
                    startInfo.EnvironmentVariables[env[0]] = env[1];
                }    
            }

            Process process = new Process { StartInfo = startInfo };

            Trace.TraceWarning("PROCESS START: {0} {1}".W(fileName, arguments));
            WaitForExit(process);
        }

        private static void WaitForExit(Process process)
        {
            process.ErrorDataReceived += (sender, args) => Trace.TraceError("NODEJS: {0}".E(args.Data));
            process.OutputDataReceived += (sender, args) => Trace.TraceInformation("NODEJS: {0}".I(args.Data));

            process.Start();

            process.BeginErrorReadLine();
            process.BeginOutputReadLine();

            process.WaitForExit();

            process.CancelErrorRead();
            process.CancelOutputRead();
        }
    }
}
