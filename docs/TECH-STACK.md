# SoftDesk 技术栈全景

本文档完整记录 **soft-desk**（桌面客户端）和 **soft-desk-landing**（官网落地页）两个项目的技术栈，覆盖前端、后端、构建、部署、运维全链路。

---

## 一、SoftDesk 桌面客户端

### 1.1 核心框架

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **桌面框架** | Electron | ^31.7.7 | 跨平台桌面应用壳，主进程 + 渲染进程双进程架构 |
| **前端框架** | React | ^18.3.1 | UI 渲染，使用函数组件 + Hooks |
| **开发语言** | TypeScript | ~5.8.3 | 全栈类型安全，JSX 使用 `react-jsx` 模式 |
| **构建工具** | Vite | ^6.3.5 | 前端构建 + 开发服务器，ESM-first |
| **打包工具** | electron-builder | ^24.13.3 | 跨平台安装包构建（dmg/exe/zip） |
| **自动更新** | electron-updater | ^6.8.9 | 基于 GitHub Releases 的增量更新 |

### 1.2 主进程（Electron Main）

| 分类 | 技术 / 模块 | 路径 | 用途 |
|------|------------|------|------|
| **主进程入口** | main.ts | [electron/main.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/main.ts) | 窗口管理、托盘、IPC 路由 |
| **预加载脚本** | preload.ts | [electron/preload.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/preload.ts) | 安全的渲染进程 ↔ 主进程桥接 |
| **本地数据库** | better-sqlite3 | ^12.11.1 | 同步 SQLite，存储软件列表、使用记录、图标缓存 |
| **全局快捷键** | uiohook-napi | ^1.5.5 | 系统级全局快捷键监听（径向菜单触发） |
| **WebSocket** | ws | ^8.21.0 | 主进程 ↔ 渲染进程实时通信（扫描进度等） |
| **macOS 扫描** | scanner.ts | [electron/scanner.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/scanner.ts) | Spotlight + LSApplicationCategoryType + 自定义分类 |
| **Windows 扫描** | scanner-win.ts | [electron/scanner-win.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/scanner-win.ts) | 注册表 + 开始菜单 + Win32 ExtractIconEx P/Invoke |
| **窗口定位** | window-locator.ts | [electron/window-locator.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/window-locator.ts) | Windows 下聚焦已运行应用窗口 |
| **认证模块** | auth.ts | [electron/auth.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/auth.ts) | Supabase 认证、会话管理 |
| **数据库模块** | database.ts | [electron/database.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/database.ts) | better-sqlite3 封装、表结构管理 |
| **AI 模块** | ai.ts | [electron/ai.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/ai.ts) | AI 智能分类、软件描述生成 |
| **更新模块** | updater.ts | [electron/updater.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/updater.ts) | electron-updater 封装、状态管理 |
| **使用监控** | monitor.ts | [electron/monitor.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/monitor.ts) | 前台应用追踪、使用时长统计 |
| **日志** | logger.ts | [electron/lib/logger.ts](file:///Users/jiangfeng/000mycodes/soft-desk/electron/lib/logger.ts) | 分级日志，主进程统一日志 |

### 1.3 渲染进程（React 前端）

#### 状态管理 & 路由

| 技术 | 版本 | 用途 |
|------|------|------|
| **Zustand** | ^5.0.3 | 轻量状态管理：软件列表、设置、认证三个 store |
| **react-router-dom** | ^7.3.0 | 客户端路由，支持 URL query 深链定位 tab |

#### 样式 & UI

| 技术 | 版本 | 用途 |
|------|------|------|
| **Tailwind CSS** | ^3.4.17 | 原子化 CSS，class 模式暗黑主题 |
| **lucide-react** | ^0.511.0 | 图标库，统一 SVG 图标 |
| **clsx** | ^2.1.1 | className 条件拼接 |
| **tailwind-merge** | ^3.0.2 | Tailwind class 冲突合并 |

#### 数据可视化

| 技术 | 版本 | 用途 |
|------|------|------|
| **recharts** | ^3.8.1 | 使用时长热力图、时段分布图 |

#### 工具库

| 技术 | 版本 | 用途 |
|------|------|------|
| **pinyin-pro** | ^3.28.1 | 中文拼音排序、拼音搜索匹配 |
| **qrcode** | ^1.5.4 | 分享二维码生成 |
| **@supabase/supabase-js** | ^2.108.2 | 云端同步（收藏、工作流、径向菜单、AI 配置） |

#### 页面结构

| 页面 | 路径 | 说明 |
|------|------|------|
| Dashboard | [src/pages/Dashboard.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/Dashboard.tsx) | 首页 + 智能推荐 |
| Library | [src/pages/Library.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/Library.tsx) | 软件库（全部分类） |
| Favorites | [src/pages/Favorites.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/Favorites.tsx) | 收藏分组 |
| Workflows | [src/pages/Workflows.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/Workflows.tsx) | 工作流管理 |
| Statistics | [src/pages/Statistics.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/Statistics.tsx) | 使用统计 |
| Settings | [src/pages/Settings.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/Settings.tsx) | 设置（外观/通知/径向菜单/数据/隐私/AI/帮助/关于） |
| Account | [src/pages/Account.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/Account.tsx) | 账号管理 |
| SharePreview | [src/pages/SharePreview.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/SharePreview.tsx) | 分享导入预览 |
| Uninstall | [src/pages/Uninstall.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/Uninstall.tsx) | 卸载清理 |
| MyShares | [src/pages/MyShares.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/pages/MyShares.tsx) | 我的分享 |

#### 核心组件

| 组件 | 路径 | 说明 |
|------|------|------|
| QuickLauncher | [src/components/features/QuickLauncher.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/QuickLauncher.tsx) | 快速启动器（Cmd+Space） |
| RadialMenu | [src/components/features/RadialMenu.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/RadialMenu.tsx) | 径向菜单（圆形扇形布局） |
| WorkflowEditorModal | [src/components/features/WorkflowEditorModal.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/WorkflowEditorModal.tsx) | 工作流编辑器 |
| ShareDialog | [src/components/features/ShareDialog.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/ShareDialog.tsx) | 分享对话框 |
| UpdateSection | [src/components/features/UpdateSection.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/UpdateSection.tsx) | 应用更新面板 |
| AiModelsSection | [src/components/features/AiModelsSection.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/AiModelsSection.tsx) | AI 模型配置 |
| SmartRecommendations | [src/components/features/SmartRecommendations.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/SmartRecommendations.tsx) | 智能推荐 |
| AppIcon | [src/components/features/AppIcon.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/AppIcon.tsx) | 软件图标渲染（缓存 + 兜底） |
| SoftwareCard | [src/components/features/SoftwareCard.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/SoftwareCard.tsx) | 软件卡片 |
| SoftwareCardTooltip | [src/components/features/SoftwareCardTooltip.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/SoftwareCardTooltip.tsx) | 软件卡片悬浮提示 |
| UsageHeatmap | [src/components/features/UsageHeatmap.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/UsageHeatmap.tsx) | 使用热力图 |
| TimeSegmentChart | [src/components/features/TimeSegmentChart.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/TimeSegmentChart.tsx) | 时段分布图 |
| LazyMount | [src/components/features/LazyMount.tsx](file:///Users/jiangfeng/000mycodes/soft-desk/src/components/features/LazyMount.tsx) | 延迟挂载优化 |

#### 服务层

| 服务 | 路径 | 说明 |
|------|------|------|
| software.service | [src/services/software.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/software.service.ts) | 软件数据处理 |
| software-matching | [src/services/software-matching.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/software-matching.ts) | 跨平台软件匹配（id + bundleId + 名字归一化） |
| favorites.service | [src/services/favorites.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/favorites.service.ts) | 收藏分组管理 |
| workflows.service | [src/services/workflows.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/workflows.service.ts) | 工作流管理 |
| radial.service | [src/services/radial.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/radial.service.ts) | 径向菜单配置 |
| radial-config.service | [src/services/radial-config.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/radial-config.service.ts) | 径向菜单持久化 |
| ai.service | [src/services/ai.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/ai.service.ts) | AI 功能调用 |
| ai-configs.service | [src/services/ai-configs.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/ai-configs.service.ts) | AI 模型配置同步 |
| shares.service | [src/services/shares.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/shares.service.ts) | 分享功能 |
| share-serializer | [src/services/share-serializer.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/share-serializer.ts) | 分享数据序列化/反序列化 |
| analytics.service | [src/services/analytics.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/analytics.service.ts) | 使用统计计算 |
| recommendation.service | [src/services/recommendation.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/recommendation.service.ts) | 智能推荐算法 |
| description.service | [src/services/description.service.ts](file:///Users/jiangfeng/000mycodes/soft-desk/src/services/description.service.ts) | 软件描述生成 |

### 1.4 云服务

| 服务 | 提供方 | 用途 |
|------|--------|------|
| **Supabase Auth** | Supabase | 用户认证（邮箱/第三方登录） |
| **Supabase Database** | Supabase | PostgreSQL 云端数据库 |
| **Supabase Storage** | Supabase | 分享文件存储 |
| **Realtime** | Supabase | 多设备实时同步 |
| **RLS** | Supabase | 行级安全策略 |

### 1.5 构建 & 打包

#### 构建配置

| 文件 | 说明 |
|------|------|
| [vite.config.ts](file:///Users/jiangfeng/000mycodes/soft-desk/vite.config.ts) | Vite 配置，含 vite-plugin-electron + vite-plugin-electron-renderer |
| [tsconfig.json](file:///Users/jiangfeng/000mycodes/soft-desk/tsconfig.json) | TypeScript 配置（项目引用模式） |
| [tailwind.config.js](file:///Users/jiangfeng/000mycodes/soft-desk/tailwind.config.js) | Tailwind 配置（自定义主题色） |
| [postcss.config.js](file:///Users/jiangfeng/000mycodes/soft-desk/postcss.config.js) | PostCSS 配置 |
| [eslint.config.js](file:///Users/jiangfeng/000mycodes/soft-desk/eslint.config.js) | ESLint Flat Config |

#### 打包配置（electron-builder）

| 平台 | 产物格式 | 图标 |
|------|---------|------|
| macOS | `.dmg` + `.zip` | `build/icon.icns` |
| Windows | `.exe` (NSIS) | `build/icon.png` |

配置在 [package.json](file:///Users/jiangfeng/000mycodes/soft-desk/package.json#L71-L121) 的 `build` 字段。

#### 构建脚本

| 脚本 | 命令 | 说明 |
|------|------|------|
| `dev` | `vite` | 开发模式，热更新 |
| `restart` | 杀进程 + dev | 解决 Electron 进程残留 |
| `build` | `tsc -b && vite build` | 生产构建 |
| `dist` | build + electron-builder | 全平台打包 |
| `dist:mac` | build + electron-builder --mac | Mac 打包 |
| `dist:win` | build + electron-builder --win | Win 打包 |
| `check` | `tsc -b --noEmit` | 类型检查 |
| `lint` | `eslint .` | 代码检查 |
| `test` | `vitest run` | 单元测试 |
| `rebuild` | electron-rebuild | 原生模块重编译 |
| `postinstall` | install-app-deps | 安装后自动重建原生模块 |

### 1.6 CI/CD

| Workflow | 文件 | 触发条件 | 作用 |
|----------|------|---------|------|
| CI | [ci.yml](file:///Users/jiangfeng/000mycodes/soft-desk/.github/workflows/ci.yml) | PR + push (main/dev) | 双端 lint/check/test/build |
| Build macOS | [build-mac.yml](file:///Users/jiangfeng/000mycodes/soft-desk/.github/workflows/build-mac.yml) | 手动 + push (main/dev, 路径过滤) | Mac 安装包构建 |
| Build Windows | [build-win.yml](file:///Users/jiangfeng/000mycodes/soft-desk/.github/workflows/build-win.yml) | 手动 + push (main/dev, 路径过滤) | Win 安装包构建 |
| Release | [release.yml](file:///Users/jiangfeng/000mycodes/soft-desk/.github/workflows/release.yml) | v* tag + push (main/dev) | 正式发版 + Dev Snapshot |

#### CI 特性

- **并发控制**：同分支/同 PR 多次触发自动取消（`cancel-in-progress: true`）
- **超时控制**：每个 job 有 `timeout-minutes` 限制
- **权限最小化**：`permissions: contents: read`（Release 为 write）
- **路径过滤**：打包 workflow 只在代码改动时触发（文档改动跳过）
- **Node 版本**：24 LTS

### 1.7 项目架构

```
soft-desk/
├── electron/              # 主进程（Node.js + Electron API）
│   ├── main.ts            # 入口
│   ├── preload.ts         # 预加载脚本（安全桥接）
│   ├── scanner.ts         # macOS 软件扫描
│   ├── scanner-win.ts     # Windows 软件扫描
│   ├── database.ts        # SQLite 数据库
│   ├── auth.ts            # 认证
│   ├── ai.ts              # AI 功能
│   ├── updater.ts         # 自动更新
│   ├── monitor.ts         # 使用监控
│   ├── window-locator.ts  # 窗口定位（Win）
│   └── lib/               # 工具库
├── src/                   # 渲染进程（React）
│   ├── pages/             # 页面
│   ├── components/        # 组件
│   ├── services/          # 业务服务
│   ├── stores/            # Zustand 状态
│   ├── hooks/             # 自定义 Hook
│   ├── lib/               # 工具函数
│   ├── data/              # 静态数据
│   ├── types/             # 类型定义
│   └── ...
├── build/                 # 构建资源（图标等）
├── scripts/               # 构建脚本
│   ├── after-pack.mjs     # 打包后钩子（Spotlight 索引排除）
│   └── build-tray-icon.mjs # 托盘图标生成
├── .github/workflows/     # CI 配置
└── package.json           # 依赖 + electron-builder 配置
```

---

## 二、SoftDesk Landing 官网落地页

### 2.1 核心框架

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **前端框架** | React | ^18.3.1 | UI 渲染 |
| **开发语言** | TypeScript | ~5.8.3 | 类型安全 |
| **构建工具** | Vite | ^6.3.5 | 前端构建 + 开发服务器 |
| **部署平台** | Cloudflare Pages + Vercel | - | 双平台并行部署 |

### 2.2 前端技术栈

#### 状态管理 & 路由

| 技术 | 版本 | 用途 |
|------|------|------|
| **Zustand** | ^5.0.3 | 轻量状态管理 |
| **react-router-dom** | ^7.3.0 | 客户端路由，SPA |

#### 样式 & UI

| 技术 | 版本 | 用途 |
|------|------|------|
| **Tailwind CSS** | ^3.4.17 | 原子化 CSS，class 模式暗黑主题，自定义品牌色 |
| **lucide-react** | ^0.511.0 | 图标库 |
| **clsx** | ^2.1.1 | className 条件拼接 |
| **tailwind-merge** | ^3.0.2 | Tailwind class 冲突合并 |

#### 数据可视化

| 技术 | 版本 | 用途 |
|------|------|------|
| **recharts** | ^3.8.1 | 图表组件（统计页面） |

### 2.3 埋点 & 分析

| 服务 | 用途 | 实现 |
|------|------|------|
| **Google Analytics 4** | 页面浏览、事件追踪、滚动深度 | 自定义 SDK，仅生产环境加载 |
| **Microsoft Clarity** | 会话录像、热图 | 自定义 SDK，仅生产环境加载 |

埋点 SDK 在 [src/lib/analytics.ts](file:///Users/jiangfeng/000mycodes/soft-desk-landing/src/lib/analytics.ts)，支持：
- 页面浏览追踪（SPA 路由切换）
- 自定义事件
- 滚动深度追踪（25% / 50% / 75% / 100%）
- Section 进入视口追踪
- 用户属性设置
- 开发环境仅 console.debug，不发真实数据

### 2.4 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| **@vitejs/plugin-react** | ^4.4.1 | React + Babel 支持 |
| **babel-plugin-react-dev-locator** | ^1.0.0 | 开发时点击元素跳转到源码 |
| **vite-plugin-trae-solo-badge** | ^1.0.0 | 生产环境 Solo 徽章 |
| **vite-tsconfig-paths** | ^5.1.4 | tsconfig 路径别名（`@/*`） |
| **ESLint** | ^9.25.0 | 代码质量检查（Flat Config） |
| **typescript-eslint** | ^8.30.1 | TypeScript ESLint 插件 |
| **eslint-plugin-react-hooks** | ^5.2.0 | React Hooks 规则 |
| **eslint-plugin-react-refresh** | ^0.4.19 | Fast Refresh 规则 |
| **autoprefixer** | ^10.4.21 | CSS 前缀补全 |
| **postcss** | ^8.5.3 | CSS 处理 |

### 2.5 部署

#### 部署平台

| 平台 | 用途 | 部署方式 |
|------|------|---------|
| **Cloudflare Pages** | 主部署，全球 CDN | Wrangler CLI |
| **Vercel** | 备用部署，Preview | Vercel CLI (prebuilt 模式) |

#### 路由配置

- Cloudflare Pages: SPA fallback 通过 `public/_redirects`
- Vercel: SPA rewrite 通过 `vercel.json`

### 2.6 CI/CD

| Workflow | 文件 | 触发条件 | 作用 |
|----------|------|---------|------|
| Deploy | [deploy.yml](file:///Users/jiangfeng/000mycodes/soft-desk-landing/.github/workflows/deploy.yml) | PR + push (main/dev) | CI + 双平台部署 |

#### 部署环境

| 环境 | 触发分支 | 部署平台 |
|------|---------|---------|
| Preview | PR | Cloudflare Pages + Vercel（PR 评论回传 URL） |
| Staging | `dev` | Cloudflare Pages + Vercel |
| Production | `main` | Cloudflare Pages + Vercel |

#### CI 阶段

1. **ci-check**：lint + type check
2. **build**：生产构建（注入 GA / Clarity ID）
3. **preview-deploy** / **deploy-staging** / **deploy-production**：按事件类型选择部署

### 2.7 项目结构

```
soft-desk-landing/
├── src/
│   ├── pages/             # 页面
│   ├── components/        # 组件
│   │   ├── features/      # 业务组件
│   │   └── layout/        # 布局组件
│   ├── hooks/             # 自定义 Hook
│   ├── lib/               # 工具（analytics, utils）
│   ├── services/          # 业务服务
│   ├── stores/            # Zustand 状态
│   ├── data/              # 静态数据（mock + 分类）
│   ├── types/             # 类型定义
│   ├── App.tsx            # 根组件
│   ├── main.tsx           # 入口
│   └── router.tsx         # 路由配置
├── public/                # 静态资源
│   ├── favicon.svg
│   └── _redirects         # Cloudflare Pages SPA fallback
├── .github/workflows/     # CI 配置
├── vercel.json            # Vercel 配置
├── vite.config.ts         # Vite 配置
├── tailwind.config.js     # Tailwind 配置（自定义品牌色）
├── tsconfig.json          # TypeScript 配置
├── eslint.config.js       # ESLint 配置
└── package.json           # 依赖
```

---

## 三、共享技术栈 & 设计规范

### 3.1 共享依赖

两个项目共用的技术选型：

| 技术 | 版本 | 说明 |
|------|------|------|
| React | ^18.3.1 | UI 框架 |
| TypeScript | ~5.8.3 | 类型系统 |
| Vite | ^6.3.5 | 构建工具 |
| Tailwind CSS | ^3.4.17 | 样式方案 |
| Zustand | ^5.0.3 | 状态管理 |
| react-router-dom | ^7.3.0 | 路由 |
| lucide-react | ^0.511.0 | 图标 |
| recharts | ^3.8.1 | 图表 |
| clsx + tailwind-merge | ^2.1.1 / ^3.0.2 | className 工具 |
| ESLint + typescript-eslint | ^9.25.0 / ^8.30.1 | 代码质量 |
| vite-tsconfig-paths | ^5.1.4 | 路径别名（`@/*`） |

### 3.2 设计规范

| 项目 | 主色调 | 背景风格 | 圆角风格 |
|------|--------|---------|---------|
| **SoftDesk 桌面端** | 紫罗兰 + 品红渐变 | 深色 slate 色系 | 大圆角（2xl） |
| **SoftDesk Landing** | 品牌紫 primary + 粉 accent + 橙 amber | GitHub 暗色 surface 色系 | 中等圆角（xl/2xl） |

### 3.3 代码规范

- **提交规范**：Conventional Commits（feat/fix/docs/chore/refactor/test/style/perf/ci）
- **分支策略**：`feature/*` → `dev` → `main`，main 仅接受 PR
- **代码风格**：ESLint 统一，Tailwind 原子类排序
- **类型安全**：TypeScript strict 模式（桌面端）

---

## 四、技术选型决策记录

| 决策 | 选型 | 原因 |
|------|------|------|
| 桌面框架 | Electron (not Tauri) | 成熟原生模块生态（better-sqlite3 / uiohook-napi），JS/TS 全栈，无需 Rust |
| 状态管理 | Zustand (not Redux) | 轻量、少样板代码、适合中等规模应用 |
| 本地数据库 | better-sqlite3 | 同步 API、性能好、Electron 原生模块成熟 |
| 构建工具 | Vite (not Webpack) | 开发速度快、ESM-first、配置简单 |
| 样式方案 | Tailwind CSS | 原子化、无需命名、跨项目一致 |
| 图标 | lucide-react | 开源、统一风格、树摇友好 |
| 图表 | recharts | React 原生、声明式、社区活跃 |
| 云服务 | Supabase | PostgreSQL + Auth + Storage + Realtime 一站式，RLS 安全 |
| 部署平台 | Cloudflare + Vercel 双部署 | 全球边缘、构建快、互为备份 |
| 埋点方案 | GA4 + Clarity 自定义 SDK | 轻量、按需加载、开发环境无污染 |
