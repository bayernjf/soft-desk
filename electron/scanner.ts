import { promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

function iconCacheDir(): string {
  return path.join(app.getPath('userData'), 'icon-cache');
}

function safeFileName(id: string): string {
  // 用 hash 避免不同 id(尤其退化为路径时)清洗后碰撞到同一文件名
  return crypto.createHash('sha1').update(id).digest('hex');
}

/**
 * 提取应用图标到缓存目录,返回缓存 PNG 的绝对路径(失败返回 null)。
 * 缓存文件名纳入 mtimeMs,应用升级换图标(mtime 变化)后会生成新文件,旧缓存自然失效。
 */
async function extractIcon(
  appPath: string,
  id: string,
  mtimeMs: number,
  iconFile?: string
): Promise<string | null> {
  try {
    const cacheDir = iconCacheDir();
    await fs.mkdir(cacheDir, { recursive: true });
    const outPng = path.join(cacheDir, `${safeFileName(id)}-${Math.round(mtimeMs)}.png`);

    try {
      await fs.access(outPng);
      return outPng;
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

    if (icnsPath) {
      try {
        await execFileAsync('sips', ['-s', 'format', 'png', '-Z', '128', icnsPath, '--out', outPng]);
        return outPng;
      } catch {
        // sips 转换失败(如 icns 损坏),继续走系统图标回退
      }
    }

    // 回退:用系统 API 取 Finder 中显示的官方图标,覆盖使用 Assets.car 资源目录、
    // 无独立 .icns 文件的现代应用,避免退化成首字母占位图
    return await iconFromSystem(appPath, outPng);
  } catch {
    return null;
  }
}

/** 通过 Electron 系统 API 获取应用的官方图标,写入缓存 PNG;失败返回 null */
async function iconFromSystem(appPath: string, outPng: string): Promise<string | null> {
  try {
    const image = await app.getFileIcon(appPath, { size: 'large' });
    if (image.isEmpty()) return null;
    const png = image.toPNG();
    if (!png.length) return null;
    await fs.writeFile(outPng, png);
    return outPng;
  } catch {
    return null;
  }
}

/** 把缓存的图标 PNG 路径读成 base64 data URL,供渲染层使用(dev 模式无法直接加载 file://) */
async function iconFileToDataUrl(iconCacheFile: string | null): Promise<string | null> {
  if (!iconCacheFile) return null;
  try {
    const buf = await fs.readFile(iconCacheFile);
    return `data:image/png;base64,${buf.toString('base64')}`;
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
  /** 图标缓存 PNG 的绝对路径(不持久化进 scan-cache.json,避免缓存文件膨胀) */
  iconCacheFile?: string;
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
  const keys = [
    'CFBundleShortVersionString',
    'CFBundleIdentifier',
    'LSApplicationCategoryType',
    'CFBundleName',
    'CFBundleIconFile',
  ];
  const result: Record<string, string> = {};
  // 一次性把整个 plist 转成 JSON 读取,替代逐 key 调用 defaults(原先每个 app 5 次子进程)
  try {
    const { stdout } = await execFileAsync('plutil', ['-convert', 'json', '-o', '-', plistPath]);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    for (const key of keys) {
      const val = parsed[key];
      if (typeof val === 'string') result[key] = val.trim();
      else if (typeof val === 'number') result[key] = String(val);
    }
    return result;
  } catch {
    // plutil 失败时回退到逐 key 的 defaults 读取,保证健壮性
  }
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
      // app 包未变,直接复用上次解析结果,跳过 plist/du/sips 等昂贵调用;
      // 图标 data URL 从缓存的 PNG 文件路径按需读出(缓存本身不存 base64)
      let iconCacheFile = cached.app.iconCacheFile ?? null;
      let icon = await iconFileToDataUrl(iconCacheFile);
      // 自愈:旧缓存未提取到图标(如曾退化为首字母),用系统 API 补取官方图标
      if (!icon) {
        const id = cached.app.id;
        const refreshed = await extractIcon(appPath, id, mtimeMs, undefined);
        icon = await iconFileToDataUrl(refreshed);
        if (icon) {
          iconCacheFile = refreshed;
          metaCache.set(appPath, {
            mtimeMs,
            app: { ...cached.app, iconCacheFile: refreshed ?? undefined },
          });
          metaCacheDirty = true;
        }
      }
      return { ...cached.app, icon: icon ?? 'AppWindow', iconCacheFile: iconCacheFile ?? undefined, lastUsed: stat.atime.toISOString() };
    }

    const plist = await readInfoPlist(appPath);
    const size = await getDirSizeMB(appPath);

    const lsCategory = plist['LSApplicationCategoryType'];
    const category: ScannedCategory =
      (lsCategory && LSAPP_CATEGORY_MAP[lsCategory]) || inferCategoryByName(baseName);

    const installDate = stat.birthtime.toISOString().slice(0, 10);
    const lastUsed = stat.atime.toISOString();

    const id = plist['CFBundleIdentifier'] || appPath;
    const iconCacheFile = await extractIcon(appPath, id, mtimeMs, plist['CFBundleIconFile']);
    const icon = (await iconFileToDataUrl(iconCacheFile)) ?? 'AppWindow';

    const scanned: ScannedApp = {
      id,
      name: baseName,
      description: plist['CFBundleName'] || baseName,
      icon,
      iconCacheFile: iconCacheFile ?? undefined,
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

    // 缓存里只存图标文件路径,不存 base64,避免 scan-cache.json 膨胀
    metaCache.set(appPath, { mtimeMs, app: { ...scanned, icon: '' } });
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

/** 限制并发的 map,避免首扫时为每个 app 同时派生子进程(plutil/du/sips)打满句柄 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function scanInstalledApps(): Promise<ScannedApp[]> {
  await loadMetaCache();
  const found = await listAppPaths();

  const results = await mapWithConcurrency(found, 6, (p) => scanOneApp(p));
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
  await pruneOrphanIcons();
  return unique;
}

/** 删除 icon-cache 中不再被任何缓存条目引用的 PNG(应用升级换图标/卸载后产生的陈旧文件) */
async function pruneOrphanIcons(): Promise<void> {
  try {
    const referenced = new Set<string>();
    for (const entry of metaCache.values()) {
      if (entry.app.iconCacheFile) referenced.add(path.basename(entry.app.iconCacheFile));
    }
    const dir = iconCacheDir();
    const files = await fs.readdir(dir);
    await Promise.all(
      files
        .filter((f) => f.endsWith('.png') && !referenced.has(f))
        .map((f) => fs.unlink(path.join(dir, f)).catch(() => {}))
    );
  } catch {
    // icon-cache 不存在或不可读,忽略
  }
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
