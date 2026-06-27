import { pinyin } from 'pinyin-pro';
import type { Software } from '@/types';

/** 把含中文的文本转成拼音相关的可匹配形式:
 *  - full:全拼(不带声调、无空格),如"微信" -> "weixin"
 *  - initials:每字首字母拼接,如"微信" -> "wx"
 *  非中文字符原样保留,使英文/数字也能参与匹配。 */
export interface PinyinForms {
  full: string;
  initials: string;
}

const formsCache = new Map<string, PinyinForms>();

const hasChinese = (text: string): boolean => /[\u4e00-\u9fa5]/.test(text);

export function toPinyinForms(text: string): PinyinForms {
  if (!text) return { full: '', initials: '' };
  const cached = formsCache.get(text);
  if (cached) return cached;

  let forms: PinyinForms;
  if (!hasChinese(text)) {
    const lower = text.toLowerCase();
    forms = { full: lower, initials: lower };
  } else {
    const full = pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
      .join('')
      .toLowerCase()
      .replace(/\s+/g, '');
    const initials = pinyin(text, {
      pattern: 'first',
      toneType: 'none',
      type: 'array',
      nonZh: 'consecutive',
    })
      .join('')
      .toLowerCase()
      .replace(/\s+/g, '');
    forms = { full, initials };
  }

  formsCache.set(text, forms);
  return forms;
}

/** 判断单个字段是否命中查询:原文子串、全拼子串或首字母子串任一命中即可。
 *  query 应已 trim + toLowerCase。 */
export function fieldMatches(field: string, query: string): boolean {
  if (!field) return false;
  const lower = field.toLowerCase();
  if (lower.includes(query)) return true;
  const { full, initials } = toPinyinForms(field);
  return full.includes(query) || initials.includes(query);
}

/** 软件是否命中查询(name / description / tags / publisher,均支持拼音与首字母)。
 *  query 应已 trim + toLowerCase。 */
export function softwareMatches(software: Software, query: string): boolean {
  if (!query) return true;
  if (fieldMatches(software.name, query)) return true;
  if (fieldMatches(software.description, query)) return true;
  if (software.publisher && fieldMatches(software.publisher, query)) return true;
  return software.tags.some((t) => fieldMatches(t, query));
}
