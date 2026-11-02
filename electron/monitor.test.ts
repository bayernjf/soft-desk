/**
 * monitor 前台探测测试（P1-2 回归）
 *
 * 覆盖：
 * - Windows 探测输出解析（JSON path / null / 空输出 / 垃圾输出）
 * - exe 路径 → 软件 id 公式与 scanner-win 目录 id 的一致性（已知答案向量）
 * - getFrontmostApp 平台分发（win32/darwin/其它）与三态语义
 * - PowerShell 脚本内容护栏（$PID 保留变量陷阱）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promisify } from 'node:util';

// child_process mock：monitor / foreground-win 在模块加载时 promisify(execFile),
// 必须给出 promisify.custom 形态,返回值才能保持 { stdout, stderr } 结构
const execFileMock = vi.fn();
vi.mock('node:child_process', () => {
  const execFile: unknown = Object.assign(
    (...args: unknown[]) => execFileMock(...args),
    {
      [promisify.custom]: (cmd: string, args: string[], opts: unknown) =>
        execFileMock(cmd, args, opts),
    }
  );
  return { execFile };
});

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}));

// database 顶层依赖 better-sqlite3 与 electron app.getPath,直接桩掉
vi.mock('./database', () => ({
  recordSession: vi.fn(),
}));

import { getFrontmostApp } from './monitor';
import {
  FRONTMOST_WIN_SCRIPT,
  getForegroundExePathWin,
  parseWinFrontmostOutput,
} from './lib/foreground-win';
import { exePathToSoftwareId } from './lib/exe-id';

const realPlatform = process.platform;
function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

beforeEach(() => {
  execFileMock.mockReset();
});

afterEach(() => {
  setPlatform(realPlatform);
});

// ===================== exe id 公式（与 scanner-win 的契约） =====================
describe('exePathToSoftwareId', () => {
  it('sha1(exe 路径小写) 前 24 位（已知答案）', () => {
    // 与 scanner-win 扫描目录 id 同一公式,改动必须同步,否则统计页 join 不上
    expect(exePathToSoftwareId('C:\\Apps\\Foo.exe')).toBe('f9259c07b3bab041a020ef7e');
    expect(
      exePathToSoftwareId('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ).toBe('57b3157304eca90dd4501142');
  });

  it('大小写不敏感（同一路径不同大小写产出同一 id）', () => {
    expect(exePathToSoftwareId('C:\\APPS\\FOO.EXE')).toBe(
      exePathToSoftwareId('c:\\apps\\foo.exe')
    );
  });
});

// ===================== Windows 探测输出解析 =====================
describe('parseWinFrontmostOutput', () => {
  it('合法 JSON path → exe 路径', () => {
    expect(parseWinFrontmostOutput('{"path":"C:\\\\Apps\\\\foo.exe"}\n')).toBe(
      'C:\\Apps\\foo.exe'
    );
  });

  it('JSON null → null（无前台应用）', () => {
    expect(parseWinFrontmostOutput('null')).toBeNull();
  });

  it('空 path / 缺 path → null', () => {
    expect(parseWinFrontmostOutput('{"path":""}')).toBeNull();
    expect(parseWinFrontmostOutput('{}')).toBeNull();
  });

  it('空输出 / 非 JSON → undefined（查询失败，保持会话）', () => {
    expect(parseWinFrontmostOutput('')).toBeUndefined();
    expect(parseWinFrontmostOutput('   \n')).toBeUndefined();
    expect(parseWinFrontmostOutput('Add-Type: error blah')).toBeUndefined();
  });
});

// ===================== PowerShell 脚本护栏 =====================
describe('FRONTMOST_WIN_SCRIPT', () => {
  it('使用 GetForegroundWindow + GetWindowThreadProcessId', () => {
    expect(FRONTMOST_WIN_SCRIPT).toContain('GetForegroundWindow');
    expect(FRONTMOST_WIN_SCRIPT).toContain('GetWindowThreadProcessId');
  });

  it('不给 $pid 赋值（PowerShell 保留只读变量,赋值即抛错）', () => {
    expect(FRONTMOST_WIN_SCRIPT).not.toMatch(/\$pid\s*=/i);
  });
});

// ===================== getForegroundExePathWin =====================
describe('getForegroundExePathWin', () => {
  it('调用 powershell.exe 并返回解析后的 exe 路径', async () => {
    execFileMock.mockResolvedValue({
      stdout: '{"path":"C:\\\\Apps\\\\foo.exe"}',
      stderr: '',
    });
    const result = await getForegroundExePathWin();
    expect(result).toBe('C:\\Apps\\foo.exe');
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileMock.mock.calls[0];
    expect(cmd).toBe('powershell.exe');
    expect(args).toContain('-NonInteractive');
  });

  it('spawn 失败/超时 → undefined（保持会话语义）', async () => {
    execFileMock.mockRejectedValue(new Error('spawn powershell.exe ENOENT'));
    expect(await getForegroundExePathWin()).toBeUndefined();
  });
});

// ===================== getFrontmostApp 平台分发 =====================
describe('getFrontmostApp', () => {
  it('win32:前台 exe 路径转换为 scanner-win 一致的软件 id', async () => {
    setPlatform('win32');
    execFileMock.mockResolvedValue({
      stdout: '{"path":"C:\\\\Apps\\\\foo.exe"}',
      stderr: '',
    });
    expect(await getFrontmostApp()).toBe('f9259c07b3bab041a020ef7e');
  });

  it('win32:无前台应用(null) → null(结束当前会话)', async () => {
    setPlatform('win32');
    execFileMock.mockResolvedValue({ stdout: 'null', stderr: '' });
    expect(await getFrontmostApp()).toBeNull();
  });

  it('win32:探测失败 → undefined(不切会话)', async () => {
    setPlatform('win32');
    execFileMock.mockRejectedValue(new Error('timeout'));
    expect(await getFrontmostApp()).toBeUndefined();
  });

  it('darwin:lsappinfo 返回 bundleId(原有路径不回归)', async () => {
    setPlatform('darwin');
    execFileMock
      .mockResolvedValueOnce({ stdout: ' ASN:0x0-12345 \n', stderr: '' })
      .mockResolvedValueOnce({
        stdout: '"CFBundleIdentifier"="com.foo.Bar"',
        stderr: '',
      });
    expect(await getFrontmostApp()).toBe('com.foo.Bar');
    expect(execFileMock).toHaveBeenCalledTimes(2);
    expect(execFileMock.mock.calls[0][0]).toBe('lsappinfo');
  });

  it('darwin:lsappinfo 失败 → undefined', async () => {
    setPlatform('darwin');
    execFileMock.mockRejectedValue(new Error('lsappinfo failed'));
    expect(await getFrontmostApp()).toBeUndefined();
  });

  it('其它平台:返回 null 且不 spawn 任何进程', async () => {
    setPlatform('linux');
    expect(await getFrontmostApp()).toBeNull();
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
