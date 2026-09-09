import { describe, it, expect } from 'vitest';
import { toPinyinForms, fieldMatches, softwareMatches } from './searchMatch';
import type { Software } from '@/types';

function makeSoftware(over: Partial<Software> & Pick<Software, 'id'>): Software {
  return {
    id: over.id,
    name: over.name ?? over.id,
    description: over.description ?? '',
    icon: '',
    category: 'dev-tools',
    size: 0,
    lastUsed: '',
    usageMinutes: 0,
    launchCount: 0,
    path: `/app/${over.id}`,
    color: '#2563eb',
    tags: over.tags ?? [],
    ...over,
  };
}

describe('toPinyinForms', () => {
  it('中文转全拼与首字母', () => {
    expect(toPinyinForms('微信')).toEqual({ full: 'weixin', initials: 'wx' });
    expect(toPinyinForms('钉钉')).toEqual({ full: 'dingding', initials: 'dd' });
  });

  it('多字中文首字母逐字拼接', () => {
    expect(toPinyinForms('网易云音乐')).toEqual({
      full: 'wangyiyunyinyue',
      initials: 'wyyyy',
    });
  });

  it('纯非中文文本原样小写,full 与 initials 相同', () => {
    expect(toPinyinForms('VS Code')).toEqual({ full: 'vs code', initials: 'vs code' });
  });

  it('中英混排时非中文段落作为整体保留', () => {
    expect(toPinyinForms('腾讯QQ')).toEqual({ full: 'tengxunqq', initials: 'txqq' });
  });

  it('空字符串返回空表单', () => {
    expect(toPinyinForms('')).toEqual({ full: '', initials: '' });
  });

  it('重复调用结果稳定(命中缓存不改变返回值)', () => {
    const first = toPinyinForms('搜狗输入法');
    const second = toPinyinForms('搜狗输入法');
    expect(second).toEqual(first);
  });
});

describe('fieldMatches', () => {
  it('原文子串命中', () => {
    expect(fieldMatches('Photoshop', 'photo')).toBe(true);
  });

  it('原文匹配忽略大小写', () => {
    expect(fieldMatches('Photoshop', 'PHOTO'.toLowerCase())).toBe(true);
  });

  it('全拼子串命中', () => {
    expect(fieldMatches('微信', 'weixin')).toBe(true);
    expect(fieldMatches('微信', 'wei')).toBe(true);
  });

  it('首字母子串命中', () => {
    expect(fieldMatches('网易云音乐', 'wyy')).toBe(true);
  });

  it('中文原文子串命中', () => {
    expect(fieldMatches('微信', '微')).toBe(true);
  });

  it('无关查询不命中', () => {
    expect(fieldMatches('微信', 'qq')).toBe(false);
  });

  it('空字段永不命中', () => {
    expect(fieldMatches('', 'wx')).toBe(false);
  });
});

describe('softwareMatches', () => {
  it('空查询命中全部', () => {
    expect(softwareMatches(makeSoftware({ id: 'a', name: '微信' }), '')).toBe(true);
  });

  it('命中 name', () => {
    const sw = makeSoftware({ id: 'a', name: '微信' });
    expect(softwareMatches(sw, 'wx')).toBe(true);
  });

  it('命中 description', () => {
    const sw = makeSoftware({ id: 'a', name: 'Unknown', description: '即时通讯工具' });
    expect(softwareMatches(sw, 'jishi')).toBe(true);
  });

  it('命中 publisher', () => {
    const sw = makeSoftware({ id: 'a', name: 'Unknown', publisher: '腾讯' });
    expect(softwareMatches(sw, 'tengxun')).toBe(true);
  });

  it('命中任一 tag', () => {
    const sw = makeSoftware({ id: 'a', name: 'Unknown', tags: ['设计', '图像'] });
    expect(softwareMatches(sw, 'tx')).toBe(true);
  });

  it('publisher 缺省时不影响其它字段匹配', () => {
    const sw = makeSoftware({ id: 'a', name: '钉钉', publisher: undefined });
    expect(softwareMatches(sw, 'dd')).toBe(true);
  });

  it('所有字段都不命中时返回 false', () => {
    const sw = makeSoftware({
      id: 'a',
      name: '微信',
      description: '即时通讯',
      publisher: '腾讯',
      tags: ['社交'],
    });
    expect(softwareMatches(sw, 'photoshop')).toBe(false);
  });
});
