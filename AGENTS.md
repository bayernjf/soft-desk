# AGENTS.md — SoftDesk 项目指令

本文档供 AI coding agents（Trae / Claude Code / Cursor / Codex / Copilot 等）在本项目工作时自动读取。
请严格遵循以下约定。

---

## 项目概览

SoftDesk 是一款跨平台本地软件管理与智能启动工具，支持 macOS + Windows 双端。

- **桌面框架**：Electron 31 + React 18 + TypeScript
- **构建工具**：Vite 6 + electron-builder 24
- **包管理器**：npm（**不要用 pnpm/yarn**）
- **测试**：Vitest
- **状态管理**：Zustand
- **云同步/认证**：Supabase
- **本地数据库**：better-sqlite3
- **全局快捷键**：uiohook-napi

### 项目结构

```
soft-desk/
├── electron/               # Electron 主进程
│   ├── main.ts             # 主入口（窗口/托盘/IPC）
│   ├── preload.ts          # preload 脚本（IPC 桥接）
│   ├── scanner.ts          # macOS 软件扫描
│   ├── scanner-win.ts      # Windows 软件扫描
│   ├── database.ts         # 本地数据库（better-sqlite3）
│   ├── auth.ts             # Supabase 认证
│   ├── ai.ts               # AI 软件分类
│   ├── updater.ts          # 自动更新（electron-updater）
│   ├── monitor.ts          # 使用时长监控
│   ├── window-locator.ts   # 已运行窗口聚焦
│   └── lib/logger.ts       # 主进程日志
├── src/                    # React 渲染进程
│   ├── pages/              # 页面组件（Dashboard/Library/Favorites 等）
│   ├── components/         # UI 组件
│   │   ├── features/       # 功能组件（SoftwareCard/RadialMenu 等）
│   │   └── layout/         # 布局组件（Layout/Sidebar）
│   ├── stores/             # Zustand 状态管理
│   ├── services/           # 业务服务层
│   ├── hooks/              # 自定义 hooks
│   ├── lib/                # 工具库（supabase/searchMatch 等）
│   ├── types/              # TypeScript 类型定义
│   └── data/               # 静态数据（分类/AI Provider 等）
├── build/                  # 图标等构建资源
├── scripts/                # 构建脚本（after-pack/tray-icon）
├── docs/                   # 项目文档
├── .github/workflows/      # CI 配置
└── package.json            # 单包配置（非 monorepo）
```

### 平台注意事项

- **主进程 vs 渲染进程**：`electron/` 下是主进程代码，`src/` 下是渲染进程代码。主进程通过 `preload.ts` 暴露的 `window.electronAPI` 与渲染进程通信。
- **跨平台扫描**：`scanner.ts`（macOS）和 `scanner-win.ts`（Windows）是两套独立实现，通过 `CROSS_PLATFORM_RULES` 对齐 bundleId。
- **原生模块**：`better-sqlite3` 和 `uiohook-napi` 需要针对 Electron 版本重编译（`npm run rebuild`）。
- **preload CJS**：preload 用 esbuild 单独打包成纯净 CJS，不要改 vite.config.ts 里的 `preload-force-cjs` 插件逻辑。
- **多入口**：Vite 配置了 3 个入口（main/radial/animation），radial 是径向菜单独立窗口。

---

## 常用命令

所有命令在仓库根目录执行。

### 本地开发

```bash
cp .env.example .env         # 首次：填入 Supabase URL 和 anon key
npm install                  # 安装依赖
npm run dev                  # 启动开发模式（Vite + Electron，热更新）
npm run restart              # 杀掉残留 Electron 进程后重启 dev
```

### 验证（提交前必须通过）

```bash
npm run check                # TypeScript 类型检查（tsc --noEmit）
npm run lint                 # ESLint
npm run test                 # Vitest 单测
npm run build                # 生产构建（tsc + vite build）
```

### 打包

```bash
npm run dist:mac             # 打包 macOS（dmg）
npm run dist:win             # 打包 Windows（exe/nsis）— 需在 Windows 上执行
npm run rebuild              # 重编译原生模块（better-sqlite3/uiohook-napi）
```

---

## 环境变量

- **`.env` 被 .gitignore**，仅 `.env.example` 入库
- 只有一份 `.env`，放在仓库根目录
- 变量前缀：`VITE_`（同时注入到渲染进程和主进程）
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`：Supabase 连接信息
- **不要在前端代码里硬编码 Supabase URL 或 key**

---

## 代码规范

### Commit Message 格式

遵循 `.trae/rules/git-commit-message.md`：

```
<type>(<scope>): <短命令式描述, <=50 字符>

<可选 body：说明改动目的>
```

**type**：`feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `style` / `perf` / `ci`
**scope**：`scanner` / `updater` / `settings` / `ci` / `build` / 具体模块名

**原子提交规则**：
- 按业务模块/文件类型拆分，每个 commit 只做一件事
- docs / config / test / feature / fix 分别独立 commit
- Commit message 用**英文**
- **Never merge unrelated file edits into one commit**

### 通用约定

- 主进程代码放 `electron/`，渲染进程代码放 `src/`，不要混放
- 跨平台逻辑通过 `src/services/software-matching.ts` 的 `matchSoftware` 统一匹配（id → bundleId fallback）
- 新增 IPC 通道时，在 `src/types/electron.d.ts` 里补类型声明
- 前端样式用 Tailwind CSS，不要引入其他 CSS 框架
- Node 版本 24（CI 环境）

---

## Git 工作流

### 分支

| 分支 | 用途 | 触发 CI | 触发 Release |
|------|------|---------|-------------|
| `main` | 生产，**必须 PR review 合并** | ✅ CI + 打包 | ✅ 自动 patch 发版 |
| `dev` | 开发集成 | ✅ CI + 打包 | ✅ Dev Snapshot |
| `feature/*` | 功能/修复分支 | ❌ 不触发 | ❌ |

### 发版机制

| 触发方式 | 行为 | 版本号 | tag | prerelease |
|---------|------|--------|-----|:----------:|
| push `v*` tag（手动） | 正式发布 | 指定版本号 | vX.Y.Z | false |
| push/合并到 `main` | 正式发布，自动 patch 递增 | 最新 tag +0.0.1 | vX.Y.Z | false |
| push 到 `dev` | Dev Snapshot，覆盖式更新 | `0.0.0-dev`（固定） | `snapshot`（固定） | true |

**dev snapshot 覆盖机制**：每次构建前先删除旧的 snapshot release，再重建，保证 assets 始终只有最新的一份。

### 常用指令

#### 「按 git-commit-message.md 推送代码」

1. `git status` 检查改动
2. 按原子规则拆分 commit（参考 `.trae/rules/git-commit-message.md`）
3. `git pull --rebase`（push 前必须先 pull）
4. `git add <具体文件> && git commit -F <msg-file>`（用 -F 避免 shell 转义问题）
5. 重复直到所有改动提交完
6. `git push origin <当前分支>`

#### 「创建 PR」

1. 先验证（check + lint + test）
2. 提交并推送当前分支
3. `gh pr create` 后停止，等待 review

### 冲突规则

- **push 前必须先 `git pull --rebase`**
- 发现冲突先解决再 push
- **禁止 AI 自动解决复杂冲突**，报告文件列表和冲突类型，等待开发者处理

---

## CI/CD

| Workflow | 文件 | 触发条件 | 作用 |
|----------|------|---------|------|
| CI | `ci.yml` | PR + push(main/dev) | 双端 lint + tsc + test + build |
| Mac 打包 | `build-mac.yml` | 手动 + push(main/dev, 带路径过滤) | macOS dmg |
| Win 打包 | `build-win.yml` | 手动 + push(main/dev, 带路径过滤) | Windows exe |
| Release | `release.yml` | v* tag + push(main/dev, 带路径过滤) | GitHub Release |

- 所有 workflow 使用 Node.js 24
- Release assets 只保留 `.dmg` / `.exe` / `latest.yml` / `latest-mac.yml`
- Dev Snapshot 每次重建前先删旧 release，保证 assets 干净

---

## 关键文件索引

| 文件 | 用途 |
|------|------|
| `electron/main.ts` | 主进程入口（窗口/托盘/IPC 注册） |
| `electron/preload.ts` | preload 脚本（`window.electronAPI` 桥接） |
| `electron/scanner.ts` | macOS 软件扫描 + 图标提取 |
| `electron/scanner-win.ts` | Windows 软件扫描 + ExtractIconEx |
| `electron/updater.ts` | 自动更新（electron-updater + 系统通知） |
| `electron/database.ts` | 本地数据库（better-sqlite3） |
| `src/types/electron.d.ts` | IPC 通道类型声明 |
| `src/services/software-matching.ts` | 跨平台软件匹配（id → bundleId fallback） |
| `src/stores/software.store.ts` | 软件列表状态管理 |
| `src/stores/auth.store.ts` | 认证 + 云端同步 |
| `vite.config.ts` | Vite 配置（多入口/preload CJS/Supabase 注入） |
| `package.json` | 依赖 + electron-builder 配置 |
| `.env.example` | 环境变量模板 |
| `docs/TECH-STACK.md` | 完整技术栈文档 |

---

## 不要做的事

- 不要用 pnpm/yarn，只用 npm
- 不要提交 `.env` 文件
- 不要直接在 dev/main 分支上提交，用 feature/* 分支
- 不要在前端代码里硬编码 Supabase URL 或 key
- 不要改 vite.config.ts 里的 `preload-force-cjs` 插件逻辑
- 不要跳过 `git pull --rebase` 直接 push
- 不要把多个不相关的改动塞进一个 commit
- 不要用中文写 commit message
- 不要引入 pnpm-lock.yaml 或 yarn.lock
- 不要手动改 `release/` 目录下的打包产物
