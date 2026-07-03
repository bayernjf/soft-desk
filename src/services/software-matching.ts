import type { Software, SoftwareMetaSnapshot } from '@/types';

/**
 * 判断一个 softwareId(可能是 Mac bundleId,也可能是 Windows sha1(exe) id)
 * 是否在本机扫描出的软件列表里可用。匹配顺序:
 *   1) 原生 id 精确相等(同平台或本地创建的收藏/工作流)
 *   2) 本平台软件的 bundleId 字段相等(跨平台场景:Mac 存 com.google.Chrome → Windows 命中)
 *   3) 反向:传入的 id 看起来像反域名 bundleId,而本机某软件的 id 就等于该 bundleId
 *      (兜底,因为 Mac 上 id 本身就是 bundleId)
 *
 * 返回匹配到的 Software;未找到返回 undefined。
 *
 * 注意:不处理 uninstalled/deleted,由调用方继续判断可用性。
 */
export function matchSoftware(
  software: Software[],
  targetId: string,
): Software | undefined {
  if (!targetId) return undefined;
  const byId = software.find((s) => s.id === targetId);
  if (byId) return byId;
  const byBundleId = software.find((s) => !!s.bundleId && s.bundleId === targetId);
  if (byBundleId) return byBundleId;
  return undefined;
}

/** filter 版:返回所有命中的软件(理论上最多一个,但为类型友好返回数组) */
export function filterSoftwareByIds(software: Software[], ids: string[]): Software[] {
  return ids.map((id) => matchSoftware(software, id)).filter((s): s is Software => Boolean(s));
}

/** 判断目标 id 是否代表一个"可用"软件(已安装、未弃用、未删除、有路径) */
export function isSoftwareAvailable(
  software: Software[],
  targetId: string,
): boolean {
  const s = matchSoftware(software, targetId);
  return !!s && !s.uninstalled && !s.deleted && !!s.path;
}

/**
 * 在工作流/收藏快照里查找元数据。优先按 softwareId 精确匹配,
 * 其次按 bundleId 跨平台匹配(快照里可能带 bundleId 字段)。
 */
export function findMetaSnapshot(
  meta: SoftwareMetaSnapshot[] | undefined,
  softwareId: string,
): SoftwareMetaSnapshot | undefined {
  if (!meta) return undefined;
  const byId = meta.find((m) => m.softwareId === softwareId);
  if (byId) return byId;
  const byBundle = meta.find(
    (m) => !!m.bundleId && m.bundleId === softwareId,
  );
  if (byBundle) return byBundle;
  return undefined;
}
