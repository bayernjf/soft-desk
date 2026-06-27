import type {
  RadialMenuConfig,
  RadialSyncConfig,
  RadialSyncItem,
  Software,
  Workflow,
} from '@/types';

/**
 * 把渲染层的 radial 配置(只存 targetId)resolve 成主进程可用的完整配置:
 * - app: 补 name/icon/color/appPath
 * - workflow: 补 name/color + 各子应用 path(workflowPaths)
 * 无法 resolve(应用已卸载/工作流被删)的扇区直接丢弃,避免下发脏数据。
 *
 * software/workflows 由调用方传入(依赖反转),避免本模块反向 import software.store
 * 造成 software.store ↔ radial.service 的循环依赖(生产构建会因初始化顺序报错)。
 */
export function resolveRadialConfig(
  config: RadialMenuConfig,
  software: Software[],
  workflows: Workflow[]
): RadialSyncConfig {
  const softwareById = new Map(software.map((s) => [s.id, s]));
  const workflowById = new Map(workflows.map((w) => [w.id, w]));

  const items: RadialSyncItem[] = [];
  for (const item of config.items) {
    if (item.type === 'app') {
      const sw = softwareById.get(item.targetId);
      const usable = sw && !sw.uninstalled && !sw.deleted && sw.path;
      if (usable) {
        items.push({
          slot: item.slot,
          type: 'app',
          targetId: item.targetId,
          name: sw.name,
          icon: sw.icon,
          color: sw.color,
          appPath: sw.path,
        });
      } else {
        // 跨设备未安装/已卸载:保留扇区并灰显,用配置时缓存的 name/icon 快照
        items.push({
          slot: item.slot,
          type: 'app',
          targetId: item.targetId,
          name: sw?.name ?? item.name ?? '(不可用)',
          icon: sw?.icon ?? item.icon,
          color: sw?.color ?? item.color,
          unavailable: true,
        });
      }
    } else {
      const wf = workflowById.get(item.targetId);
      if (!wf) {
        // 工作流在本机不存在:灰显
        items.push({
          slot: item.slot,
          type: 'workflow',
          targetId: item.targetId,
          name: item.name ?? '(不可用)',
          color: item.color,
          unavailable: true,
        });
        continue;
      }
      const paths = wf.softwareIds
        .map((sid) => softwareById.get(sid))
        .filter((s) => s && !s.uninstalled && !s.deleted && s.path)
        .map((s) => s!.path);
      items.push({
        slot: item.slot,
        type: 'workflow',
        targetId: item.targetId,
        name: wf.name,
        color: wf.color,
        workflowPaths: paths,
        // 工作流内无任何可启动应用时也视为不可用
        unavailable: paths.length === 0,
      });
    }
  }

  return {
    enabled: config.enabled,
    hotkey: config.hotkey,
    mouseWheelToggle: config.mouseWheelToggle,
    sectors: config.sectors,
    items,
  };
}

/** resolve 后同步进主进程(落盘 + 注册/反注册热键)。返回主进程的注册结果;非 Electron 环境返回 null。 */
export async function syncRadialToMain(
  config: RadialMenuConfig,
  software: Software[],
  workflows: Workflow[]
): Promise<{ success: boolean; hotkeyRegistered?: boolean } | null> {
  if (typeof window === 'undefined' || !window.softdesk?.radialSyncConfig) return null;
  const resolved = resolveRadialConfig(config, software, workflows);
  return window.softdesk.radialSyncConfig(resolved as unknown as RadialMenuConfig);
}
