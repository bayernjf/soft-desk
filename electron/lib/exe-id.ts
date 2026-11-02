import crypto from 'node:crypto';

/**
 * Windows 软件 id：sha1(exe 绝对路径小写) 取前 24 位 hex。
 *
 * scanner-win 扫描目录的软件 id 与 monitor 使用统计的 softwareId 共用这一个公式。
 * 两处必须一致，否则统计/共现/时段分析按 id join 不上软件目录（P1-2 修复链路的一环）。
 * 任何一方要改公式，必须同步另一方与既有本地数据库。
 */
export function exePathToSoftwareId(exePath: string): string {
  return crypto.createHash('sha1').update(exePath.toLowerCase()).digest('hex').slice(0, 24);
}
