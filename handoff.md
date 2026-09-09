# Handoff — soft-desk

更新时间：2026-09-10

## 项目概况
SoftDesk 桌面应用版：本地软件管理与智能启动工具，基于 Electron + electron-builder 打包
（`electron/` + `electron-builder`），与纯网页版共享同一套 React 源码。
本仓库原名 `soft-desk-electron`，现接管主名 `soft-desk` 作为桌面版主仓库；
纯网页版见 [soft-desk-web](https://github.com/bayernjf/soft-desk-web)。
落地页仓库：`soft-desk-landing`（Cloudflare Pages）。

常用命令：`npm run dev`（热重载 + DevTools）、`npm run build`、`npm test`（vitest）、`npm run lint`。

## 当前状态（分支 feature/20260622）
- **本地领先 origin/feature/20260622 20 余个提交，尚未推送**（准确数量以
  `git rev-list --count origin/feature/20260622..HEAD` 为准），主题集中在一批质量与构建修复：
  错误边界（`84f6708`，后续 `22709e2` 修掉 file:// 下整页 reload 白屏的次生 bug）、
  路由懒加载（`cd821fc`）、构建清理（`4bd7ad0`、`872b549`）、依赖告警修复
  （`58cd7be`、`afc1c79`）、补齐单测（搜索拼音、格式化、sync 合并、AI provider 等）、
  仓库结构整理（`fa974d2` 采纳 `supabase/migrations` 布局、文档移出 `.trae`），
  以及 **Electron 31.7.7 → 41.10.7 大版本升级（`7eacd69`）**。
- **工作区干净**：除本文件外无未提交改动。Electron 升级的全部代码/锁文件改动已在 `7eacd69` 提交。

## 注意点
- **Supabase RLS 漏洞已修复**：`favorite_groups` 已于 2026-09-10 执行
  `supabase/migrations/009_favorite_groups_rls_fix.sql` 开启 RLS 并补属主策略，
  anon key 复测通过（匿名 SELECT 0 行、匿名 INSERT 被拒 401）；
  完整交接见下文「[Supabase RLS 安全迁移](#supabase-rls-安全迁移专项交接)」章节。
  客户端服务层已显式带 `user_id` 过滤，未改应用代码。
- **Electron 41 升级踩坑记录**（详见 `7eacd69` commit message）：
  - macOS 上 `app.getFileIcon` 从 Electron 33 起会在 Chromium 线程池命中 CHECK 直接 SIGTRAP 主进程
    （33/37/40/41 最小复现全崩）。mac 扫描器的该兜底已删除，无 `.icns` 的应用退化为占位图；
    Windows 扫描器（`electron/scanner-win.ts`）保留该 API，实现路径不同、不受影响。
  - 升级后已验证：typecheck、181 个单测全过；生产构建在 Electron 41 下完整跑完整轮扫描
    （171 个图标、约 340 秒、0 崩溃报告）。**`npm run dist` dmg 冒烟已通过（2026-09-10）**：
    dmg checksum VALID、ad-hoc 签名正确、1.0.0 冷启动窗口/本地数据/AI 分类正常，
    仅 uiohook 需在安装正式版后重新授予辅助功能权限（新路径应用未授权，属预期降级）。
  - 升级清掉了 electron 的 32 条告警（含 GHSA-h7rp-cf8h-j98x context isolation 绕过）。
    剩余 14 条全部来自 `electron-builder@24` 家族，需升 26.x（semver-major，未授权未做）。
- `docs/` 下另有 PRD、架构、生产就绪审计、冒烟清单等文档，改动前先读对应文档避免与现状脱节。
- 提交按 Conventional Commits 原子化分批，推送前 `git pull --rebase`。

## Supabase RLS 安全迁移（专项交接）

> 分支：`feature/20260622`
> 日期：2026-07-30（修订）；2026-09-09 复核
> 状态：**隐私声明已提交；生产现状已核实；Step 1（favorite_groups 封洞）已执行并验证通过（2026-09-10）；Step 2（uuid 加固）可选**

### 已完成

#### 1. 隐私声明（已提交并推送）

**Commit**: `1d880d3` — `feat(privacy): add cloud sync data disclosure in settings page`

在 Settings → 隐私安全 tab 添加了信息卡片，清晰列出登录后会同步的数据：
- 收藏夹（软件列表和分组）
- AI 配置（Provider 名称、模型、端点）
- 径向菜单（扇区配置、快捷键绑定）
- 工作流（名称、描述、成员列表）

并明确说明：API Key 不会同步，本地数据（扫描到的软件、使用记录）仅保留在设备上。

#### 2. 生产现状核实（2026-07-30 ✅，2026-09-09 复核仍成立 ⚠️）

原 handoff 假设三表仍用 `current_setting('app.current_user_id')`。**生产库已不完全是该状态**，核实结果如下：

| 检查 | 结果 |
|------|------|
| 行数 | favorites **27** / favorite_groups **2** / workflows **29** |
| RLS 开关 | favorites ✅ 开 / workflows ✅ 开 / **favorite_groups ❌ 关** |
| 现有策略 | favorites / workflows 已是 `user_id = (auth.uid())::text`；**favorite_groups 无策略** |
| `user_id` 列类型 | 三表仍为 **text** |
| 孤儿行（对不上 auth.users） | 三表均为 **0** |

**结论**：

1. **当前最高优先级漏洞**：`favorite_groups` 未开 RLS → 持 anon key 可读写全表。
2. `favorites` / `workflows` 的 RLS 已用 `auth.uid()::text`，**不是**文档里的 `current_setting`；安全边界基本到位。
3. 三表 `user_id` 仍是 text、无 FK → 属于对齐 `ai_configs` 的可选加固，非紧急。
4. 数据可安全转 uuid（orphans = 0）。

##### 2026-09-09 复核（仅只读探测，未改动任何数据）

用 `.env` 里的 anon key 直接打 PostgREST，未登录状态下逐表 `SELECT`：

| 表 | 匿名 SELECT 结果 |
|---|---|
| `favorite_groups` | **返回真实行**（`content-range=0-0/2`，含他人 `user_id`）→ 漏洞仍在 |
| `favorites` / `workflows` / `ai_configs` / `radial_configs` | 返回 0 行 → RLS 生效 |

写权限用匹配不到任何行的过滤条件（`?id=eq.-1`）探测，未产生任何变更：
`PATCH` 与 `DELETE` 均返回 **HTTP 204**，即匿名角色对 `favorite_groups` 的写操作也是被授权的。

**Step 1 至今仍未执行，且客户端代码无需改动**——`favorites.service.ts` 里所有
`favorite_groups` 查询都已显式带 `user_id` 过滤，`upsert` 也写入 `user_id`，
与 `user_id = (auth.uid())::text` 策略同形（`favorites` 表用同一策略已在生产跑通）。

### 修订方案（按优先级）

#### Step 1：立刻封 `favorite_groups`（必做）✅ 已执行

不改列类型、不删数据，只开 RLS 并补与另外两表同形的策略。现有 2 行可保留。

在 Supabase SQL Editor 执行迁移文件（幂等，可反复执行；内含验证语句与回滚语句）：

**[`supabase/migrations/009_favorite_groups_rls_fix.sql`](supabase/migrations/009_favorite_groups_rls_fix.sql)**

✅ **2026-09-10 已执行，anon key 复测通过**：匿名 SELECT favorite_groups 返回 0 行
（修复前 2 行），匿名 INSERT 返回 401（`new row violates row-level security policy`）。

##### Step 1 验证

迁移文件末尾已附验证查询。期望：`relrowsecurity = true`，策略为 `user_id = (auth.uid())::text`。

客户端：登录后确认收藏分组同步/展示正常。

#### Step 2：text → uuid + FK 加固（可选）

三表策略已用 `auth.uid()` 后，安全边界基本到位。本步对齐 `ai_configs` / `radial_configs`，并防止脏 `user_id`。

**前置**：建议先完成 Step 1。

##### 2a. 备份（必须）

```sql
CREATE TABLE favorites_backup AS SELECT * FROM favorites;
CREATE TABLE favorite_groups_backup AS SELECT * FROM favorite_groups;
CREATE TABLE workflows_backup AS SELECT * FROM workflows;
```

或 Dashboard → Table Editor 导出 CSV。记下行数应对应为 **27 / 2 / 29**。

##### 2b. 迁移脚本（一次性事务执行）

注意：列改为 uuid 后，策略用 `auth.uid()`（**不要**再 `::text`）。

```sql
BEGIN;

-- 1. 删除旧策略
DROP POLICY IF EXISTS "用户可读写自己的收藏" ON favorites;
DROP POLICY IF EXISTS "用户可读写自己的收藏分组" ON favorite_groups;
DROP POLICY IF EXISTS "用户可读写自己的工作流" ON workflows;

-- 2. text → uuid
ALTER TABLE favorites
    ALTER COLUMN user_id TYPE uuid
    USING user_id::uuid;

ALTER TABLE favorite_groups
    ALTER COLUMN user_id TYPE uuid
    USING user_id::uuid;

ALTER TABLE workflows
    ALTER COLUMN user_id TYPE uuid
    USING user_id::uuid;

-- 3. 外键
ALTER TABLE favorites
    ADD CONSTRAINT fk_favorites_user
    FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE favorite_groups
    ADD CONSTRAINT fk_favgroups_user
    FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE workflows
    ADD CONSTRAINT fk_workflows_user
    FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- 4. 确保 RLS 开启（favorite_groups 若已做 Step 1 则幂等）
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

-- 5. 重建策略（uuid 列直接与 auth.uid() 比较）
CREATE POLICY "用户可读写自己的收藏"
    ON favorites FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可读写自己的收藏分组"
    ON favorite_groups FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "用户可读写自己的工作流"
    ON workflows FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

COMMIT;
```

##### 2c. 验证

```sql
-- 行数应仍为 27 / 2 / 29
SELECT 'favorites' AS t, COUNT(*) AS n FROM favorites
UNION ALL SELECT 'favorite_groups', COUNT(*) FROM favorite_groups
UNION ALL SELECT 'workflows', COUNT(*) FROM workflows;

-- 列类型应为 uuid
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('favorites', 'favorite_groups', 'workflows')
  AND column_name = 'user_id';

-- 策略应为 auth.uid()（无 ::text）
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE tablename IN ('favorites', 'favorite_groups', 'workflows');
```

客户端：登录后测收藏 / 分组 / 工作流 pull + upsert。

##### Step 2 回滚说明

仅恢复行数据不够：还需还原列类型、外键与策略。若 Step 2 出问题，优先用事务自动回滚（未 COMMIT 前）；若已 COMMIT，需手写反向 DDL 或从项目备份恢复，**不要**只跑旧版 `TRUNCATE + INSERT` 就当完整回滚。

### 生产核实用查询（备查）

```sql
-- A. 行数
SELECT 'favorites' AS t, COUNT(*) AS n FROM favorites
UNION ALL SELECT 'favorite_groups', COUNT(*) FROM favorite_groups
UNION ALL SELECT 'workflows', COUNT(*) FROM workflows;

-- B. RLS 开关
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('favorites', 'favorite_groups', 'workflows');

-- C. 策略原文
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('favorites', 'favorite_groups', 'workflows');

-- D. user_id 列类型
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('favorites', 'favorite_groups', 'workflows')
  AND column_name = 'user_id';

-- E. 孤儿 user_id
SELECT 'favorites' AS t, COUNT(*) AS orphans
FROM favorites f
LEFT JOIN auth.users u ON u.id::text = f.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'favorite_groups', COUNT(*)
FROM favorite_groups g
LEFT JOIN auth.users u ON u.id::text = g.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'workflows', COUNT(*)
FROM workflows w
LEFT JOIN auth.users u ON u.id::text = w.user_id
WHERE u.id IS NULL;
```

### 其他说明

- **ai_configs** / **radial_configs** 创建时已用 `uuid` + `auth.uid()`，无需迁移
- 客户端服务层已 `.eq('user_id', userId)` + Auth session，**不必为 Step 1/2 改应用代码**
- `SUPABASE_SETUP.md` 已同步为 `auth.uid()::text` 策略（2026-07-31），与生产现状一致
- **不要**按旧 handoff 假设「三表仍是 current_setting」原样执行旧脚本；以本文 Step 1 → Step 2 为准

### 文件改动汇总

| 文件 | 状态 |
|------|------|
| `src/pages/Settings.tsx` | ✅ 已提交（隐私声明） |
| `SUPABASE_SETUP.md` | ✅ 已更新 RLS 示例为 `auth.uid()::text`（2026-07-31） |
| `docs/handoff.md` | ✅ 已并入根目录 `handoff.md` 后删除（2026-09-09） |

## 下一步
1. ✅ **已完成（2026-09-10）**：执行 `supabase/migrations/009_favorite_groups_rls_fix.sql` 并 anon key 复测通过
   （匿名 SELECT 0 行、匿名 INSERT 被拒 401）。如需 SQL 层面复核，在 SQL Editor 跑文件末尾的两段验证查询
   （`relrowsecurity = true`、策略含 `auth.uid()`）。
2. ✅ **已完成（2026-09-10）**：`npm run dist` dmg 冒烟通过（产物齐全、dmg 校验有效、
   ad-hoc 签名正确、1.0.0 冷启动窗口/数据/AI 分类正常；uiohook 辅助功能权限需在安装后重新授予）。
3. ✅ **已完成（2026-09-10）**：electron-builder 24.13.3 → **26.16.1** 升级并验证通过
   （check/lint/181 tests 全过；dist dmg 冒烟通过、冷启动正常）。build 配置零改动。
   注意：升级后 @electron/rebuild 编译原生模块对 python 解释器路径敏感，
   在含空格路径的 shell 环境下需 `npm_config_python=/usr/bin/python3`（本次环境问题，非项目问题）。
   v27 仍是 alpha（27.0.0-alpha.8），待稳定后评估（native ESM + Node≥22.12 + `migrate-schema`）。
4. `git push`，然后把 `feature/20260622` 合入主干。
