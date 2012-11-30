using System;
using Microsoft.WindowsAzure;
using Microsoft.WindowsAzure.Diagnostics;
using Microsoft.WindowsAzure.ServiceRuntime;

namespace NodeHost
{
    public static class Diagnostics
    {
        public static void Start()
        {
            var transferPeriod = TimeSpan.FromMinutes(1);

            // get the initial configuration – remember we get Windows Azure logs free here.
            // This is a worker role, so IIS logs are not captured.
            DiagnosticMonitorConfiguration diagConfig = DiagnosticMonitor.GetDefaultInitialConfiguration();

            // indicate we’re capturing all of the Application and System event log data that’s marked with the ‘error’ level (or worse),
            // and it will be transferred to Windows Azure storage – specifically the WADWindowsEventLogsTable
            diagConfig.WindowsEventLog.DataSources.Add("System!*");
            diagConfig.WindowsEventLog.DataSources.Add("Application!*");
            diagConfig.WindowsEventLog.ScheduledTransferLogLevelFilter = LogLevel.Error;
            diagConfig.WindowsEventLog.ScheduledTransferPeriod = transferPeriod;

            // indicate we’re interested in informational, warning, error, and critical messages recorded for our own role
            // as well as for the Windows Azure diagnostics itself.
            // That data will reside in WADLogsTable and WADDiagnosticInfrastructureLogsTable.
            diagConfig.Logs.ScheduledTransferLogLevelFilter = LogLevel.Information;
            diagConfig.Logs.ScheduledTransferPeriod = transferPeriod;

            // Performance counters
            diagConfig.PerformanceCounters.DataSources.Add(
                new PerformanceCounterConfiguration
                {
                    CounterSpecifier = @"\Processor(_Total)\% Processor Time",
                    SampleRate = transferPeriod
                });
            diagConfig.PerformanceCounters.DataSources.Add(
                new PerformanceCounterConfiguration
                {
                    CounterSpecifier = @"\Memory\Available Mbytes",
                    SampleRate = transferPeriod
                });
            diagConfig.PerformanceCounters.ScheduledTransferPeriod = transferPeriod;

            DiagnosticMonitor.Start("Microsoft.WindowsAzure.Plugins.Diagnostics.ConnectionString", diagConfig);

            // use Azure configuration as setting publisher
            CloudStorageAccount.SetConfigurationSettingPublisher((configName, configSetter) => configSetter(RoleEnvironment.GetConfigurationSettingValue(configName)));
        }

        public static string E(this string str, params object[] args)
        {
            return string.Format("{0:yyyy-MM-dd hh:mm:ss} - ERR: ", DateTime.Now)
                 + string.Format(str, args);
        }

        public static string W(this string str, params object[] args)
        {
            return string.Format("{0:yyyy-MM-dd hh:mm:ss} - WRN: ", DateTime.Now)
                 + string.Format(str, args);
        }

        public static string I(this string str, params object[] args)
        {
            return string.Format("{0:yyyy-MM-dd hh:mm:ss} - INF: ", DateTime.Now)
                 + string.Format(str, args);
        }

    }
}
