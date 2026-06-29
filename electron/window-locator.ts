import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from './lib/logger';

const execFileAsync = promisify(execFile);
const logger = createLogger('window-locator');

export interface AppWindowBounds {
  /** 窗口左上角 X(macOS 全局显示坐标系,主屏左上为原点,与 Electron screen 坐标一致) */
  x: number;
  y: number;
  width: number;
  height: number;
}

// 用 JXA(osascript -l JavaScript)读取指定应用主窗口的全局边界。
// 不依赖辅助功能(Accessibility)权限:
// - NSRunningApplication 把 appPath 的 bundleId 解析为正在运行实例的 pid;
// - CGWindowListCopyWindowInfo(onScreenOnly|excludeDesktop) 枚举所有在屏窗口,
//   过滤出属于该 pid、layer===0(普通应用窗口,排除菜单栏/状态栏浮层)的窗口,
//   取面积最大的作为应用主窗口。
// 这两个 API 都不触发权限弹窗,因此可静默工作。
const LOCATE_SCRIPT = `
ObjC.import('AppKit');
ObjC.import('CoreGraphics');
function run(argv) {
  var appPath = argv[0];
  if (!appPath) return JSON.stringify({ ok: false });
  var nb = $.NSBundle.bundleWithPath(appPath);
  if (!nb) return JSON.stringify({ ok: false });
  var bidObj = nb.bundleIdentifier;
  if (!bidObj) return JSON.stringify({ ok: false });
  var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(bidObj);
  if (!apps || apps.count === 0) return JSON.stringify({ ok: true, running: false });
  var pid = apps.objectAtIndex(0).processIdentifier;
  var list = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0));
  var n = list.count;
  var best = null, bestArea = -1;
  for (var i = 0; i < n; i++) {
    var w = list.objectAtIndex(i);
    var owner = w.objectForKey('kCGWindowOwnerPID');
    if (!owner || owner.intValue !== pid) continue;
    var layer = w.objectForKey('kCGWindowLayer');
    if (layer && layer.intValue !== 0) continue;
    var b = w.objectForKey('kCGWindowBounds');
    if (!b) continue;
    var ww = b.objectForKey('Width').doubleValue;
    var hh = b.objectForKey('Height').doubleValue;
    if (ww * hh > bestArea) {
      bestArea = ww * hh;
      best = {
        x: b.objectForKey('X').doubleValue,
        y: b.objectForKey('Y').doubleValue,
        width: ww,
        height: hh
      };
    }
  }
  if (!best) return JSON.stringify({ ok: true, running: true, hasWindow: false });
  return JSON.stringify({ ok: true, running: true, hasWindow: true, bounds: best });
}
`;

// 把鼠标光标移动到指定的全局坐标(与 LOCATE_SCRIPT/Electron screen 同一坐标系)。
// CGWarpMouseCursorPosition 不需要任何特殊权限。
// 坐标通过环境变量传入,而非命令行参数——否则负数坐标(位于
// 主屏左侧的显示器,X 为负)会被 osascript 当成命令行选项解析(报 illegal option),
// 导致光标无法移动到左侧显示器。
// 支持带缓动的动画:传入 SOFTDESK_WARP_FROM_X/FROM_Y 且 ANIMATE=1 时启用。
const WARP_SCRIPT = `
ObjC.import('CoreGraphics');
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function run() {
  var env = $.NSProcessInfo.processInfo.environment;
  var x = parseFloat(env.objectForKey('SOFTDESK_WARP_X').js);
  var y = parseFloat(env.objectForKey('SOFTDESK_WARP_Y').js);
  if (isNaN(x) || isNaN(y)) return 'skip';

  var animate = env.objectForKey('SOFTDESK_WARP_ANIMATE');
  if (!animate || animate.js !== '1') {
    $.CGWarpMouseCursorPosition($.CGPointMake(x, y));
    return 'ok';
  }

  var fromX = parseFloat(env.objectForKey('SOFTDESK_WARP_FROM_X').js);
  var fromY = parseFloat(env.objectForKey('SOFTDESK_WARP_FROM_Y').js);
  if (isNaN(fromX) || isNaN(fromY)) {
    $.CGWarpMouseCursorPosition($.CGPointMake(x, y));
    return 'ok';
  }

  var durationMs = 350;
  var durationEnv = env.objectForKey('SOFTDESK_WARP_DURATION_MS');
  if (durationEnv && durationEnv.js) {
    var parsedDur = parseFloat(durationEnv.js);
    if (!isNaN(parsedDur) && parsedDur > 0) durationMs = parsedDur;
  }
  var intervalMs = 8;
  var steps = Math.max(1, Math.round(durationMs / intervalMs));
  for (var i = 1; i <= steps; i++) {
    var t = easeOutCubic(i / steps);
    var cx = fromX + (x - fromX) * t;
    var cy = fromY + (y - fromY) * t;
    $.CGWarpMouseCursorPosition($.CGPointMake(cx, cy));
    $.NSThread.sleepForTimeInterval(intervalMs / 1000);
  }
  $.CGWarpMouseCursorPosition($.CGPointMake(x, y));
  return 'ok';
}
`;

/**
 * 返回指定应用当前主窗口的全局边界;应用未运行/无可见窗口/非 macOS 时返回 null。
 */
export async function getAppWindowBounds(appPath: string): Promise<AppWindowBounds | null> {
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await execFileAsync('osascript', [
      '-l',
      'JavaScript',
      '-e',
      LOCATE_SCRIPT,
      appPath,
    ]);
    const parsed = JSON.parse(stdout.trim()) as {
      ok?: boolean;
      running?: boolean;
      hasWindow?: boolean;
      bounds?: AppWindowBounds;
    };
    if (parsed?.ok && parsed.running && parsed.hasWindow && parsed.bounds) {
      return parsed.bounds;
    }
    return null;
  } catch (err) {
    logger.error('getAppWindowBounds failed:', err);
    return null;
  }
}

export interface WarpCursorOptions {
  fromX?: number;
  fromY?: number;
  animate?: boolean;
  durationMs?: number;
}

/**
 * 把鼠标移动到全局坐标 (x, y);非 macOS 或失败时静默忽略。
 * 若传入 fromX/fromY 且 animate 为 true,则以 easeOutCubic 缓动动画移动光标。
 */
export async function warpCursor(x: number, y: number, opts: WarpCursorOptions = {}): Promise<void> {
  if (process.platform !== 'darwin') return;
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SOFTDESK_WARP_X: String(Math.round(x)),
      SOFTDESK_WARP_Y: String(Math.round(y)),
    };
    if (opts.animate && opts.fromX != null && opts.fromY != null) {
      env.SOFTDESK_WARP_ANIMATE = '1';
      env.SOFTDESK_WARP_FROM_X = String(Math.round(opts.fromX));
      env.SOFTDESK_WARP_FROM_Y = String(Math.round(opts.fromY));
      if (opts.durationMs != null && opts.durationMs > 0) {
        env.SOFTDESK_WARP_DURATION_MS = String(opts.durationMs);
      }
    }
    await execFileAsync('osascript', ['-l', 'JavaScript', '-e', WARP_SCRIPT], { env });
  } catch (err) {
    logger.error('warpCursor failed:', err);
  }
}
