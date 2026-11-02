import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Windows 前台窗口探测脚本：GetForegroundWindow → GetWindowThreadProcessId →
 * Get-Process 取进程 Path，向 stdout 输出一行 JSON：{"path":"C:\\...exe"}；
 * 无前台窗口 / 进程已退出 / 路径不可读（如受保护进程）时输出 null。
 *
 * P/Invoke 模式与 window-locator.ts 的 FOCUS_WIN_SCRIPT_TEMPLATE 一致。
 * 注意：$PID 是 PowerShell 保留只读变量，进程 id 必须使用其它变量名（$procId），
 * 赋值给 $pid 会直接抛错导致脚本无输出。
 */
export const FRONTMOST_WIN_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Namespace SoftDeskMonitor -Name Win32 -MemberDefinition @"
    [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
    [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr hWnd, out int lpdwProcessId);
"@
$h = [SoftDeskMonitor.Win32]::GetForegroundWindow()
if ($h -eq [System.IntPtr]::Zero) { Write-Output 'null'; exit 0 }
$procId = 0
[void][SoftDeskMonitor.Win32]::GetWindowThreadProcessId($h, [ref]$procId)
if ($procId -eq 0) { Write-Output 'null'; exit 0 }
$p = Get-Process -Id $procId
if (-not $p -or -not $p.Path) { Write-Output 'null'; exit 0 }
@{ path = $p.Path } | ConvertTo-Json -Compress
`;

/**
 * 解析探测脚本 stdout：
 * - {"path":"..."} → exe 绝对路径
 * - null / path 为空 → null（无前台应用，调用方应结束当前会话）
 * - 空输出 / 非 JSON → undefined（查询失败，调用方应保持现状）
 */
export function parseWinFrontmostOutput(stdout: string): string | null | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const p = (parsed as { path?: unknown }).path;
  if (typeof p !== 'string' || p.length === 0) return null;
  return p;
}

/**
 * Windows：返回前台窗口所属进程的 exe 绝对路径。
 * 三态语义与 monitor.getFrontmostApp 对齐：
 * string = 前台应用；null = 无前台应用/不可解析；undefined = 探测失败（保持现状）。
 */
export async function getForegroundExePathWin(): Promise<string | null | undefined> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', FRONTMOST_WIN_SCRIPT],
      { windowsHide: true, timeout: 4000 }
    );
    return parseWinFrontmostOutput(stdout);
  } catch {
    // spawn 失败/超时：与 macOS 侧 lsappinfo 失败语义一致——保持当前会话，等下一轮
    return undefined;
  }
}
