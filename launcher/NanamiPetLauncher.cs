using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class NanamiPetLauncher
{
    [STAThread]
    private static int Main()
    {
        var projectRoot = AppDomain.CurrentDomain.BaseDirectory;
        var electronPath = Path.Combine(projectRoot, "node_modules", "electron", "dist", "electron.exe");
        var packagePath = Path.Combine(projectRoot, "package.json");

        if (!File.Exists(electronPath) || !File.Exists(packagePath))
        {
            MessageBox.Show(
                "找不到桌宠运行文件。请将 Nanami Pet.exe 保留在 nanami-pet 项目根目录，并先执行 npm ci。",
                "Nanami Pet",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = electronPath,
                Arguments = ".",
                WorkingDirectory = projectRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "无法启动桌宠：\n" + error.Message,
                "Nanami Pet",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }
}
