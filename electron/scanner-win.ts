import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { app, nativeImage } from 'electron';
import { createLogger } from './lib/logger';
import type { CategorySource, ScannedApp, ScannedCategory } from './scanner';

const logger = createLogger('scanner-win');

/**
 * Windows 应用扫描模块。三路数据源合并 + 去重（按 exe 绝对路径）：
 *   1. 注册表 Uninstall 键（HKLM + HKCU，含 WOW6432Node）—— 最全，覆盖 MSI/EXE 安装
 *   2. 开始菜单 .lnk 快捷方式 —— 覆盖便携软件、DisplayIcon 缺失的场景
 *   3. 后续可扩展 UWP / Get-AppxPackage
 *
 * 图标提取一律走 Electron 内置 app.getFileIcon()，它直接调用 Windows Shell
 * API 拿到与 Explorer 完全一致的图标；无第三方 native 模块，跨版本稳定。
 *
 * 结果结构与 macOS scanner 完全一致（ScannedApp），主进程 / 前端零改动。
 */

const CATEGORY_COLORS: Record<ScannedCategory, string> = {
  'dev-tools': '#2563eb',
  design: '#a371f7',
  productivity: '#3b82f6',
  communication: '#22c55e',
  browsers: '#ef4444',
  utilities: '#8b949e',
  media: '#f97316',
  security: '#10b981',
};

// 按 exe 文件名与产品名的关键词做粗分类；命中不到就 default（utilities）
// 语义与 macOS bundleId 规则一致，避免双端展示差异。
const NAME_CATEGORY_RULES: [ScannedCategory, RegExp][] = [
  ['dev-tools', /(visual studio|vscode|code|jetbrains|idea|pycharm|webstorm|goland|clion|android studio|xcode|iterm|warp|hyper|terminal|git|github|sourcetree|postman|docker|node|python|sublime|atom|notepad\+\+|hbuilder|dbeaver|navicat|redis|mongodb|mysql workbench)/i],
  ['browsers', /(chrome|firefox|edge|safari|brave|opera|vivaldi|arc|360)/i],
  ['communication', /(wechat|微信|qq|tim|feishu|飞书|lark|slack|discord|zoom|teams|钉钉|dingtalk|telegram|whatsapp|skype|line)/i],
  ['media', /(spotify|vlc|iina|qq音乐|netease|网易云|音乐|music|potplayer|kmplayer|bilibili|哔哩|youtube|iqiyi|爱奇艺|优酷|腾讯视频)/i],
  ['productivity', /(office|word|excel|powerpoint|onenote|outlook|notion|obsidian|wps|typora|bear|things|todoist|ticktick|滴答|evernote|印象|xmind|mindnode|飞书文档|石墨)/i],
  ['design', /(photoshop|illustrator|figma|sketch|xd|premiere|after effects|indesign|lightroom|blender|autocad|3ds max|maya|zbrush|procreate|affinity|coreldraw)/i],
  ['security', /(1password|bitwarden|lastpass|keepass|nordvpn|expressvpn|tunnelbear|clash)/i],
];

function categorizeByName(name: string, publisher?: string): { category: ScannedCategory; source: CategorySource } {
  const haystack = `${name} ${publisher ?? ''}`;
  for (const [cat, re] of NAME_CATEGORY_RULES) {
    if (re.test(haystack)) return { category: cat, source: 'name' };
  }
  return { category: 'utilities', source: 'default' };
}

interface RegistryEntry {
  displayName: string;
  displayIcon?: string;
  installLocation?: string;
  publisher?: string;
  displayVersion?: string;
  installDate?: string;
  estimatedSize?: number;
  uninstallString?: string;
}

/**
 * 通过 PowerShell 一次性把 Uninstall 键读成 JSON。相比逐个 reg query
 * 大幅减少子进程开销，实测 300+ 条也在 2s 内完成。
 * 不使用 `native-reg` 之类 native 模块以规避 electron-rebuild 依赖。
 */
async function readUninstallRegistry(): Promise<RegistryEntry[]> {
  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    $paths = @(
      'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    $items = foreach ($p in $paths) {
      Get-ItemProperty $p 2>$null | Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName }
    }
    $items | ForEach-Object {
      [PSCustomObject]@{
        DisplayName     = $_.DisplayName
        DisplayIcon     = $_.DisplayIcon
        InstallLocation = $_.InstallLocation
        Publisher       = $_.Publisher
        DisplayVersion  = $_.DisplayVersion
        InstallDate     = $_.InstallDate
        EstimatedSize   = $_.EstimatedSize
        UninstallString = $_.UninstallString
      }
    } | ConvertTo-Json -Depth 3 -Compress
  `;
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')));
    child.on('error', (e) => {
      logger.error('powershell spawn failed:', e);
      resolve([]);
    });
    child.on('close', () => {
      if (err.trim()) logger.warn('powershell stderr:', err.slice(0, 300));
      const trimmed = out.trim();
      if (!trimmed) return resolve([]);
      try {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        resolve(
          arr.map((raw): RegistryEntry => ({
            displayName: String(raw.DisplayName ?? ''),
            displayIcon: raw.DisplayIcon ? String(raw.DisplayIcon) : undefined,
            installLocation: raw.InstallLocation ? String(raw.InstallLocation) : undefined,
            publisher: raw.Publisher ? String(raw.Publisher) : undefined,
            displayVersion: raw.DisplayVersion ? String(raw.DisplayVersion) : undefined,
            installDate: raw.InstallDate ? String(raw.InstallDate) : undefined,
            estimatedSize:
              typeof raw.EstimatedSize === 'number' ? Number(raw.EstimatedSize) : undefined,
            uninstallString: raw.UninstallString ? String(raw.UninstallString) : undefined,
          }))
        );
      } catch (e) {
        logger.error('powershell json parse failed:', e, trimmed.slice(0, 200));
        resolve([]);
      }
    });
  });
}

/**
 * 从 DisplayIcon / InstallLocation 猜到真正可执行的 exe 路径。
 * DisplayIcon 常见形态：
 *   "C:\\Program Files\\Foo\\foo.exe"
 *   "C:\\Program Files\\Foo\\foo.exe,0"（索引）
 *   "C:\\Program Files\\Foo\\resource.dll,-101"（资源引用，不能直接跑）
 */
async function resolveExePath(entry: RegistryEntry): Promise<string | null> {
  const candidate = (entry.displayIcon ?? '')
    .replace(/^"|"$/g, '')
    .replace(/,[-\d]+$/, '')
    .trim();
  if (candidate && candidate.toLowerCase().endsWith('.exe')) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // 继续下面的 fallback
    }
  }
  if (entry.installLocation) {
    const dir = entry.installLocation.replace(/^"|"$/g, '');
    try {
      const files = await fs.readdir(dir);
      // 优先与 DisplayName 相近的 exe
      const target = files.find(
        (f) =>
          f.toLowerCase().endsWith('.exe') &&
          entry.displayName
            .toLowerCase()
            .replace(/\s+/g, '')
            .includes(f.toLowerCase().replace('.exe', '').replace(/\s+/g, ''))
      );
      if (target) return path.join(dir, target);
      // 退化：找第一个非 uninstall 的 exe
      const any = files.find(
        (f) => f.toLowerCase().endsWith('.exe') && !/unins|uninstall|setup/i.test(f)
      );
      if (any) return path.join(dir, any);
    } catch {
      // ignore
    }
  }
  return null;
}

function iconCacheDir(): string {
  return path.join(app.getPath('userData'), 'icon-cache');
}

function iconCacheFileName(exePath: string, mtimeMs: number): string {
  const hash = crypto.createHash('sha1').update(exePath).digest('hex');
  return `${hash}-${Math.round(mtimeMs)}.png`;
}

/**
 * 用 Electron app.getFileIcon 抽取 Windows 应用图标为 PNG，
 * 结果缓存在 userData/icon-cache/ 下，避免每次扫描都重复调用 Shell API。
 */
async function extractIcon(exePath: string, mtimeMs: number): Promise<string | null> {
  try {
    const dir = iconCacheDir();
    await fs.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, iconCacheFileName(exePath, mtimeMs));
    try {
      await fs.access(outPath);
      return outPath;
    } catch {
      // not cached yet
    }
    const img = await app.getFileIcon(exePath, { size: 'large' });
    if (img.isEmpty()) return null;
    // 统一缩放到 128px，避免尺寸不一致导致前端 rendering 差异
    const resized = img.resize({ width: 128, height: 128, quality: 'good' });
    const png = resized.toPNG();
    if (!png || png.length === 0) return null;
    await fs.writeFile(outPath, png);
    return outPath;
  } catch (err) {
    logger.warn('extractIcon failed for', exePath, err);
    return null;
  }
}

function hashId(exePath: string): string {
  return crypto.createHash('sha1').update(exePath.toLowerCase()).digest('hex').slice(0, 24);
}

async function safeStat(p: string): Promise<{ mtimeMs: number; atime: Date; size: number } | null> {
  try {
    const s = await fs.stat(p);
    return { mtimeMs: s.mtimeMs, atime: s.atime, size: s.size };
  } catch {
    return null;
  }
}

async function collectFromRegistry(): Promise<ScannedApp[]> {
  const rows = await readUninstallRegistry();
  const seen = new Set<string>();
  const results: ScannedApp[] = [];

  for (const row of rows) {
    if (!row.displayName) continue;
    // 跳过明显是 Windows 更新 / 补丁 / SDK 的项
    if (/^(Update for |Security Update|Microsoft \.NET|Visual C\+\+|Windows SDK|Hotfix)/i.test(row.displayName)) {
      continue;
    }
    const exe = await resolveExePath(row);
    if (!exe) continue;
    const key = exe.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const stat = await safeStat(exe);
    if (!stat) continue;

    const { category, source } = categorizeByName(row.displayName, row.publisher);
    const iconCacheFile = (await extractIcon(exe, stat.mtimeMs)) ?? undefined;
    const id = hashId(exe);

    results.push({
      id,
      name: row.displayName.trim(),
      description: '',
      icon: 'AppWindow',
      iconCacheFile,
      category,
      categorySource: source,
      bundleId: undefined,
      version: row.displayVersion,
      publisher: row.publisher,
      size: row.estimatedSize ? row.estimatedSize * 1024 : stat.size,
      installDate: row.installDate,
      lastUsed: stat.atime.toISOString(),
      usageMinutes: 0,
      launchCount: 0,
      path: exe,
      color: CATEGORY_COLORS[category],
      tags: [],
    });
  }
  return results;
}

async function readShortcutTarget(lnkPath: string): Promise<string | null> {
  // 用 PowerShell WScript.Shell 解析 .lnk 目标；单次调用较慢，但 startmenu
  // 通常只有几十条，整体在秒级完成。
  return new Promise((resolve) => {
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $s = New-Object -ComObject WScript.Shell
      $t = $s.CreateShortcut('${lnkPath.replace(/'/g, "''")}').TargetPath
      if ($t) { Write-Output $t }
    `;
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    );
    let out = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const t = out.trim();
      resolve(t && t.toLowerCase().endsWith('.exe') ? t : null);
    });
  });
}

async function walkLnk(dir: string, depth = 0, acc: string[] = []): Promise<string[]> {
  if (depth > 3) return acc;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkLnk(p, depth + 1, acc);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.lnk')) acc.push(p);
  }
  return acc;
}

async function collectFromStartMenu(existing: Set<string>): Promise<ScannedApp[]> {
  const startMenus = [
    path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(
      process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs'
    ),
  ];
  const lnkFiles: string[] = [];
  for (const dir of startMenus) {
    await walkLnk(dir, 0, lnkFiles);
  }

  const results: ScannedApp[] = [];
  for (const lnk of lnkFiles) {
    const exe = await readShortcutTarget(lnk);
    if (!exe) continue;
    const key = exe.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);

    const stat = await safeStat(exe);
    if (!stat) continue;

    const displayName = path.basename(lnk, '.lnk');
    const { category, source } = categorizeByName(displayName);
    const iconCacheFile = (await extractIcon(exe, stat.mtimeMs)) ?? undefined;
    const id = hashId(exe);

    results.push({
      id,
      name: displayName,
      description: '',
      icon: 'AppWindow',
      iconCacheFile,
      category,
      categorySource: source,
      version: undefined,
      publisher: undefined,
      size: stat.size,
      lastUsed: stat.atime.toISOString(),
      usageMinutes: 0,
      launchCount: 0,
      path: exe,
      color: CATEGORY_COLORS[category],
      tags: [],
    });
  }
  return results;
}

/**
 * Windows 主扫描入口。合并注册表 + 快捷方式两路结果并去重（按 exe 路径）。
 * 与 macOS 的 scanInstalledApps 语义一致，返回可直接进 renderer 展示的 ScannedApp[]。
 */
export async function scanInstalledAppsWin(): Promise<ScannedApp[]> {
  if (process.platform !== 'win32') return [];
  try {
    const fromRegistry = await collectFromRegistry();
    const existing = new Set(fromRegistry.map((a) => a.path.toLowerCase()));
    const fromLnk = await collectFromStartMenu(existing);
    const all = [...fromRegistry, ...fromLnk];
    all.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    return all;
  } catch (err) {
    logger.error('scanInstalledAppsWin failed:', err);
    return [];
  }
}

/**
 * 由 preload 侧暴露的图标提取（Windows 端 IPC 需要按 path 现取时使用）。
 * 目前只有 scanInstalledAppsWin 内部使用，导出留给后续窗口激活模块复用。
 */
export async function getFileIconAsPng(exePath: string): Promise<string | null> {
  try {
    const stat = await safeStat(exePath);
    if (!stat) return null;
    return await extractIcon(exePath, stat.mtimeMs);
  } catch {
    return null;
  }
}

// 便于 debug 时打印图标路径 & 校验
export const __internal = { extractIcon, resolveExePath, readUninstallRegistry };

// 显式引用 nativeImage 保证 tree-shake 后仍走 Electron 图标 API
void nativeImage;
