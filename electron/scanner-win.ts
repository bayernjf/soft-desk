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
  // 强制 PowerShell 用 UTF-8 输出,否则中文系统下(默认 CP936/GBK)通过
  // stdout 传回来的 DisplayName 里的中文会被 Node 的 utf8 解码替换成 U+FFFD,
  // 造成"百度网盘"等应用名显示为 �������。
  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
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
 * 从 DisplayIcon / InstallLocation 猜到真正可执行的 exe 路径,以及对应的图标源路径。
 *
 * Windows 注册表里的 DisplayIcon 常见形态:
 *   "C:\Program Files\Foo\foo.exe"                              —— 直接 exe
 *   "C:\Program Files\Foo\foo.exe,0"                            —— exe + icon index
 *   "%SystemRoot%\system32\Taskmgr.exe,0"                      —— 含环境变量
 *   "C:\Program Files\Foo\foo.ico"                              —— 独立 ico 文件
 *   "C:\Program Files\Microsoft Office\root\vfs\Windows\Installer\{9016...}\WORDICON.EXE,1"
 *                                                               —— Office 的 stub,图标在资源索引 1
 *   "C:\Windows\System32\imageres.dll,-102"                    —— 资源 DLL,负数表示 icon id
 *
 * 我们返回:
 *   - launchExe:用于启动/去重/stat 的真实 exe(如果找不到就返回 null,此条丢弃)
 *   - iconSource:用于提取图标的文件路径(可能是 exe/dll/ico/stub);
 *                为 null 表示回退到 launchExe 自身。
 */
export interface ResolveResult {
  launchExe: string;
  iconSource?: string | null;
}

/**
 * 展开 Windows 风格环境变量 %VAR%。未设置的变量保留原样(后续会被 fs.access 判为不存在)。
 */
function expandEnvVars(p: string): string {
  if (!p.includes('%')) return p;
  return p.replace(/%([^%]+)%/g, (_m, name: string) => process.env[name] ?? `%${name}%`);
}

/**
 * 把 DisplayIcon 字段拆成 (filePath, iconIndex)。
 * 注意:仅切最后一个英文逗号后的数字(正负均可),不做过多假设,因为路径本身可能含逗号的情况极罕见。
 */
function parseIconSpec(raw: string): { file: string; index: number | null } {
  const trimmed = raw.trim().replace(/^"|"$/g, '');
  const m = trimmed.match(/^(.+?),([-]?\d+)$/);
  if (m) return { file: m[1].trim(), index: parseInt(m[2], 10) };
  return { file: trimmed, index: null };
}

const NON_MAIN_EXE_PATTERN =
  /(unins|uninstall|setup|update|updater|crash|helper|install|repair|setup_?ui|vcredist|c2r|clicktorun|officeclicktorun|integratedoffice|appvshnotify|squirrel|elevate|launcher|tray|notification|win32calc)$/i;

/**
 * 规范化可执行名用于模糊匹配:去掉版本/位数/发行商后缀,小写。
 * e.g. "WINWORD.EXE" -> "winword"; "Trae CN (User).exe" -> "traecnuser"
 */
function normalizeExeBase(basename: string): string {
  return basename
    .toLowerCase()
    .replace(/\.exe$/, '')
    .replace(/[\s_\-.()[\]{}]+/g, '')
    .replace(/(x64|x86|ia64|amd64|arm64|win32|win64|64bit|32bit|user|portable)$/g, '');
}

/**
 * 计算 displayName 与一个 exe 文件名的相似度分数(0~1)。
 * 双向子串包含即可给分:完全包含给 1,部分字符重叠给较低分。
 */
function nameMatchScore(displayName: string, exeBasename: string): number {
  const dn = normalizeExeBase(displayName);
  const en = normalizeExeBase(exeBasename);
  if (!dn || !en) return 0;
  if (dn === en) return 1;
  if (en.includes(dn) || dn.includes(en)) {
    // 长度越接近分数越高,避免 "setup.exe" 之类被误中
    const ratio = Math.min(dn.length, en.length) / Math.max(dn.length, en.length);
    return 0.6 + 0.4 * ratio;
  }
  // 字符交集粗算
  let hit = 0;
  for (const ch of en) if (dn.includes(ch)) hit++;
  return (hit / en.length) * 0.3;
}

async function resolveExePath(entry: RegistryEntry): Promise<ResolveResult | null> {
  // 1) 优先用 DisplayIcon 字段 —— 同时也可作为图标源
  let iconFromDisplay: string | null = null;
  if (entry.displayIcon) {
    const parsed = parseIconSpec(expandEnvVars(entry.displayIcon));
    if (parsed.file) {
      try {
        await fs.access(parsed.file);
        const lower = parsed.file.toLowerCase();
        if (lower.endsWith('.exe')) {
          // 检查一下是不是主程序(过滤卸载器等)
          const base = path.basename(parsed.file);
          if (!NON_MAIN_EXE_PATTERN.test(base)) {
            return { launchExe: parsed.file, iconSource: null };
          }
          // 如果是 uninstaller/setup 之类,不能作为主程序,但该文件可能也含图标,
          // 比如 Office 的 WORDICON.EXE 就是图标容器,后面会被当作 iconSource 回写到结果
          iconFromDisplay = parsed.file;
        } else if (lower.endsWith('.ico') || lower.endsWith('.dll')) {
          // ico / dll 不能启动,但可以作为图标源
          iconFromDisplay = parsed.file;
        }
      } catch {
        // DisplayIcon 指向的文件不存在,继续 fallback
      }
    }
  }

  // 2) 在 InstallLocation 里找主 exe
  let installDir: string | null = null;
  if (entry.installLocation) {
    const dir = expandEnvVars(entry.installLocation).replace(/^"|"$/g, '').trim();
    try {
      const st = await fs.stat(dir);
      if (st.isDirectory()) installDir = dir;
    } catch {
      // ignore
    }
  }
  // 若 UninstallString 含路径,也可从中反推安装目录(某些软件不写 InstallLocation)
  if (!installDir && entry.uninstallString) {
    const { file } = parseIconSpec(expandEnvVars(entry.uninstallString));
    if (file) {
      const dir = path.dirname(file);
      try {
        const st = await fs.stat(dir);
        if (st.isDirectory()) installDir = dir;
      } catch {
        // ignore
      }
    }
  }

  if (installDir) {
    // 递归收集所有 exe(最多到 depth=3,避免进入 node_modules 之类)
    const allExes: string[] = [];
    const walk = async (dir: string, depth: number) => {
      if (depth > 3) return;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          // 跳过明显无关目录
          if (/^(unins|uninstall|resources?|locales?|plugins?|addons?|node_modules|__pycache__|redist|vc_redist)$/i.test(e.name)) continue;
          await walk(p, depth + 1);
        } else if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
          allExes.push(p);
        }
      }
    };
    await walk(installDir, 0);

    // 按"非主程序"黑名单过滤,再按与 DisplayName 的相似度排序
    const candidates = allExes
      .filter((f) => !NON_MAIN_EXE_PATTERN.test(path.basename(f)))
      .map((f) => ({ file: f, score: nameMatchScore(entry.displayName, path.basename(f)) }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0 && candidates[0].score > 0.3) {
      return { launchExe: candidates[0].file, iconSource: iconFromDisplay ?? null };
    }
    // 没命中名字,退化到第一个非 uninstaller 的 exe(通常在安装根目录)
    const any = allExes.find((f) => !NON_MAIN_EXE_PATTERN.test(path.basename(f)));
    if (any) return { launchExe: any, iconSource: iconFromDisplay ?? null };
  }

  // 3) 最后兜底:如果 DisplayIcon 给了一个 .exe 但被 NON_MAIN 过滤掉了(如 Office stub),
  // 仍返回它作为 launchExe——启动可能失败,但至少能在列表里出现并显示图标;
  // 否则完全无法定位,此条丢弃。
  if (iconFromDisplay && iconFromDisplay.toLowerCase().endsWith('.exe')) {
    return { launchExe: iconFromDisplay, iconSource: null };
  }
  return null;
}

function iconCacheDir(): string {
  return path.join(app.getPath('userData'), 'icon-cache');
}

/**
 * 缓存 key 需要把 iconSource 也纳入 hash:同一个 exe 的文件系统 mtime 不变,
 * 但 DisplayIcon 指向的 .ico/.dll 可能更新,或者我们改了匹配策略,
 * 仅以 exePath+mtime 为 key 会复用旧图标。把两者拼起来 hash 即可。
 */
function iconCacheFileName(exePath: string, mtimeMs: number, iconSource?: string | null): string {
  const raw = iconSource ? `${exePath}|${iconSource}` : exePath;
  const hash = crypto.createHash('sha1').update(raw).digest('hex');
  return `${hash}-${Math.round(mtimeMs)}.png`;
}

/**
 * 用 Electron app.getFileIcon 抽取 Windows 应用图标为 PNG,
 * 结果缓存在 userData/icon-cache/ 下,避免每次扫描都重复调用 Shell API。
 *
 * iconSource 优先于 launchExe:当注册表/快捷方式给出专门的 .ico/.dll/stub exe 时,
 * 用它作为图标源;否则退回到 launchExe 自身。
 *
 * 对 .ico 文件:Electron 的 nativeImage 可以直接读取 ICO 格式(多尺寸),
 * 比 getFileIcon 更精准(后者对 .ico 也能用,但 .ico 直接解码更可靠)。
 */
async function extractIcon(
  launchExe: string,
  mtimeMs: number,
  iconSource?: string | null,
): Promise<string | null> {
  try {
    const dir = iconCacheDir();
    await fs.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, iconCacheFileName(launchExe, mtimeMs, iconSource));
    try {
      await fs.access(outPath);
      return outPath;
    } catch {
      // not cached yet
    }

    // 优先使用 iconSource 取图标
    const sourceCandidates: Array<{ file: string; isIco: boolean }> = [];
    if (iconSource) {
      try {
        await fs.access(iconSource);
        const lower = iconSource.toLowerCase();
        sourceCandidates.push({ file: iconSource, isIco: lower.endsWith('.ico') });
      } catch {
        // iconSource 失效,回退到 exe
      }
    }
    sourceCandidates.push({ file: launchExe, isIco: false });

    for (let i = 0; i < sourceCandidates.length; i++) {
      const { file, isIco } = sourceCandidates[i];
      const isLast = i === sourceCandidates.length - 1;
      try {
        let img: Electron.NativeImage;
        if (isIco) {
          const buf = await fs.readFile(file);
          img = nativeImage.createFromBuffer(buf);
        } else {
          img = await app.getFileIcon(file, { size: 'large' });
        }
        if (img.isEmpty()) {
          if (isLast) return null;
          continue;
        }
        const resized = img.resize({ width: 128, height: 128, quality: 'good' });
        const png = resized.toPNG();
        if (!png || png.length === 0) {
          if (isLast) return null;
          continue;
        }
        // 对非主候选(iconSource),若取到的是过小的"默认占位图"(<5KB,基本是
        // Windows 给未知 EXE/DLL 返回的通用蓝白图),跳过继续尝试 launchExe 自身。
        // 主候选(launchExe)即使小也保留,避免完全无图。
        if (!isLast && png.length < 5 * 1024) continue;
        await fs.writeFile(outPath, png);
        return outPath;
      } catch (err) {
        logger.warn('extractIcon candidate failed for', file, err);
        if (isLast) return null;
      }
    }
    return null;
  } catch (err) {
    logger.warn('extractIcon failed for', launchExe, err);
    return null;
  }
}

/**
 * 把缓存的图标 PNG 读成 base64 data URL。渲染层 <AppIcon> 只识别
 * data:image / file:// 开头的 icon 字段,dev 模式又无法直接加载 file://,
 * 因此这里必须把 PNG inline 成 data URL,否则前端会退化到首字母占位。
 */
async function iconFileToDataUrl(iconCacheFile: string | null): Promise<string | null> {
  if (!iconCacheFile) return null;
  try {
    const buf = await fs.readFile(iconCacheFile);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
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
    // 跳过明显是 Windows 更新 / 补丁 / SDK / 运行库 / 语言包的项
    if (/^(Update for |Security Update|Microsoft \.NET|Visual C\+\+|Windows SDK|Hotfix|KB\d+|Language Pack for|Proofing Tools)/i.test(row.displayName)) {
      continue;
    }
    const resolved = await resolveExePath(row);
    if (!resolved) continue;
    const exe = resolved.launchExe;
    const key = exe.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const stat = await safeStat(exe);
    if (!stat) continue;

    // iconSource 的 mtime 若能拿到,用来参与缓存 key(虽然我们用 launchExe mtime
    // 为主,但 iconSource 更新时应当失效;这里简单地用两者 mtime 的最大值参与缓存)
    let iconStatMtime: number | null = null;
    if (resolved.iconSource) {
      const is = await safeStat(resolved.iconSource);
      if (is) iconStatMtime = is.mtimeMs;
    }
    const cacheBump = iconStatMtime ? Math.max(stat.mtimeMs, iconStatMtime) : stat.mtimeMs;

    const { category, source } = categorizeByName(row.displayName, row.publisher);
    const iconCacheFile =
      (await extractIcon(exe, cacheBump, resolved.iconSource)) ?? undefined;
    const iconDataUrl = (await iconFileToDataUrl(iconCacheFile ?? null)) ?? 'AppWindow';
    const id = hashId(exe);

    results.push({
      id,
      name: row.displayName.trim(),
      description: '',
      icon: iconDataUrl,
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

interface ShortcutResolve {
  target: string;
  iconSource?: string | null;
}

async function readShortcutTarget(lnkPath: string): Promise<ShortcutResolve | null> {
  // 用 PowerShell WScript.Shell 解析 .lnk 的 TargetPath 与 IconLocation。
  // IconLocation 通常形如 "C:\...\xxx.exe,0" / "C:\...\xxx.ico,0",是桌面显示的真实图标源。
  // 单次调用较慢,但开始菜单通常只有几十条,整体在秒级完成。
  return new Promise((resolve) => {
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $OutputEncoding = [System.Text.Encoding]::UTF8
      $s = New-Object -ComObject WScript.Shell
      $sc = $s.CreateShortcut('${lnkPath.replace(/'/g, "''")}')
      $t = $sc.TargetPath
      $i = $sc.IconLocation
      if ($t -or $i) {
        Write-Output "TARGET=$t"
        Write-Output "ICON=$i"
      }
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
      const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let target = '';
      let iconRaw = '';
      for (const line of lines) {
        if (line.startsWith('TARGET=')) target = line.slice(7);
        else if (line.startsWith('ICON=')) iconRaw = line.slice(5);
      }
      if (target && !target.toLowerCase().endsWith('.exe')) target = '';
      // IconLocation 形如 "path,index";仅取路径部分,再展开环境变量
      let iconSource: string | null = null;
      if (iconRaw) {
        const parsed = parseIconSpec(expandEnvVars(iconRaw));
        if (parsed.file && /\.(exe|dll|ico)$/i.test(parsed.file)) {
          iconSource = parsed.file;
        }
      }
      if (!target && !iconSource) return resolve(null);
      if (!target) return resolve(null); // 没有目标 exe 无法作为条目
      // 展开 target 里可能的环境变量
      const resolved = expandEnvVars(target);
      resolve({ target: resolved, iconSource });
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
    const resolved = await readShortcutTarget(lnk);
    if (!resolved) continue;
    const exe = resolved.target;
    const key = exe.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);

    const stat = await safeStat(exe);
    if (!stat) continue;

    // 校验一下 iconSource 文件确实存在
    let iconSource: string | null = null;
    let iconStatMtime: number | null = null;
    if (resolved.iconSource) {
      const is = await safeStat(resolved.iconSource);
      if (is) {
        iconSource = resolved.iconSource;
        iconStatMtime = is.mtimeMs;
      }
    }
    const cacheBump = iconStatMtime ? Math.max(stat.mtimeMs, iconStatMtime) : stat.mtimeMs;

    // 跳过明显是卸载器/帮助文档的快捷方式
    const displayName = path.basename(lnk, '.lnk');
    if (/(uninstall|卸载|remove|删除|help|readme|license|what'?s new|release notes|website|官网|documentation|documentation)/i.test(displayName)) {
      continue;
    }

    const { category, source } = categorizeByName(displayName);
    const iconCacheFile =
      (await extractIcon(exe, cacheBump, iconSource)) ?? undefined;
    const iconDataUrl = (await iconFileToDataUrl(iconCacheFile ?? null)) ?? 'AppWindow';
    const id = hashId(exe);

    results.push({
      id,
      name: displayName,
      description: '',
      icon: iconDataUrl,
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
 * 追加一批"肯定存在于 Windows 上"的系统工具到扫描结果。
 * 这些工具在注册表里往往不写 DisplayIcon 或 InstallLocation,靠上面的逻辑容易漏掉或取错图标,
 * 这里硬编码以确保 Task Manager / 记事本 / 计算器 / 控制面板等常见工具显示正常。
 */
async function collectWellKnownSystemApps(existing: Set<string>): Promise<ScannedApp[]> {
  const sysRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows';
  const sysNative = path.join(sysRoot, 'System32');
  // 64 位系统上 32 位进程看 System32 是重定向的,但 Electron 一般是 64 位;保持简单直接用 System32。
  const known: Array<{ name: string; exe: string; category: ScannedCategory; publisher?: string }> = [
    { name: 'Task Manager', exe: path.join(sysNative, 'Taskmgr.exe'), category: 'utilities' },
    { name: '记事本', exe: path.join(sysNative, 'notepad.exe'), category: 'productivity' },
    { name: '计算器', exe: path.join(sysNative, 'calc.exe'), category: 'utilities' },
    { name: '命令提示符', exe: path.join(sysNative, 'cmd.exe'), category: 'dev-tools' },
    { name: 'Windows PowerShell', exe: path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), category: 'dev-tools' },
    { name: '注册表编辑器', exe: path.join(sysNative, 'regedit.exe'), category: 'utilities' },
    { name: '文件资源管理器', exe: path.join(sysNative, 'explorer.exe'), category: 'utilities' },
    { name: '控制面板', exe: path.join(sysNative, 'control.exe'), category: 'utilities' },
    { name: '设置', exe: path.join(sysNative, 'SystemSettings.exe'), category: 'utilities' },
    { name: '截图工具', exe: path.join(sysNative, 'SnippingTool.exe'), category: 'utilities' },
  ];

  const results: ScannedApp[] = [];
  for (const item of known) {
    const key = item.exe.toLowerCase();
    if (existing.has(key)) continue;
    const stat = await safeStat(item.exe);
    if (!stat) continue;
    existing.add(key);
    const iconCacheFile = (await extractIcon(item.exe, stat.mtimeMs)) ?? undefined;
    const iconDataUrl = (await iconFileToDataUrl(iconCacheFile ?? null)) ?? 'AppWindow';
    results.push({
      id: hashId(item.exe),
      name: item.name,
      description: '',
      icon: iconDataUrl,
      iconCacheFile,
      category: item.category,
      categorySource: 'name',
      version: undefined,
      publisher: 'Microsoft',
      size: stat.size,
      lastUsed: stat.atime.toISOString(),
      usageMinutes: 0,
      launchCount: 0,
      path: item.exe,
      color: CATEGORY_COLORS[item.category],
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
    const fromKnown = await collectWellKnownSystemApps(existing);
    const all = [...fromRegistry, ...fromLnk, ...fromKnown];
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
