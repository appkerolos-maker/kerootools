
$html = [Convert]::ToBase64String([IO.File]::ReadAllBytes("index.html"))
$js = [Convert]::ToBase64String([IO.File]::ReadAllBytes("app.js"))
$css = [Convert]::ToBase64String([IO.File]::ReadAllBytes("styles.css"))

$iconPath = "app.ico"
$iconFlag = ""
if (Test-Path $iconPath) {
    $iconFlag = "/win32icon:`"$iconPath`""
}

$template = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Threading;

namespace KiroApp
{
    static class Program
    {
        [DllImport("user32.dll", SetLastError = true)]
        static extern int SetWindowText(IntPtr hWnd, string lpString);

        [DllImport("user32.dll")]
        static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("shell32.dll", SetLastError = true)]
        static extern void SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

        [STAThread]
        static void Main()
        {
            // Give the app a unique ID so Windows doesn't group it with Edge
            SetCurrentProcessExplicitAppUserModelID("Kiro.Tech.Software.System.2026");

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string tempDir = Path.Combine(Path.GetTempPath(), "KeroApp_Final");
            if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);

            File.WriteAllBytes(Path.Combine(tempDir, "index.html"), Convert.FromBase64String("$html"));
            File.WriteAllBytes(Path.Combine(tempDir, "app.js"), Convert.FromBase64String("$js"));
            File.WriteAllBytes(Path.Combine(tempDir, "styles.css"), Convert.FromBase64String("$css"));
            
            string indexPath = Path.Combine(tempDir, "index.html");
            string edgePath = FindEdgePath();

            if (string.IsNullOrEmpty(edgePath))
            {
                MessageBox.Show("يتطلب النظام متصفح Microsoft Edge.", "خطأ", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = edgePath,
                Arguments = "--app=\"" + new Uri(indexPath).AbsoluteUri + "\" " +
                            "--user-data-dir=\"" + Path.Combine(tempDir, "AppData") + "\" " +
                            "--window-name=\"نظام كيرو للأدوات الصحية\" " +
                            "--no-first-run",
                WindowStyle = ProcessWindowStyle.Maximized
            };

            Process edgeProcess = Process.Start(startInfo);
            
            // Optional: Try to re-title the window after it opens to ensure it looks official
            Thread.Sleep(2000); 
            // The title is already set via --app and index.html <title>, 
            // and the unique user-data-dir ensures it gets its own taskbar slot.
        }

        static string FindEdgePath()
        {
            string[] paths = {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
                "msedge.exe"
            };
            foreach (var p in paths) if (p == "msedge.exe" || File.Exists(p)) return p;
            return null;
        }
    }
}
"@

$template | Out-File -FilePath "SingleFileLauncher.cs" -Encoding UTF8

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$cmdArgs = @("/target:winexe", "/out:Kero_System_Setup.exe")
if ($iconFlag) { $cmdArgs += $iconFlag }
$cmdArgs += "SingleFileLauncher.cs"

& $csc $cmdArgs
Write-Host "Build Complete: Kero_System_Setup.exe"
