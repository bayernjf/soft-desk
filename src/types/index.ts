export interface Software {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: SoftwareCategory;
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
  uninstalled?: boolean;
  deleted?: boolean;
  aiDescription?: string;
  /** 跨平台 bundleId(Mac CFBundleIdentifier / Windows 伪 bundleId),用于跨设备匹配 */
  bundleId?: string;
}

export type SoftwareCategory =
  | 'dev-tools'
  | 'design'
  | 'productivity'
  | 'communication'
  | 'browsers'
  | 'utilities'
  | 'media'
  | 'security';

export interface CategoryMeta {
  id: SoftwareCategory;
  name: string;
  icon: string;
  color: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  softwareIds: string[];
  /** 创建/更新工作流时缓存的软件元数据(名称/图标/颜色/分类),
   *  用于在软件被卸载或跨设备缺失时,仍能像收藏夹一样显示名称+图标并置灰标记「未安装」 */
  softwareMeta?: SoftwareMetaSnapshot[];
  usageCount: number;
  lastUsed: string;
  isFavorite: boolean;
  color: string;
  updatedAt: string;
}

export interface SoftwareMetaSnapshot {
  softwareId: string;
  name: string;
  icon?: string;
  color?: string;
  category?: SoftwareCategory;
  /** 跨平台 bundleId(Mac CFBundleIdentifier / Windows 伪 bundleId),
   *  用于跨设备同步时按 bundleId 兜底匹配,解决 Mac↔Windows id 不一致问题 */
  bundleId?: string;
}

export interface FavoriteGroup {
  id: string;
  name: string;
  softwareIds: string[];
  createdAt: string;
}

export interface SearchState {
  query: string;
  results: Software[];
  recentSearches: string[];
}

export type RadialItemType = 'app' | 'workflow';

export interface RadialItem {
  /** 扇区位置,0 在正上方(12 点钟),顺时针递增;固定槽位避免拖拽时跳变 */
  slot: number;
  type: RadialItemType;
  /** app → softwareId;workflow → workflowId */
  targetId: string;
  /** 配置时写入的名称快照;跨设备该项不可用时仍可用于灰显 */
  name?: string;
  /** 配置时写入的图标快照(data URL);跨设备该项不可用时仍可用于灰显 */
  icon?: string;
  /** 配置时写入的颜色快照 */
  color?: string;
}

/** 主进程下发给径向窗口渲染层的扇区项(已带展示所需的名称/图标/颜色) */
export interface RadialRenderItem extends RadialItem {
  name: string;
  /** 应用图标 data URL 或本地图标路径;无则渲染首字母占位 */
  icon?: string;
  color?: string;
  /** 跨设备时该软件/工作流在本机不可用(未安装等):扇区置灰、禁止启动 */
  unavailable?: boolean;
}

export interface RadialOpenPayload {
  /** 光标在径向窗口内的局部坐标(已扣除显示器原点) */
  cursor: { x: number; y: number };
  sectors: number;
  items: RadialRenderItem[];
  /** 是否展示「最近使用」页(用户开关) */
  showRecent?: boolean;
  /** 最近使用页的扇区项(已按 lastUsed 倒序、不超过 sectors 数);
   *  slot 取值 0..sectors-1(局部下标,不与 items 复用槽位编码) */
  recentItems?: RadialRenderItem[];
  /** 视觉风格(由设置面板选择);旧版本/缺省视作 'default' */
  style?: RadialStyle;
}

/** 径向菜单视觉风格:
 *  - default  当前默认深色卡片
 *  - glass    玻璃拟态(macOS / Win11 Mica)
 *  - neumorph 新拟物(凸起按键)
 *  - neon     霓虹发光
 *  - material 分层卡片(花瓣式)
 *  - minimal  极简光带 */
export type RadialStyle = 'default' | 'glass' | 'neumorph' | 'neon' | 'material' | 'minimal';

export interface RadialMenuConfig {
  enabled: boolean;
  /** 全局热键,Electron accelerator 格式,如 'CommandOrControl+Shift+R' */
  hotkey: string;
  /** 是否允许按下鼠标中键(滚轮)唤出(需 macOS 辅助功能权限 + 原生监听) */
  mouseWheelToggle: boolean;
  /** 扇区数量(决定每个扇区角度 = 360/sectors) */
  sectors: 4 | 6 | 8;
  items: RadialItem[];
  /** 是否在径向菜单中追加「最近使用」页(数据源 Software.lastUsed) */
  showRecent: boolean;
  /** 视觉风格:旧配置缺省时按 'default' 处理 */
  style?: RadialStyle;
  /** 最后修改时间(ISO);云同步冲突按时间戳后写胜出 */
  updatedAt?: string;
}

/**
 * 渲染层 resolve 后同步给主进程的扇区项:既含展示信息(name/icon/color),
 * 也含启动信息(appPath / workflowPaths)。主进程缓存完整版,下发渲染层时剔除路径,
 * 启动时用 appPath/workflowPaths 但仍经扫描白名单二次校验。
 */
export interface RadialSyncItem extends RadialRenderItem {
  /** type==='app' 时的可执行路径 */
  appPath?: string;
  /** type==='workflow' 时各子应用的路径 */
  workflowPaths?: string[];
  /** 仅 appCatalog 项使用:用于主进程按最近使用倒序选取 top-N */
  lastUsed?: string;
}

export interface RadialSyncConfig {
  enabled: boolean;
  hotkey: string;
  mouseWheelToggle: boolean;
  sectors: number;
  items: RadialSyncItem[];
  /** 是否在径向菜单中追加「最近使用」页(主进程据此决定 open 时是否构造 recentItems) */
  showRecent?: boolean;
  /** 视觉风格(透传给径向窗口) */
  style?: RadialStyle;
  /** 全量已 resolve 的软件目录(类型=app,带 appPath/icon/name),
   *  仅在 showRecent 为 true 时由渲染层下发,主进程据此挑选 top-N 最近使用 */
  appCatalog?: RadialSyncItem[];
}
