# Handoff — soft-desk

更新时间：2026-09-09

## 项目概况
SoftDesk 桌面应用版：本地软件管理与智能启动工具，基于 Electron + electron-builder 打包
（`electron/` + `electron-builder`），与纯网页版共享同一套 React 源码。
本仓库原名 `soft-desk-electron`，现接管主名 `soft-desk` 作为桌面版主仓库；
纯网页版见 [soft-desk-web](https://github.com/bayernjf/soft-desk-web)。
落地页仓库：`soft-desk-landing`（Cloudflare Pages）。

常用命令：`npm run dev`（热重载 + DevTools）、`npm run build`、`npm test`（vitest）、`npm run lint`。

## 当前状态（分支 feature/20260622）
- **本地领先 origin/feature/20260622 共 22 个提交，尚未推送**，主题集中在一批质量与构建修复：
  错误边界（`84f6708`，后续 `22709e2` 修掉 file:// 下整页 reload 白屏的次生 bug）、
  路由懒加载（`cd821fc`）、构建清理（`4bd7ad0`、`872b549`）、依赖告警修复
  （`58cd7be`、`afc1c79`）、补齐单测（搜索拼音、格式化、sync 合并、AI provider 等）、
  仓库结构整理（`fa974d2` 采纳 `supabase/migrations` 布局、文档移出 `.trae`），
  以及 **Electron 31.7.7 → 41.10.7 大版本升级（`7eacd69`）**。
- **工作区干净**：除本文件外无未提交改动。Electron 升级的全部代码/锁文件改动已在 `7eacd69` 提交。

## 注意点
- Supabase RLS 的专项交接在 **[`docs/handoff.md`](docs/handoff.md)**：
  `favorite_groups` 未开 RLS（持 anon key 可读写全表），2026-09-09 复核漏洞仍在，Step 1 待执行；
  迁移文件 `supabase/migrations/20260909222343_favorite_groups_rls_fix.sql`（幂等，含验证与回滚语句）。
  客户端服务层已显式带 `user_id` 过滤，**不需要改应用代码**。执行迁移后需用 anon key 复测
  （期望 SELECT 0 行、PATCH/DELETE 被拒）。
- **Electron 41 升级踩坑记录**（详见 `7eacd69` commit message）：
  - macOS 上 `app.getFileIcon` 从 Electron 33 起会在 Chromium 线程池命中 CHECK 直接 SIGTRAP 主进程
    （33/37/40/41 最小复现全崩）。mac 扫描器的该兜底已删除，无 `.icns` 的应用退化为占位图；
    Windows 扫描器（`electron/scanner-win.ts`）保留该 API，实现路径不同、不受影响。
  - 升级后已验证：typecheck、181 个单测全过；生产构建在 Electron 41 下完整跑完整轮扫描
    （171 个图标、约 340 秒、0 崩溃报告）。**`npm run dist` 打包 dmg 的冒烟尚未跑**。
  - 升级清掉了 electron 的 32 条告警（含 GHSA-h7rp-cf8h-j98x context isolation 绕过）。
    剩余 14 条全部来自 `electron-builder@24` 家族，需升 26.x（semver-major，未授权未做）。
- `docs/` 下另有 PRD、架构、生产就绪审计、冒烟清单等文档，改动前先读对应文档避免与现状脱节。
- 提交按 Conventional Commits 原子化分批，推送前 `git pull --rebase`。

## 下一步
1. 在 Supabase SQL Editor 执行 `supabase/migrations/20260909222343_favorite_groups_rls_fix.sql`，
   跑文件末尾的验证语句，然后通知开发者用 anon key 复测。
2. 跑一次 `npm run dist` 验证 Electron 41 下的 dmg 打包产物（安装、冷启动、扫描、径向菜单）。
3. 评估 electron-builder 24 → 26 升级（会动配置结构与签名行为，需单独排期）。
4. `git push`，然后把 `feature/20260622` 合入主干。
