import type { Software, SoftwareMetaSnapshot } from '@/types';

export function normalizeSoftwareName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[\s_\-.(){}【】（）·・]+/g, '')
    .replace(/(x64|x86|ia64|amd64|arm64|win32|win64|64bit|32bit|64位|32位|portable|便携|绿色版|setup|installer|install|unins|uninstall|卸载|帮助|help|readme|说明|文档|document|documentation|website|官网|license|许可|what'?snew|releasenotes|更新|公告|welcome|欢迎)/gi, '')
    .replace(/v?\d+(\.\d+)*[a-z]*\d*/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeSoftwareName(a);
  const nb = normalizeSoftwareName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  let hit = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) hit++;
  }
  return (hit / longer.length) * 0.5;
}

function findBestNameMatch<T>(
  list: T[],
  getName: (item: T) => string | undefined,
  targetName: string,
  threshold = 0.75,
): T | undefined {
  let best: T | undefined;
  let bestScore = 0;
  let tied = false;
  for (const item of list) {
    const name = getName(item);
    if (!name) continue;
    const score = nameSimilarity(name, targetName);
    if (score > bestScore) {
      bestScore = score;
      best = item;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  }
  if (bestScore >= threshold && !tied) return best;
  return undefined;
}

/**
 * 判断一个 softwareId(可能是 Mac bundleId,也可能是 Windows sha1(exe) id)
 * 是否在本机扫描出的软件列表里可用。匹配顺序:
 *   1) 原生 id 精确相等(同平台或本地创建的收藏/工作流)
 *   2) 本平台软件的 bundleId 字段 === targetId(跨平台场景:Mac 存 com.google.Chrome → Windows 命中)
 *   3) 传入的 bundleId(来自快照/云端记录) === 本机软件的 bundleId 或 id
 *      (解决 Windows→Mac 方向同步:Windows 的 id 是 sha1,但快照里带了 bundleId)
 *   4) 软件名归一化模糊匹配(兜底,需传入 name 参数,用于跨平台规则表未覆盖的软件)
 *
 * 返回匹配到的 Software;未找到返回 undefined。
 *
 * 注意:不处理 uninstalled/deleted,由调用方继续判断可用性。
 */
export function matchSoftware(
  software: Software[],
  targetId: string,
  options?: { name?: string; bundleId?: string },
): Software | undefined {
  if (!targetId && !options?.bundleId) return undefined;
  const byId = software.find((s) => s.id === targetId);
  if (byId) return byId;
  const byBundleId = software.find((s) => !!s.bundleId && s.bundleId === targetId);
  if (byBundleId) return byBundleId;
  if (options?.bundleId) {
    const byInputBundleId = software.find(
      (s) => !!s.bundleId && s.bundleId === options!.bundleId
    );
    if (byInputBundleId) return byInputBundleId;
    const byIdAsBundleId = software.find((s) => s.id === options!.bundleId);
    if (byIdAsBundleId) return byIdAsBundleId;
  }
  if (options?.name) {
    const byName = findBestNameMatch(software, (s) => s.name, options.name);
    if (byName) return byName;
  }
  return undefined;
}

/** filter 版:返回所有命中的软件(理论上最多一个,但为类型友好返回数组) */
export function filterSoftwareByIds(
  software: Software[],
  ids: string[],
  options?: {
    nameMap?: Record<string, string>;
    bundleIdMap?: Record<string, string>;
  },
): Software[] {
  return ids
    .map((id) =>
      matchSoftware(software, id, {
        name: options?.nameMap?.[id],
        bundleId: options?.bundleIdMap?.[id],
      })
    )
    .filter((s): s is Software => Boolean(s));
}

/** 判断目标 id 是否代表一个"可用"软件(已安装、未弃用、未删除、有路径) */
export function isSoftwareAvailable(
  software: Software[],
  targetId: string,
  options?: { name?: string; bundleId?: string },
): boolean {
  const s = matchSoftware(software, targetId, options);
  return !!s && !s.uninstalled && !s.deleted && !!s.path;
}

/**
 * 在工作流/收藏快照里查找元数据。优先按 softwareId 精确匹配,
 * 其次按 bundleId 跨平台匹配(快照里可能带 bundleId 字段),
 * 最后按名字归一化模糊匹配(兜底,需传入 name 参数)。
 */
export function findMetaSnapshot(
  meta: SoftwareMetaSnapshot[] | undefined,
  softwareId: string,
  options?: { name?: string },
): SoftwareMetaSnapshot | undefined {
  if (!meta) return undefined;
  const byId = meta.find((m) => m.softwareId === softwareId);
  if (byId) return byId;
  const byBundle = meta.find(
    (m) => !!m.bundleId && m.bundleId === softwareId,
  );
  if (byBundle) return byBundle;
  if (options?.name) {
    const byName = findBestNameMatch(meta, (m) => m.name, options.name);
    if (byName) return byName;
  }
  return undefined;
}
