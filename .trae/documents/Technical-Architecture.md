# SoftDesk 技术架构文档

## 1. 架构设计概览

SoftDesk 采用 Electron 跨平台桌面应用框架，前端使用 React + TailwindCSS 构建现代化 UI，后端利用 Node.js 原生能力实现系统级功能。

### 1.1 技术架构分层

```mermaid
flowchart TB
    subgraph UI["前端 UI 层"]
        A[React 组件库]
        B[TailwindCSS 样式系统]
        C[Lucide Icons 图标库]
        D[Recharts 数据图表]
    end

    subgraph Core["Electron 主进程"]
        E[IPC 通信层]
        F[窗口管理器]
        G[系统托盘管理]
    end

    subgraph Platform["平台适配层"]
        H[Windows 适配器]
        I[macOS 适配器]
    end

    subgraph Data["数据层"]
        J[SQLite 本地数据库]
        K[软件元数据缓存]
        L[使用记录存储]
    end

    subgraph AI["AI 推理层"]
        M[本地分类引擎]
        N[云端 LLM 接口]
        O[语义嵌入模型]
    end

    subgraph Monitor["行为感知层"]
        P[进程监听服务]
        Q[窗口焦点追踪]
        R[使用时长统计]
    end

    UI --> E
    E --> Platform
    E --> Data
    E --> AI
    Platform --> Monitor
    Monitor --> Data
    Data --> AI
```

### 1.2 目录结构

```
softdesk/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 入口文件
│   │   ├── ipc/                 # IPC 通信处理
│   │   │   ├── software.ts      # 软件扫描相关
│   │   │   ├── usage.ts         # 使用追踪相关
│   │   │   └── launch.ts        # 软件启动相关
│   │   ├── platform/            # 平台适配
│   │   │   ├── windows.ts       # Windows 实现
│   │   │   └── macos.ts         # macOS 实现
│   │   ├── services/            # 核心服务
│   │   │   ├── scanner.ts       # 软件扫描服务
│   │   │   ├── classifier.ts    # AI 分类服务
│   │   │   ├── monitor.ts       # 行为监控服务
│   │   │   └── database.ts      # 数据库服务
│   │   └── tray.ts              # 系统托盘
│   │
│   ├── renderer/                # React 渲染进程
│   │   ├── App.tsx              # 根组件
│   │   ├── components/          # UI 组件
│   │   │   ├── Sidebar/         # 侧边栏
│   │   │   ├── SoftwareGrid/    # 软件卡片网格
│   │   │   ├── SearchBar/       # 搜索框
│   │   │   ├── StatsPanel/      # 统计面板
│   │   │   └── UninstallList/   # 卸载列表
│   │   ├── pages/               # 页面
│   │   │   ├── Dashboard/       # 工作台首页
│   │   │   ├── AllSoftware/     # 全部软件
│   │   │   ├── Statistics/      # 统计分析
│   │   │   └── Settings/        # 设置页面
│   │   ├── hooks/               # 自定义 Hooks
│   │   ├── stores/             # 状态管理
│   │   └── styles/             # 全局样式
│   │
│   └── shared/                  # 共享类型定义
│       └── types.ts             # TypeScript 类型
│
├── public/                      # 静态资源
│   └── assets/                  # 图片资源
│
├── electron-builder.json        # 打包配置
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

---

## 2. 技术选型

### 2.1 核心技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | ^28.0.0 | 跨平台桌面应用框架 |
| React | ^18.2.0 | UI 组件库 |
| TypeScript | ^5.3.0 | 类型安全 |
| Vite | ^5.0.0 | 构建工具 |
| TailwindCSS | ^3.4.0 | 原子化 CSS |
| better-sqlite3 | ^9.0.0 | 本地数据库 |
| Lucide React | ^0.300.0 | 图标库 |
| Recharts | ^2.10.0 | 数据图表 |
| electron-store | ^8.1.0 | 配置存储 |

### 2.2 AI 能力

| 能力 | 实现方式 | 说明 |
|------|---------|------|
| 软件分类 | 云端 LLM API | GPT-4 / Claude / DeepSeek，按软件名称调用 |
| 自然语言搜索 | 云端 LLM API | 将用户查询转为软件属性匹配 |
| 本地离线模式 | 本地嵌入模型（可选） | ONNX 量化模型，<50MB，支持离线分类 |

---

## 3. 路由设计

| 路由 | 页面 | 功能 |
|------|------|------|
| `/` | 工作台首页 | AI 分类展示 + 使用概览 + 快捷启动 |
| `/all` | 全部软件 | 所有软件列表，支持筛选排序 |
| `/category/:name` | 分类页面 | 按分类展示软件 |
| `/stats` | 统计分析 | 使用时长图表 + 数据看板 |
| `/uninstall` | 卸载管理 | 可卸载软件列表 + 批量操作 |
| `/settings` | 设置页面 | 基本设置 + AI 模式 + 隐私选项 |

---

## 4. IPC 通信接口

### 4.1 主进程 → 渲染进程

| 通道 | 用途 | 数据格式 |
|------|------|---------|
| `software:scanned` | 软件扫描完成 | `Software[]` |
| `software:classified` | AI 分类完成 | `Category[]` |
| `usage:updated` | 使用数据更新 | `UsageRecord[]` |
| `app:error` | 应用错误 | `{ code, message }` |

### 4.2 渲染进程 → 主进程

| 通道 | 用途 | 参数 |
|------|------|------|
| `software:scan` | 触发软件扫描 | 无 |
| `software:launch` | 启动软件 | `{ path: string }` |
| `software:search` | 自然语言搜索 | `{ query: string }` |
| `usage:getStats` | 获取使用统计 | `{ period: 'day' \| 'week' \| 'month' }` |
| `uninstall:execute` | 执行卸载 | `{ paths: string[] }` |
| `settings:update` | 更新设置 | `{ key: string, value: any }` |

---

## 5. 数据模型

### 5.1 数据实体

```typescript
// 软件实体
interface Software {
  id: string;                    // 唯一标识
  name: string;                   // 软件名称
  path: string;                   // 可执行文件路径
  icon: string;                   // 图标路径/base64
  category: string;               // AI 分类名称
  version?: string;               // 版本号
  publisher?: string;             // 发行商
  size?: number;                  // 安装大小(bytes)
  installDate?: string;           // 安装日期
  lastUsed?: string;              // 最后使用时间
  launchCount: number;            // 启动次数
  totalUsageTime: number;         // 累计使用时长(秒)
}

// 使用记录
interface UsageRecord {
  softwareId: string;
  date: string;                  // YYYY-MM-DD
  launchCount: number;
  usageTime: number;              // 秒
  sessions: Session[];            // 使用时段
}

// 使用时段
interface Session {
  startTime: string;             // ISO 时间
  endTime: string;
  duration: number;              // 秒
}

// AI 分类
interface Category {
  id: string;
  name: string;                  // 分类名称
  icon: string;                  // 分类图标
  color: string;                 // 分类颜色
  softwareIds: string[];          // 该分类下的软件ID
  order: number;                 // 显示顺序
}

// 用户设置
interface Settings {
  theme: 'dark' | 'light' | 'system';
  startWithSystem: boolean;       // 开机启动
  runInBackground: boolean;       // 后台运行
  aiMode: 'cloud' | 'local' | 'off'; // AI 模式
  idleThreshold: number;         // 空闲阈值(秒)，超过后暂停计时
  zombieDays: number;            // 僵尸软件判定天数
}
```

### 5.2 数据库表结构

```sql
-- 软件表
CREATE TABLE software (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT UNIQUE NOT NULL,
  icon TEXT,
  category TEXT DEFAULT '未分类',
  version TEXT,
  publisher TEXT,
  size INTEGER,
  install_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 使用记录表
CREATE TABLE usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  software_id TEXT NOT NULL,
  date TEXT NOT NULL,
  launch_count INTEGER DEFAULT 0,
  usage_time INTEGER DEFAULT 0,
  FOREIGN KEY (software_id) REFERENCES software(id),
  UNIQUE(software_id, date)
);

-- 使用时段表
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  software_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration INTEGER DEFAULT 0,
  FOREIGN KEY (software_id) REFERENCES software(id)
);

-- 分类表
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  color TEXT,
  display_order INTEGER DEFAULT 0
);

-- 设置表
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 索引
CREATE INDEX idx_usage_date ON usage_records(date);
CREATE INDEX idx_usage_software ON usage_records(software_id);
CREATE INDEX idx_sessions_software ON sessions(software_id);
CREATE INDEX idx_sessions_date ON sessions(date);
```

---

## 6. 核心服务设计

### 6.1 软件扫描服务

```typescript
// 伪代码：扫描流程
class ScannerService {
  async scan(): Promise<Software[]> {
    const platform = this.getPlatform(); // 'windows' | 'macos'

    if (platform === 'windows') {
      // 1. 扫描开始菜单
      const startMenuApps = await this.scanStartMenu();
      // 2. 扫描安装目录
      const installedApps = await this.scanProgramFiles();
      // 3. 扫描注册表（获取更多信息）
      const registryApps = await this.scanRegistry();
      // 4. 合并去重
      return this.mergeAndDedupe([...startMenuApps, ...installedApps, ...registryApps]);
    } else {
      // macOS: 扫描 /Applications 和 ~/Applications
      const applications = await this.scanApplicationsFolder();
      return applications;
    }
  }
}
```

### 6.2 AI 分类服务

```typescript
// 伪代码：分类流程
class ClassifierService {
  async classify(software: Software[]): Promise<Category[]> {
    // 1. 检查缓存
    const cached = await this.getCachedCategories();
    if (cached.length > 0) return cached;

    // 2. 分批调用 AI（避免单次请求过大）
    const batches = this.batch(software, 20);
    const results = [];

    for (const batch of batches) {
      const classification = await this.callAI(batch);
      results.push(...classification);
    }

    // 3. 更新数据库
    await this.updateCategories(results);

    return this.buildCategoryTree(results);
  }

  async callAI(softwareBatch: Software[]): Promise<Classification[]> {
    // 调用云端 LLM 或本地模型
    const prompt = `以下软件的名称和路径，请判断它们的类别：
      ${softwareBatch.map(s => `- ${s.name} (${s.path})`).join('\n')}
      返回 JSON 格式：[{"id": "...", "category": "开发工具"}]`;

    const response = await llm.complete(prompt);
    return JSON.parse(response);
  }
}
```

### 6.3 行为监控服务

```typescript
// 伪代码：使用追踪流程
class MonitorService {
  private activeSoftware: Map<string, Session>;
  private idleTimer: NodeJS.Timeout;

  start() {
    // 每 5 秒检查一次前台窗口
    setInterval(() => this.checkActiveWindow(), 5000);

    // 系统事件监听
    this.on('window-changed', (windowInfo) => this.handleWindowChange(windowInfo));
    this.on('system-idle', () => this.handleIdle());
    this.on('system-active', () => this.handleActive());
  }

  private async checkActiveWindow() {
    const activeWindow = await this.getActiveWindow();

    if (this.isOurTarget(activeWindow)) {
      if (!this.activeSoftware.has(activeWindow.processId)) {
        // 新软件激活，开始计时
        this.startSession(activeWindow);
      }
      // 更新当前活跃时长
      this.updateSession(activeWindow.processId);
    } else {
      // 非目标窗口（如桌面、任务栏），暂停计时
      this.pauseAllSessions();
    }
  }

  private async getActiveWindow() {
    // Windows: GetForegroundWindow + GetWindowText + GetWindowThreadProcessId
    // macOS: NSWorkspace.shared.frontmostApplication
  }
}
```

---

## 7. 打包与发布

### 7.1 electron-builder 配置

```json
{
  "appId": "com.softdesk.app",
  "productName": "SoftDesk",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "dist-electron/**/*"
  ],
  "win": {
    "target": ["nsis"],
    "icon": "build/icon.ico"
  },
  "mac": {
    "target": ["dmg"],
    "icon": "build/icon.icns",
    "category": "public.app-category.utilities"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
}
```

### 7.2 安装包大小预算

| 组成部分 | 预计大小 |
|---------|---------|
| Electron 运行时 | ~80MB |
| React 应用代码 | ~5MB |
| TailwindCSS | ~1MB |
| SQLite 原生模块 | ~3MB |
| 图标/字体资源 | ~5MB |
| **总计（不含 AI 模型）** | **~94MB** |

---

## 8. 安全与隐私

### 8.1 隐私策略

1. **数据本地化**：所有软件信息和使用记录存储在用户本地
2. **最小化上传**：仅在用户明确使用 AI 功能时，上传软件名称字符串
3. **无追踪**：不收集任何用户行为数据用于分析
4. **开源核心**：核心扫描和分类逻辑开源，用户可审计

### 8.2 权限要求

| 平台 | 权限 | 用途 |
|------|------|------|
| Windows | 文件系统读取 | 扫描软件路径 |
| Windows | 注册表读取 | 获取软件元信息 |
| Windows | 进程查询 | 监控使用时长 |
| macOS | 文件系统读取 | 扫描 Applications |
| macOS | Accessibility | 获取前台应用信息 |
| Both | 网络（可选） | 调用云端 AI API |

---

## 9. 开发里程碑

| 阶段 | 时间 | 交付物 |
|------|------|-------|
| Phase 1 | Week 1-2 | 项目初始化 + 软件扫描引擎（Win/macOS） |
| Phase 2 | Week 3 | 本地数据库 + 基础 UI 布局 |
| Phase 3 | Week 4 | AI 分类引擎 + 自然语言搜索（MVP 完成） |
| Phase 4 | Week 5-6 | 使用时长统计 + 可视化面板 |
| Phase 5 | Week 7-8 | 智能工作流 + 月度报告（Pro 功能） |
| Phase 6 | Week 9+ | 深度卸载 + 企业版探索 |
