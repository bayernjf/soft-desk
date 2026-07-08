import { describe, it, expect } from 'vitest';
import {
  normalizeSoftwareName,
  matchSoftware,
  filterSoftwareByIds,
  isSoftwareAvailable,
  findMetaSnapshot,
} from './software-matching';
import type { Software, SoftwareMetaSnapshot } from '@/types';

function makeSoftware(over: Partial<Software> & Pick<Software, 'id'>): Software {
  return {
    id: over.id,
    name: over.name ?? over.id,
    description: '',
    icon: over.icon ?? '',
    category: 'dev-tools',
    size: 0,
    lastUsed: '',
    usageMinutes: 0,
    launchCount: 0,
    path: over.path ?? `/app/${over.id}`,
    color: '#2563eb',
    tags: [],
    bundleId: over.bundleId,
    uninstalled: over.uninstalled,
    deleted: over.deleted,
    ...over,
  };
}

describe('normalizeSoftwareName', () => {
  it('空字符串返回空', () => {
    expect(normalizeSoftwareName('')).toBe('');
  });

  it('转为小写', () => {
    expect(normalizeSoftwareName('Google Chrome')).toBe('googlechrome');
  });

  it('去掉空格、下划线、点、横杠', () => {
    expect(normalizeSoftwareName('Visual Studio Code')).toBe('visualstudiocode');
    expect(normalizeSoftwareName('Google_Chrome')).toBe('googlechrome');
    expect(normalizeSoftwareName('Google.Chrome')).toBe('googlechrome');
    expect(normalizeSoftwareName('Google-Chrome')).toBe('googlechrome');
  });

  it('去掉括号及内容位置不影响', () => {
    expect(normalizeSoftwareName('Google Chrome (x64)')).toBe('googlechrome');
    expect(normalizeSoftwareName('Mozilla Firefox(x86)')).toBe('mozillafirefox');
  });

  it('去掉版本号', () => {
    expect(normalizeSoftwareName('Photoshop 2024')).toBe('photoshop');
    expect(normalizeSoftwareName('VS Code v1.85.0')).toBe('vscode');
    expect(normalizeSoftwareName('App v2')).toBe('app');
  });

  it('去掉位数和平台后缀', () => {
    expect(normalizeSoftwareName('App x64')).toBe('app');
    expect(normalizeSoftwareName('App 64位')).toBe('app');
    expect(normalizeSoftwareName('App arm64')).toBe('app');
  });

  it('去掉常见噪声词', () => {
    expect(normalizeSoftwareName('Chrome Installer')).toBe('chrome');
    expect(normalizeSoftwareName('Chrome卸载')).toBe('chrome');
    expect(normalizeSoftwareName('Chrome Help')).toBe('chrome');
    expect(normalizeSoftwareName('Chrome 绿色版')).toBe('chrome');
    expect(normalizeSoftwareName('Chrome Portable')).toBe('chrome');
  });

  it('中文软件名正常处理', () => {
    expect(normalizeSoftwareName('微信')).toBe('微信');
    expect(normalizeSoftwareName('钉钉 (DingTalk)')).toBe('钉钉dingtalk');
  });
});

describe('matchSoftware', () => {
  const software = [
    makeSoftware({ id: 'win-chrome-hash', name: 'Google Chrome', bundleId: 'com.google.Chrome' }),
    makeSoftware({ id: 'win-trae-hash', name: 'Trae CN' }),
    makeSoftware({ id: 'win-edge-hash', name: 'Microsoft Edge', bundleId: 'com.microsoft.edgemac' }),
    makeSoftware({ id: 'local-app', name: 'My Custom App' }),
  ];

  it('同平台 id 精确匹配', () => {
    const result = matchSoftware(software, 'win-trae-hash');
    expect(result?.id).toBe('win-trae-hash');
  });

  it('跨平台 bundleId 精确匹配', () => {
    const result = matchSoftware(software, 'com.google.Chrome');
    expect(result).toBeDefined();
    expect(result?.bundleId).toBe('com.google.Chrome');
  });

  it('无 name 参数时不启用名字匹配兜底', () => {
    const result = matchSoftware(software, 'some-unknown-id');
    expect(result).toBeUndefined();
  });

  it('有 name 参数时启用名字归一化匹配', () => {
    const result = matchSoftware(software, 'some-mac-trae-id', { name: 'Trae CN' });
    expect(result?.id).toBe('win-trae-hash');
  });

  it('名字有微小差异仍能匹配', () => {
    const result = matchSoftware(software, 'unknown-id', { name: 'Google Chrome (x64)' });
    expect(result?.name).toBe('Google Chrome');
  });

  it('名字差异太大不匹配', () => {
    const result = matchSoftware(software, 'unknown-id', { name: '完全不同的软件' });
    expect(result).toBeUndefined();
  });

  it('id 和 bundleId 优先于名字匹配', () => {
    const result = matchSoftware(software, 'win-edge-hash', { name: 'Google Chrome' });
    expect(result?.id).toBe('win-edge-hash');
  });

  it('传入 bundleId 选项时，通过 bundleId 精确匹配本机软件（Windows→Mac 场景）', () => {
    const result = matchSoftware(software, 'some-win-sha1-hash', { bundleId: 'com.google.Chrome' });
    expect(result?.bundleId).toBe('com.google.Chrome');
    expect(result?.id).toBe('win-chrome-hash');
  });

  it('传入 bundleId 选项时，匹配 s.id === bundleId 的情况（Mac 上 id=bundleId）', () => {
    const macSoftware = [
      makeSoftware({ id: 'com.google.Chrome', name: 'Google Chrome', bundleId: 'com.google.Chrome' }),
    ];
    const result = matchSoftware(macSoftware, 'win-chrome-sha1', { bundleId: 'com.google.Chrome' });
    expect(result?.id).toBe('com.google.Chrome');
  });

  it('bundleId 匹配优先于名字模糊匹配', () => {
    const result = matchSoftware(
      software,
      'unknown-id',
      { name: 'Microsoft Edge', bundleId: 'com.google.Chrome' }
    );
    expect(result?.bundleId).toBe('com.google.Chrome');
    expect(result?.name).toBe('Google Chrome');
  });

  it('bundleId 不匹配时回退到名字匹配', () => {
    const result = matchSoftware(
      software,
      'unknown-id',
      { name: 'Trae CN', bundleId: 'com.unknown.App' }
    );
    expect(result?.id).toBe('win-trae-hash');
  });

  it('targetId 为空但有 bundleId 时仍可匹配', () => {
    const result = matchSoftware(software, '', { bundleId: 'com.google.Chrome' });
    expect(result?.bundleId).toBe('com.google.Chrome');
  });

  it('多个同名软件得分相同时(平局)不匹配，避免误匹配', () => {
    const dupSoftware = [
      makeSoftware({ id: 'a', name: 'MyApp' }),
      makeSoftware({ id: 'b', name: 'MyApp' }),
    ];
    const result = matchSoftware(dupSoftware, 'unknown-id', { name: 'MyApp' });
    expect(result).toBeUndefined();
  });
});

describe('filterSoftwareByIds', () => {
  const software = [
    makeSoftware({ id: 'a', name: 'App A' }),
    makeSoftware({ id: 'b', name: 'App B' }),
    makeSoftware({ id: 'c', name: 'App C' }),
  ];

  it('精确匹配多个 id', () => {
    const result = filterSoftwareByIds(software, ['a', 'c']);
    expect(result.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('通过 nameMap 启用名字匹配', () => {
    const result = filterSoftwareByIds(software, ['unknown-id'], {
      nameMap: { 'unknown-id': 'App B' },
    });
    expect(result.map((s) => s.id)).toEqual(['b']);
  });
});

describe('isSoftwareAvailable', () => {
  const software = [
    makeSoftware({ id: 'installed', name: 'Installed', path: '/path/app' }),
    makeSoftware({ id: 'uninstalled', name: 'Uninstalled', uninstalled: true, path: '' }),
    makeSoftware({ id: 'deleted', name: 'Deleted', deleted: true, path: '/path' }),
  ];

  it('已安装且有路径返回 true', () => {
    expect(isSoftwareAvailable(software, 'installed')).toBe(true);
  });

  it('已卸载返回 false', () => {
    expect(isSoftwareAvailable(software, 'uninstalled')).toBe(false);
  });

  it('已删除返回 false', () => {
    expect(isSoftwareAvailable(software, 'deleted')).toBe(false);
  });

  it('不存在返回 false', () => {
    expect(isSoftwareAvailable(software, 'nonexistent')).toBe(false);
  });

  it('通过 name 兜底匹配后判断可用性', () => {
    expect(isSoftwareAvailable(software, 'unknown-id', { name: 'Installed' })).toBe(true);
  });
});

describe('findMetaSnapshot', () => {
  const meta: SoftwareMetaSnapshot[] = [
    { softwareId: 'com.google.Chrome', name: 'Google Chrome', bundleId: 'com.google.Chrome', icon: '', color: '', category: 'browsers' },
    { softwareId: 'some-id', name: 'Trae CN', icon: '', color: '', category: 'dev-tools' },
  ];

  it('按 softwareId 精确匹配', () => {
    const result = findMetaSnapshot(meta, 'com.google.Chrome');
    expect(result?.name).toBe('Google Chrome');
  });

  it('按 bundleId 匹配', () => {
    const result = findMetaSnapshot(meta, 'com.google.Chrome');
    expect(result).toBeDefined();
  });

  it('通过 name 兜底匹配', () => {
    const result = findMetaSnapshot(meta, 'unknown-id', { name: 'Trae CN' });
    expect(result?.softwareId).toBe('some-id');
  });

  it('undefined meta 返回 undefined', () => {
    expect(findMetaSnapshot(undefined, 'id')).toBeUndefined();
  });
});
