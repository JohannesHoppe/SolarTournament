using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using Microsoft.WindowsAzure.ServiceRuntime;

namespace NodeHost
{
    public class WorkerRole : RoleEntryPoint
    {
        public override bool OnStart()
        {
            Diagnostics.Start();
            return base.OnStart();
        }

        public override void Run()
        {
            try {

                Trace.TraceWarning("*** Going to start ***");

                var environmentVariables = new List<string[]>();

                #if DEBUG 
                environmentVariables.Add(new[] { "port", "1337" }); // the emulator blocks port 80
                environmentVariables.Add(new[] { "NODE_ENV", "development" });
                #else
                environmentVariables.Add(new[] { "port", "80" });
                environmentVariables.Add(new[] { "NODE_ENV", "production" });
                #endif

                int i = 0;
                while (i++ < 100)
                {
                    ProcessControl.StartProcess(EnvironmentInfo.Node,
                        @"app.js",
                        Environment.ExpandEnvironmentVariables(@"%RoleRoot%\approot\SolarTournament"),
                        environmentVariables);

                    Thread.Sleep(3000);
                }

                Trace.TraceWarning("*** Too many restarts. Reached end of Node.exe loop, this is not good! ***");
                
            } 
            catch (Exception ex)
            {
                Trace.TraceError("EXCEPTION: {0} - {1} - {2} - {3}".E(
                    ex.GetType(),
                    ex.Message,
                    ex.StackTrace,
                    ex.InnerException != null ? ex.InnerException.Message : null));

                Thread.Sleep(6000);
                throw;
            }
        }
    }
}
