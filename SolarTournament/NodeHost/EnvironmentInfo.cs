using System;
using System.IO;

namespace NodeHost
{
    public static class EnvironmentInfo
    {
        public static string Node
        {
            get
            {
                string location1 = Environment.ExpandEnvironmentVariables(@"%PROGRAMFILES%\nodejs\node.exe");
                string location2 = Environment.ExpandEnvironmentVariables(@"%PROGRAMFILES(X86)%\nodejs\node.exe");

                if (File.Exists(location1)) { return location1; }

                if (File.Exists(location2)) { return location2; }

                throw new FileNotFoundException("FATAL ERROR. Node.exe was not found!");
            }
        }
    }
}
