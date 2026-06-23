import { promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

function iconCacheDir(): string {
  return path.join(app.getPath('userData'), 'icon-cache');
}

function safeFileName(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function extractIcon(appPath: string, id: string, iconFile?: string): Promise<string | null> {
  try {
    const cacheDir = iconCacheDir();
    await fs.mkdir(cacheDir, { recursive: true });
    const outPng = path.join(cacheDir, `${safeFileName(id)}.png`);

    const toDataUrl = async (): Promise<string> => {
      const buf = await fs.readFile(outPng);
      return `data:image/png;base64,${buf.toString('base64')}`;
    };

    try {
      await fs.access(outPng);
      return await toDataUrl();
    } catch {
      // not cached yet, continue to extract
    }

    const resourcesDir = path.join(appPath, 'Contents', 'Resources');
    let icnsPath: string | undefined;

    if (iconFile) {
      const name = iconFile.endsWith('.icns') ? iconFile : `${iconFile}.icns`;
      const candidate = path.join(resourcesDir, name);
      try {
        await fs.access(candidate);
        icnsPath = candidate;
      } catch {
        // fall through to directory search
      }
    }

    if (!icnsPath) {
      try {
        const entries = await fs.readdir(resourcesDir);
        const icns = entries.find((e) => e.endsWith('.icns'));
        if (icns) icnsPath = path.join(resourcesDir, icns);
      } catch {
        // no resources dir
      }
    }

    if (!icnsPath) return null;

    await execFileAsync('sips', ['-s', 'format', 'png', '-Z', '128', icnsPath, '--out', outPng]);
    return await toDataUrl();
  } catch {
    return null;
  }
}

export type ScannedCategory =
  | 'dev-tools'
  | 'design'
  | 'productivity'
  | 'communication'
  | 'browsers'
  | 'utilities'
  | 'media'
  | 'security';

export interface ScannedApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ScannedCategory;
  version?: string;
  publisher?: string;
  size: number;
  installDate?: string;
  lastUsed: string;
  usageMinutes: number;
  launchCount: number;
  path: string;
  color: string;
  tags: string[];
}

const SCAN_DIRS = [
  '/Applications',
  '/System/Applications',
  path.join(os.homedir(), 'Applications'),
];

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

const LSAPP_CATEGORY_MAP: Record<string, ScannedCategory> = {
  'public.app-category.developer-tools': 'dev-tools',
  'public.app-category.graphics-design': 'design',
  'public.app-category.photography': 'design',
  'public.app-category.productivity': 'productivity',
  'public.app-category.business': 'productivity',
  'public.app-category.finance': 'productivity',
  'public.app-category.social-networking': 'communication',
  'public.app-category.utilities': 'utilities',
  'public.app-category.music': 'media',
  'public.app-category.video': 'media',
  'public.app-category.entertainment': 'media',
};

const NAME_KEYWORDS: Array<[ScannedCategory, RegExp]> = [
  ['dev-tools', /(code|xcode|terminal|iterm|docker|git|android studio|intellij|pycharm|webstorm|goland|postman|tableplus|sequel|sourcetree|warp)/i],
  ['design', /(figma|sketch|photoshop|illustrator|affinity|pixelmator|blender|zeplin|framer|canva)/i],
  ['browsers', /(chrome|safari|firefox|edge|arc|brave|opera|vivaldi)/i],
  ['communication', /(wechat|微信|slack|telegram|discord|zoom|lark|飞书|teams|messages|mail|qq|dingtalk|钉钉|whatsapp|feishu)/i],
  ['media', /(spotify|vlc|music|iina|quicktime|netflix|bilibili|youtube|infuse|photos)/i],
  ['security', /(clash|surge|1password|bitwarden|vpn|little snitch|lulu|keychain)/i],
  ['productivity', /(notion|obsidian|things|notes|word|excel|powerpoint|keynote|pages|numbers|office|wps|reminders|calendar|todoist|craft)/i],
  ['utilities', /(raycast|alfred|cleanmymac|the unarchiver|finder|monitor|activity|settings|system)/i],
];

function inferCategoryByName(name: string): ScannedCategory {
  for (const [cat, re] of NAME_KEYWORDS) {
    if (re.test(name)) return cat;
  }
  return 'utilities';
}

async function readInfoPlist(appPath: string): Promise<Record<string, string>> {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const result: Record<string, string> = {};
  const keys = [
    'CFBundleShortVersionString',
    'CFBundleIdentifier',
    'LSApplicationCategoryType',
    'CFBundleName',
    'CFBundleIconFile',
  ];
  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync('defaults', ['read', plistPath, key]);
      result[key] = stdout.trim();
    } catch {
      // key missing, ignore
    }
  }
  return result;
}

async function getDirSizeMB(appPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('du', ['-sk', appPath]);
    const kb = parseInt(stdout.split('\t')[0], 10);
    if (Number.isNaN(kb)) return 0;
    return Math.round(kb / 1024);
  } catch {
    return 0;
  }
}

function publisherFromBundleId(bundleId?: string): string | undefined {
  if (!bundleId) return undefined;
  const parts = bundleId.split('.');
  if (parts.length >= 2) {
    return parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return undefined;
}

async function scanOneApp(appPath: string): Promise<ScannedApp | null> {
  try {
    const baseName = path.basename(appPath, '.app');
    const stat = await fs.stat(appPath);

    const cached = metaCache.get(appPath);
    const mtimeMs = stat.mtimeMs;
    if (cached && cached.mtimeMs === mtimeMs) {
      // app 包未变,直接复用上次解析结果,跳过 defaults/du/sips 等昂贵调用
      return { ...cached.app, lastUsed: stat.atime.toISOString() };
    }

    const plist = await readInfoPlist(appPath);
    const size = await getDirSizeMB(appPath);

    const lsCategory = plist['LSApplicationCategoryType'];
    const category: ScannedCategory =
      (lsCategory && LSAPP_CATEGORY_MAP[lsCategory]) || inferCategoryByName(baseName);

    const installDate = stat.birthtime.toISOString().slice(0, 10);
    const lastUsed = stat.atime.toISOString();

    const id = plist['CFBundleIdentifier'] || appPath;
    const iconData = await extractIcon(appPath, id, plist['CFBundleIconFile']);

    const scanned: ScannedApp = {
      id,
      name: baseName,
      description: plist['CFBundleName'] || baseName,
      icon: iconData ?? 'AppWindow',
      category,
      version: plist['CFBundleShortVersionString'],
      publisher: publisherFromBundleId(plist['CFBundleIdentifier']),
      size,
      installDate,
      lastUsed,
      usageMinutes: 0,
      launchCount: 0,
      path: appPath,
      color: CATEGORY_COLORS[category],
      tags: [],
    };

    metaCache.set(appPath, { mtimeMs, app: scanned });
    metaCacheDirty = true;
    return scanned;
  } catch {
    return null;
  }
}

interface MetaCacheEntry {
  mtimeMs: number;
  app: ScannedApp;
}

const metaCache = new Map<string, MetaCacheEntry>();
let metaCacheLoaded = false;
let metaCacheDirty = false;

function metaCachePath(): string {
  return path.join(app.getPath('userData'), 'scan-cache.json');
}

async function loadMetaCache(): Promise<void> {
  if (metaCacheLoaded) return;
  metaCacheLoaded = true;
  try {
    const raw = await fs.readFile(metaCachePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, MetaCacheEntry>;
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.mtimeMs === 'number' && entry.app) {
        metaCache.set(key, entry);
      }
    }
  } catch {
    // no cache yet or corrupted, start fresh
  }
}

async function persistMetaCache(): Promise<void> {
  if (!metaCacheDirty) return;
  metaCacheDirty = false;
  try {
    const obj: Record<string, MetaCacheEntry> = {};
    for (const [key, entry] of metaCache.entries()) obj[key] = entry;
    await fs.writeFile(metaCachePath(), JSON.stringify(obj), 'utf-8');
  } catch {
    // best-effort persistence, ignore failures
  }
}

async function listAppPaths(): Promise<string[]> {
  const found: string[] = [];
  for (const dir of SCAN_DIRS) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.endsWith('.app')) {
          found.push(path.join(dir, entry.name));
        }
      }
    } catch {
      // directory not accessible, skip
    }
  }
  return found;
}

export async function scanInstalledApps(): Promise<ScannedApp[]> {
  await loadMetaCache();
  const found = await listAppPaths();

  const results = await Promise.all(found.map((p) => scanOneApp(p)));
  const apps = results.filter((a): a is ScannedApp => a !== null);

  // 清理已不存在应用的缓存条目
  const foundSet = new Set(found);
  for (const key of metaCache.keys()) {
    if (!foundSet.has(key)) {
      metaCache.delete(key);
      metaCacheDirty = true;
    }
  }

  const seen = new Set<string>();
  const unique = apps.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  unique.sort((a, b) => a.name.localeCompare(b.name));
  await persistMetaCache();
  return unique;
}

/** 用 FSEvents(fs.watch) 监听应用目录的安装/卸载,替代窗口聚焦轮询。 */
let watchers: FSWatcher[] = [];
let watchDebounce: NodeJS.Timeout | null = null;

/**
 * 变化经 400ms 去抖后触发回调,由调用方重新扫描(命中缓存,极快)。
 */
export function startAppWatcher(onChange: () => void): void {
  stopAppWatcher();
  // /System/Applications 为只读系统目录,基本不变,无需监听
  const watchDirs = [
    '/Applications',
    path.join(os.homedir(), 'Applications'),
  ];

  for (const dir of watchDirs) {
    try {
      const w = watch(dir, (_eventType, filename) => {
        // 只关心 .app 级别的增删,忽略包内部文件抖动
        if (filename && !String(filename).endsWith('.app')) return;
        if (watchDebounce) clearTimeout(watchDebounce);
        watchDebounce = setTimeout(onChange, 400);
      });
      w.on('error', () => {});
      watchers.push(w);
    } catch {
      // directory not watchable, skip
    }
  }
}

export function stopAppWatcher(): void {
  if (watchDebounce) {
    clearTimeout(watchDebounce);
    watchDebounce = null;
  }
  for (const w of watchers) {
    try {
      w.close();
    } catch {
      // ignore
    }
  }
  watchers = [];
}
