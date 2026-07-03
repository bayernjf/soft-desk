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
 * 通过 Win32 ExtractIconEx 从 exe/dll/ico/icon-container 精确抽取指定 index 的图标,
 * 返回 PNG 的 base64。用于 DisplayIcon/IconLocation 带 ,index 后缀时
 * (Office WORDICON.EXE,1 / imageres.dll,-102 等) —— Electron 的 app.getFileIcon
 * 不支持索引,只能拿到 0 号资源(对 icon-container 往往是默认文档图标)。
 *
 * 约定:
 *   - 脚本往 stdout 输出一行 JSON:{"ok":true,"b64":"iVBOR..."} 或 {"ok":false,"err":"..."}
 *   - 负数 index 按资源 ID(IDI_*) 抽取,ExtractIconExW 的 nIconIndex 规则直接支持
 *   - 内部要求"大图标"(SHGFI_LARGEICON 等价于 GetSystemMetrics(SM_CXICON) 通常 32px),
 *     返回后会在 Node 侧 resize 到 128px 对齐 macOS 端尺寸
 */
const EXTRACT_ICON_PS = `
param([string]$File, [int]$Index)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
if (-not ('Win32.IconExtractor' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Win32IconExtractor {
  [DllImport("shell32.dll", CharSet = CharSet.Auto)]
  public static extern int ExtractIconEx(string lpszFile, int nIconIndex, IntPtr[] phiconLarge, IntPtr[] phiconSmall, uint nIcons);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
'@
}
function Fail([string]$msg) {
  Write-Output ('{"ok":false,"err":' + (ConvertTo-Json $msg) + '}')
  exit 0
}
if (-not (Test-Path $File)) { Fail "file not found: $File"; exit 0 }
$large = [IntPtr[]]::new(1)
$small = [IntPtr[]]::new(1)
$count = [Win32IconExtractor]::ExtractIconEx($File, $Index, $large, $small, 1)
if ($count -le 0 -or $large[0] -eq [IntPtr]::Zero) {
  # 某些 dll 负数索引走 ExtractIcon 取
  if ($small[0] -ne [IntPtr]::Zero) { [Win32IconExtractor]::DestroyIcon($small[0]) }
  Fail "no icon at index $Index in $File"
  exit 0
}
try {
  $hIcon = $large[0]
  $icon = [System.Drawing.Icon]::FromHandle($hIcon)
  $bmp = $icon.ToBitmap()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $b64 = [Convert]::ToBase64String($bytes)
  Write-Output ('{"ok":true,"b64":"' + $b64 + '"}')
  $ms.Dispose()
  $bmp.Dispose()
  $icon.Dispose()
} catch {
  Fail $_.Exception.Message
} finally {
  if ($large[0] -ne [IntPtr]::Zero) { [Win32IconExtractor]::DestroyIcon($large[0]) }
  if ($small[0] -ne [IntPtr]::Zero) { [Win32IconExtractor]::DestroyIcon($small[0]) }
}
`;

interface ExtractResult {
  ok: boolean;
  b64?: string;
  err?: string;
}

/**
 * 用 PS+Win32 ExtractIconEx 精确抽指定 index 的图标,返回 PNG Buffer。失败返回 null。
 */
async function extractIconByIndex(file: string, index: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    try {
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy', 'Bypass',
          '-Command', EXTRACT_ICON_PS,
          '-File', file,
          '-Index', String(index),
        ],
        { windowsHide: true }
      );
      let out = '';
      let err = '';
      child.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
      child.stderr.on('data', (c: Buffer) => (err += c.toString('utf8')));
      child.on('error', () => resolve(null));
      child.on('close', () => {
        const line = out.trim().split(/\r?\n/).pop() ?? '';
        try {
          const json = JSON.parse(line) as ExtractResult;
          if (json.ok && json.b64) {
            resolve(Buffer.from(json.b64, 'base64'));
          } else {
            if (err.trim()) logger.warn('extractIconByIndex err:', err.slice(0, 200));
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
      // 保险:10s 超时
      setTimeout(() => {
        try { child.kill(); } catch { /* noop */ }
        resolve(null);
      }, 10000).unref();
    } catch (e) {
      logger.warn('extractIconByIndex spawn failed:', e);
      resolve(null);
    }
  });
}

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

/**
 * 跨平台 bundleId 映射表。
 *
 * Mac 端扫描出的软件 id 通常是 CFBundleIdentifier(反域名 bundleId,
 * 如 com.google.Chrome),而 Windows 端的 id 是 sha1(exe 绝对路径)。
 * 若不做对齐,云端收藏/工作流/径向菜单同步到 Windows 后会因 id 不匹配全部灰显为"未安装"。
 *
 * 这里通过"exe basename(归一化) → publisher 关键字 + bundleId"的规则,
 * 为常见跨平台软件在 Windows 扫描结果上填充一个与 Mac 端一致的伪 bundleId。
 * 后续渲染层会优先用 bundleId 做跨设备匹配,见 software.service 的 matchSoftwareByAnyId。
 *
 * 判定规则:basename 完全匹配归一化 exe 名,且 publisher(注册表 Publisher 字段)
 * 命中给定关键字之一;publisher 为空数组表示不校验 publisher(用于发行商名字极稳定的场景)。
 */
interface CrossPlatformRule {
  /** 归一化后的 exe basename(不含 .exe,全部小写,已去空格/版本/位数后缀) */
  exeBase: string;
  /** publisher 字段需包含的关键字(小写匹配),任一命中即可;空数组表示不校验 */
  publisherKeywords: string[];
  /** 与 Mac 端对齐的 bundleId */
  bundleId: string;
}

const CROSS_PLATFORM_RULES: CrossPlatformRule[] = [
  // 浏览器
  { exeBase: 'chrome', publisherKeywords: ['google'], bundleId: 'com.google.Chrome' },
  { exeBase: 'firefox', publisherKeywords: ['mozilla'], bundleId: 'org.mozilla.firefox' },
  { exeBase: 'msedge', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.edgemac' },
  { exeBase: 'brave', publisherKeywords: ['brave'], bundleId: 'com.brave.Browser' },
  { exeBase: 'opera', publisherKeywords: ['opera'], bundleId: 'com.operasoftware.Opera' },
  { exeBase: 'vivaldi', publisherKeywords: ['vivaldi'], bundleId: 'com.vivaldi.Vivaldi' },
  { exeBase: 'arc', publisherKeywords: ['browser company'], bundleId: 'company.thebrowser.Browser' },
  { exeBase: '360se', publisherKeywords: ['360'], bundleId: 'com.qihoo.360se' },
  { exeBase: '360chrome', publisherKeywords: ['360'], bundleId: 'com.qihoo.360chrome' },

  // 通信
  { exeBase: 'wechat', publisherKeywords: ['tencent'], bundleId: 'com.tencent.xinWeChat' },
  { exeBase: 'wechatapp', publisherKeywords: ['tencent'], bundleId: 'com.tencent.xinWeChat' },
  { exeBase: 'qq', publisherKeywords: ['tencent'], bundleId: 'com.tencent.qq' },
  { exeBase: 'tim', publisherKeywords: ['tencent'], bundleId: 'com.tencent.tim' },
  { exeBase: 'feishu', publisherKeywords: ['bytedance', 'feishu', 'lark'], bundleId: 'com.bytedance.feishu' },
  { exeBase: 'lark', publisherKeywords: ['bytedance', 'feishu', 'lark'], bundleId: 'com.bytedance.lark' },
  { exeBase: 'slack', publisherKeywords: ['slack'], bundleId: 'com.tinyspeck.slackmacgap' },
  { exeBase: 'discord', publisherKeywords: ['discord'], bundleId: 'com.hnc.Discord' },
  { exeBase: 'zoom', publisherKeywords: ['zoom'], bundleId: 'us.zoom.xos' },
  { exeBase: 'teams', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.teams' },
  { exeBase: 'dingtalk', publisherKeywords: ['alibaba', 'dingtalk'], bundleId: 'com.alibaba.dingtalk' },
  { exeBase: 'telegram', publisherKeywords: ['telegram'], bundleId: 'ru.keepcoder.Telegram' },
  { exeBase: 'whatsapp', publisherKeywords: ['whatsapp'], bundleId: 'net.whatsapp.WhatsApp' },
  { exeBase: 'skype', publisherKeywords: ['microsoft', 'skype'], bundleId: 'com.skype.skype' },
  { exeBase: 'line', publisherKeywords: ['line'], bundleId: 'jp.naver.line.mac' },

  // 开发工具
  { exeBase: 'code', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.VSCode' },
  { exeBase: 'vscode', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.VSCode' },
  { exeBase: 'devenv', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.visual-studio' },
  { exeBase: 'idea', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.intellij' },
  { exeBase: 'idea64', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.intellij' },
  { exeBase: 'pycharm', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.pycharm' },
  { exeBase: 'pycharm64', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.pycharm' },
  { exeBase: 'webstorm', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.webstorm' },
  { exeBase: 'webstorm64', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.webstorm' },
  { exeBase: 'goland', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.goland' },
  { exeBase: 'goland64', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.goland' },
  { exeBase: 'clion', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.clion' },
  { exeBase: 'clion64', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.clion' },
  { exeBase: 'rider64', publisherKeywords: ['jetbrains'], bundleId: 'com.jetbrains.rider' },
  { exeBase: 'studio64', publisherKeywords: ['google'], bundleId: 'com.google.android.studio' },
  { exeBase: 'iterm2', publisherKeywords: [], bundleId: 'com.googlecode.iterm2' },
  { exeBase: 'warp', publisherKeywords: ['warp'], bundleId: 'dev.warp.Warp-Stable' },
  { exeBase: 'hyper', publisherKeywords: ['zeit', 'vercel', 'hyper'], bundleId: 'co.zeit.hyper' },
  { exeBase: 'windowsterminal', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.windows-terminal' },
  { exeBase: 'wt', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.windows-terminal' },
  { exeBase: 'git-bash', publisherKeywords: [], bundleId: 'com.git-scm.git' },
  { exeBase: 'sourcetree', publisherKeywords: ['atlassian'], bundleId: 'com.torusknot.SourceTreeNotMAS' },
  { exeBase: 'postman', publisherKeywords: ['postman'], bundleId: 'com.postmanlabs.mac' },
  { exeBase: 'docker', publisherKeywords: ['docker'], bundleId: 'com.docker.docker' },
  { exeBase: 'sublime_text', publisherKeywords: ['sublime'], bundleId: 'com.sublimetext.4' },
  { exeBase: 'sublimetext', publisherKeywords: ['sublime'], bundleId: 'com.sublimetext.4' },
  { exeBase: 'atom', publisherKeywords: ['github'], bundleId: 'com.github.atom' },
  { exeBase: 'notepad++', publisherKeywords: [], bundleId: 'com.notepad-plus-plus.NotepadPlusPlus' },
  { exeBase: 'hbuilderx', publisherKeywords: ['dcloud'], bundleId: 'io.dcloud.HBuilderX' },
  { exeBase: 'hbuilder', publisherKeywords: ['dcloud'], bundleId: 'io.dcloud.HBuilder' },
  { exeBase: 'dbeaver', publisherKeywords: ['dbeaver'], bundleId: 'org.jkiss.dbeaver.core.product' },
  { exeBase: 'navicat', publisherKeywords: ['premiumsoft'], bundleId: 'com.premiumsoft.NavicatPremium' },
  { exeBase: 'redisdesktopmanager', publisherKeywords: [], bundleId: 'com.redisdesktop.RedisDesktopManager' },
  { exeBase: 'mysqlworkbench', publisherKeywords: ['oracle', 'mysql'], bundleId: 'com.oracle.workbench.MySQLWorkbench' },

  // 媒体
  { exeBase: 'spotify', publisherKeywords: ['spotify'], bundleId: 'com.spotify.client' },
  { exeBase: 'vlc', publisherKeywords: ['videolan'], bundleId: 'org.videolan.vlc' },
  { exeBase: 'qqmusic', publisherKeywords: ['tencent'], bundleId: 'com.tencent.qqmusic' },
  { exeBase: 'cloudmusic', publisherKeywords: ['netease'], bundleId: 'com.netease.163music' },
  { exeBase: 'potplayermin64', publisherKeywords: [], bundleId: 'com.daum.potplayer' },
  { exeBase: 'potplayer', publisherKeywords: [], bundleId: 'com.daum.potplayer' },
  { exeBase: 'kmplayer', publisherKeywords: ['pandora'], bundleId: 'com.kmplayer.KMPlayer' },
  { exeBase: 'bilibili', publisherKeywords: ['bilibili'], bundleId: 'tv.danmaku.bilibili' },

  // 生产力
  { exeBase: 'winword', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.Word' },
  { exeBase: 'excel', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.Excel' },
  { exeBase: 'powerpnt', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.Powerpoint' },
  { exeBase: 'onenote', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.onenote.mac' },
  { exeBase: 'outlook', publisherKeywords: ['microsoft'], bundleId: 'com.microsoft.Outlook' },
  { exeBase: 'notion', publisherKeywords: ['notion'], bundleId: 'notion.id' },
  { exeBase: 'obsidian', publisherKeywords: ['obsidian'], bundleId: 'md.obsidian' },
  { exeBase: 'wps', publisherKeywords: ['kingsoft', 'wps'], bundleId: 'cn.wps.mac.Office' },
  { exeBase: 'wpp', publisherKeywords: ['kingsoft', 'wps'], bundleId: 'cn.wps.mac.Office' },
  { exeBase: 'et', publisherKeywords: ['kingsoft', 'wps'], bundleId: 'cn.wps.mac.Office' },
  { exeBase: 'typora', publisherKeywords: ['typora'], bundleId: 'abnerworks.Typora' },
  { exeBase: 'evernote', publisherKeywords: ['evernote'], bundleId: 'com.evernote.Evernote' },
  { exeBase: 'youdaonote', publisherKeywords: ['youdao', 'netease'], bundleId: 'com.youdao.note.mac' },
  { exeBase: 'xmind', publisherKeywords: ['xmind'], bundleId: 'net.xmind.XMind' },
  { exeBase: 'ticktick', publisherKeywords: ['ticktick', 'appest'], bundleId: 'com.ticktick.task' },
  { exeBase: 'dida', publisherKeywords: ['ticktick', 'appest'], bundleId: 'com.ticktick.task' },
  { exeBase: 'todoist', publisherKeywords: ['doist'], bundleId: 'com.todoist.mac.Todoist' },
  { exeBase: 'things', publisherKeywords: ['cultured code'], bundleId: 'com.culturedcode.ThingsMac' },
  { exeBase: 'bear', publisherKeywords: ['shiny frog'], bundleId: 'net.shinyfrog.bear' },

  // 设计
  { exeBase: 'photoshop', publisherKeywords: ['adobe'], bundleId: 'com.adobe.Photoshop' },
  { exeBase: 'illustrator', publisherKeywords: ['adobe'], bundleId: 'com.adobe.illustrator' },
  { exeBase: 'figma', publisherKeywords: ['figma'], bundleId: 'com.figma.Desktop' },
  { exeBase: 'afterfx', publisherKeywords: ['adobe'], bundleId: 'com.adobe.AfterEffects' },
  { exeBase: 'blender', publisherKeywords: ['blender'], bundleId: 'org.blenderfoundation.blender' },
  { exeBase: 'autocad', publisherKeywords: ['autodesk'], bundleId: 'com.autodesk.AutoCAD' },
  { exeBase: 'zbrush', publisherKeywords: ['maxon', 'pixologic'], bundleId: 'com.pixologic.ZBrush' },

  // 安全/密码
  { exeBase: '1password', publisherKeywords: ['agilebits', '1password'], bundleId: 'com.1password.1password' },
  { exeBase: 'bitwarden', publisherKeywords: ['bitwarden'], bundleId: 'com.bitwarden.desktop' },
  { exeBase: 'clash', publisherKeywords: [], bundleId: 'com.clash.ClashX' },
  { exeBase: 'clashforwindows', publisherKeywords: [], bundleId: 'com.clash.ClashForWindows' },
  { exeBase: 'clashverge', publisherKeywords: [], bundleId: 'io.github.clash-verge-rev.clash-verge-rev' },
  { exeBase: 'nordvpn', publisherKeywords: ['nordvpn', 'nordsec'], bundleId: 'com.nordvpn.macos.NordVPN' },
];

/**
 * 根据 exe 文件名和 publisher 推断跨平台 bundleId;命中不到返回 undefined。
 */
function inferBundleId(exePath: string, publisher?: string): string | undefined {
  const base = path.basename(exePath, path.extname(exePath));
  const normBase = normalizeExeBase(base);
  const pub = (publisher ?? '').toLowerCase();
  for (const rule of CROSS_PLATFORM_RULES) {
    if (rule.exeBase !== normBase) continue;
    if (rule.publisherKeywords.length === 0) return rule.bundleId;
    if (rule.publisherKeywords.some((kw) => pub.includes(kw))) return rule.bundleId;
  }
  return undefined;
}

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
  /** DisplayIcon 里解析出的图标索引(可为负,负 = 资源 ID);null 表示未指定 */
  iconIndex?: number | null;
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
          arr.map((raw): RegistryEntry => {
            const rawIcon = raw.DisplayIcon ? String(raw.DisplayIcon) : undefined;
            const parsed = rawIcon ? parseIconSpec(rawIcon) : null;
            return {
              displayName: String(raw.DisplayName ?? ''),
              displayIcon: parsed?.file,
              iconIndex: parsed?.index ?? null,
              installLocation: raw.InstallLocation ? String(raw.InstallLocation) : undefined,
              publisher: raw.Publisher ? String(raw.Publisher) : undefined,
              displayVersion: raw.DisplayVersion ? String(raw.DisplayVersion) : undefined,
              installDate: raw.InstallDate ? String(raw.InstallDate) : undefined,
              estimatedSize:
                typeof raw.EstimatedSize === 'number' ? Number(raw.EstimatedSize) : undefined,
              uninstallString: raw.UninstallString ? String(raw.UninstallString) : undefined,
            };
          })
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
  /** 图标在 iconSource(或 launchExe 自身)中的资源索引/ID */
  iconIndex?: number | null;
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
  // 注意:readUninstallRegistry 已经把 DisplayIcon 拆成了 displayIcon(纯路径) + iconIndex,
  // 这里直接使用,不再重复 parse。
  let iconFromDisplay: string | null = null;
  let iconIndex: number | null = entry.iconIndex ?? null;
  if (entry.displayIcon) {
    const iconPath = expandEnvVars(entry.displayIcon);
    try {
      await fs.access(iconPath);
      const lower = iconPath.toLowerCase();
      if (lower.endsWith('.exe')) {
        const base = path.basename(iconPath);
        if (!NON_MAIN_EXE_PATTERN.test(base)) {
          // 主程序 exe,直接用
          return { launchExe: iconPath, iconSource: null, iconIndex };
        }
        // 是 uninstaller/setup/stub 等,只能作为图标源(Office WORDICON.EXE 这种)
        iconFromDisplay = iconPath;
      } else if (lower.endsWith('.ico') || lower.endsWith('.dll')) {
        iconFromDisplay = iconPath;
      }
    } catch {
      // DisplayIcon 指向的文件不存在,继续 fallback
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
          if (/^(unins|uninstall|resources?|locales?|plugins?|addons?|node_modules|__pycache__|redist|vc_redist)$/i.test(e.name)) continue;
          await walk(p, depth + 1);
        } else if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
          allExes.push(p);
        }
      }
    };
    await walk(installDir, 0);

    const candidates = allExes
      .filter((f) => !NON_MAIN_EXE_PATTERN.test(path.basename(f)))
      .map((f) => ({ file: f, score: nameMatchScore(entry.displayName, path.basename(f)) }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0 && candidates[0].score > 0.3) {
      return {
        launchExe: candidates[0].file,
        iconSource: iconFromDisplay,
        // 有 iconFromDisplay 时优先用它的 index(Office stub 场景);
        // 否则对主 exe 自身,未指定 index 时一律当作 0
        iconIndex: iconFromDisplay ? iconIndex : (iconIndex ?? 0),
      };
    }
    const any = allExes.find((f) => !NON_MAIN_EXE_PATTERN.test(path.basename(f)));
    if (any) {
      return {
        launchExe: any,
        iconSource: iconFromDisplay,
        iconIndex: iconFromDisplay ? iconIndex : (iconIndex ?? 0),
      };
    }
  }

  // 3) 兜底:DisplayIcon 给了 .exe 但被 NON_MAIN 过滤(Office stub),
  // 仍把它当 launchExe 返回——启动可能失败但列表里至少能出现并显示正确图标
  if (iconFromDisplay && iconFromDisplay.toLowerCase().endsWith('.exe')) {
    return { launchExe: iconFromDisplay, iconSource: null, iconIndex };
  }
  return null;
}

/**
 * 图标缓存 schema 版本。同版本 App 内如果改了 extractIcon/路径解析/图标源选择等逻辑,
 * 手动 +1 一次即可强刷所有图标缓存。
 * 正常发版不需要改此常量 —— 目录名绑定 app.getVersion(),每次升级版本自动失效。
 */
const ICON_CACHE_SCHEMA = 2;

function iconCacheDir(): string {
  // 用 App 版本号做目录后缀:每次发版 userData 下就会出现新的 icon-cache-vX.Y.Z-sN,
  // pruneOldIconCaches 会自动清掉旧版本目录,用户无感。
  const ver = app.getVersion().replace(/[\\/:*?"<>|]/g, '_');
  return path.join(app.getPath('userData'), `icon-cache-v${ver}-s${ICON_CACHE_SCHEMA}`);
}

/**
 * 迁移/清理:把所有历史 icon-cache* 目录(包括旧的固定名 icon-cache、旧版本号目录、
 * 旧 schema 目录)里不是"当前版本+当前 schema"的全部递归删掉。
 * 在第一次扫描前调用一次即可,失败不抛出,以免影响主流程。
 */
async function pruneOldIconCaches(): Promise<void> {
  try {
    const base = app.getPath('userData');
    const entries = await fs.readdir(base, { withFileTypes: true });
    const current = path.basename(iconCacheDir());
    // 匹配: icon-cache、icon-cache-vN、icon-cache-vX.Y.Z、icon-cache-vX.Y.Z-sN
    const stale = /^icon-cache(?:-v[\w.-]+)?$/;
    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && stale.test(e.name) && e.name !== current)
        .map((e) =>
          fs.rm(path.join(base, e.name), { recursive: true, force: true }).catch(() => {})
        )
    );
  } catch {
    // best-effort,忽略权限等错误
  }
}

/**
 * 缓存 key 需要把 iconSource + iconIndex 都纳入 hash。
 * 同一个 WORDICON.EXE 在不同 index(0=默认文档 / 1=Word / 2=Excel ...)下是不同图标,
 * 必须分开缓存,否则只会拿到第一个写入的那个。
 */
function iconCacheFileName(
  exePath: string,
  mtimeMs: number,
  iconSource?: string | null,
  iconIndex?: number | null,
): string {
  const src = iconSource ? `${exePath}|${iconSource}` : exePath;
  const raw = iconIndex != null ? `${src}#${iconIndex}` : src;
  const hash = crypto.createHash('sha1').update(raw).digest('hex');
  return `${hash}-${Math.round(mtimeMs)}.png`;
}

/**
 * 抽取 Windows 应用图标为 PNG 并缓存到 userData/icon-cache-v{version}/。
 *
 * 优先级:
 *   1. 如果指定了 iconIndex 且存在 iconSource:用 Win32 ExtractIconEx 精确抽该 index
 *      —— 这是解决 Office WORDICON.EXE,n / imageres.dll,-n 等 icon-container 场景的唯一可靠方式。
 *      对 launchExe 自身指定了 index 的情况也走这条(如 Taskmgr.exe,0)。
 *   2. .ico 文件:直接 nativeImage.createFromBuffer 解码(多尺寸保真)。
 *   3. 其他:.ico 解码不适用时 / 无 index 时,退回 app.getFileIcon(Shell API)。
 */
async function extractIcon(
  launchExe: string,
  mtimeMs: number,
  iconSource?: string | null,
  iconIndex?: number | null,
): Promise<string | null> {
  try {
    const dir = iconCacheDir();
    await fs.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, iconCacheFileName(launchExe, mtimeMs, iconSource, iconIndex));
    try {
      await fs.access(outPath);
      return outPath;
    } catch {
      // not cached yet
    }

    // 决定真正用于抽取图标的文件 + 是否有显式索引
    const primary = iconSource ?? launchExe;
    const hasExplicitIndex = typeof iconIndex === 'number';

    // 1) 若指定了 index,先尝试 ExtractIconEx 精确抽取
    if (hasExplicitIndex) {
      try {
        const pngBuf = await extractIconByIndex(primary, iconIndex as number);
        if (pngBuf && pngBuf.length > 0) {
          // ExtractIconEx 返回的是系统默认大图标尺寸(通常 32px/48px),
          // 用 nativeImage 解码后 resize 到 128px 与其他平台对齐
          const img = nativeImage.createFromBuffer(pngBuf);
          if (!img.isEmpty()) {
            const resized = img.resize({ width: 128, height: 128, quality: 'good' });
            const png = resized.toPNG();
            if (png.length >= 200) {
              await fs.writeFile(outPath, png);
              return outPath;
            }
          }
        }
      } catch (err) {
        logger.warn('extractIconByIndex failed for', primary, 'idx', iconIndex, err);
      }
    }

    // 2) 回退:尝试 .ico 直接解码 / app.getFileIcon(无索引,取该文件默认图标)
    const candidates: Array<{ file: string; isIco: boolean }> = [];
    if (iconSource) {
      try {
        await fs.access(iconSource);
        candidates.push({ file: iconSource, isIco: iconSource.toLowerCase().endsWith('.ico') });
      } catch {
        // iconSource 失效
      }
    }
    candidates.push({ file: launchExe, isIco: false });

    for (let i = 0; i < candidates.length; i++) {
      const { file, isIco } = candidates[i];
      const isLast = i === candidates.length - 1;
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
        await fs.writeFile(outPath, png);
        return outPath;
      } catch (err) {
        logger.warn('extractIcon fallback candidate failed for', file, err);
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
      (await extractIcon(exe, cacheBump, resolved.iconSource, resolved.iconIndex)) ?? undefined;
    const iconDataUrl = (await iconFileToDataUrl(iconCacheFile ?? null)) ?? 'AppWindow';
    const id = hashId(exe);
    const bundleId = inferBundleId(exe, row.publisher);

    results.push({
      id,
      name: row.displayName.trim(),
      description: '',
      icon: iconDataUrl,
      iconCacheFile,
      category,
      categorySource: source,
      bundleId,
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
  iconIndex?: number | null;
}

async function readShortcutTarget(lnkPath: string): Promise<ShortcutResolve | null> {
  // 用 PowerShell WScript.Shell 解析 .lnk 的 TargetPath 与 IconLocation。
  // IconLocation 通常形如 "C:\...\xxx.exe,0" / "C:\...\xxx.ico,0" / "C:\...\xxx.dll,-102",
  // 逗号后是图标索引(正)或资源 ID(负)。
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

      let iconSource: string | null = null;
      let iconIndex: number | null = null;
      if (iconRaw) {
        const parsed = parseIconSpec(expandEnvVars(iconRaw));
        if (parsed.file && /\.(exe|dll|ico)$/i.test(parsed.file)) {
          iconSource = parsed.file;
          iconIndex = parsed.index;
        }
      }
      if (!target && !iconSource) return resolve(null);
      if (!target) return resolve(null);
      const resolved = expandEnvVars(target);
      // 无专门 iconSource 时,默认取 target 自身的 0 号图标
      if (!iconSource) {
        iconSource = null;
        iconIndex = 0;
      }
      resolve({ target: resolved, iconSource, iconIndex });
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
    let iconIndex: number | null = resolved.iconIndex ?? 0;
    let iconStatMtime: number | null = null;
    if (resolved.iconSource) {
      const is = await safeStat(resolved.iconSource);
      if (is) {
        iconSource = resolved.iconSource;
        iconStatMtime = is.mtimeMs;
      } else {
        // iconSource 路径失效,退回用 target 自身的 0 号图标
        iconIndex = 0;
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
      (await extractIcon(exe, cacheBump, iconSource, iconIndex)) ?? undefined;
    const iconDataUrl = (await iconFileToDataUrl(iconCacheFile ?? null)) ?? 'AppWindow';
    const id = hashId(exe);
    const bundleId = inferBundleId(exe);

    results.push({
      id,
      name: displayName,
      description: '',
      icon: iconDataUrl,
      iconCacheFile,
      category,
      categorySource: source,
      bundleId,
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
    await pruneOldIconCaches();
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
