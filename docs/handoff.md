# Handoff — Supabase RLS 安全迁移

> 分支：`feature/20260622`  
> 日期：2026-07-30（修订）  
> 状态：**隐私声明已提交；生产现状已核实；Step 1（favorite_groups 封洞）待执行；Step 2（uuid 加固）可选**

---

## 已完成

### 1. 隐私声明（已提交并推送）

**Commit**: `1d880d3` — `feat(privacy): add cloud sync data disclosure in settings page`

在 Settings → 隐私安全 tab 添加了信息卡片，清晰列出登录后会同步的数据：
- 收藏夹（软件列表和分组）
- AI 配置（Provider 名称、模型、端点）
- 径向菜单（扇区配置、快捷键绑定）
- 工作流（名称、描述、成员列表）

并明确说明：API Key 不会同步，本地数据（扫描到的软件、使用记录）仅保留在设备上。

### 2. 生产现状核实（2026-07-30 ✅）

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

---

## 修订方案（按优先级）

### Step 1：立刻封 `favorite_groups`（必做）

不改列类型、不删数据，只开 RLS 并补与另外两表同形的策略。现有 2 行可保留。

在 Supabase SQL Editor 执行：

```sql
BEGIN;

ALTER TABLE favorite_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "用户可读写自己的收藏分组" ON favorite_groups;

CREATE POLICY "用户可读写自己的收藏分组"
  ON favorite_groups FOR ALL
  USING (user_id = (auth.uid())::text)
  WITH CHECK (user_id = (auth.uid())::text);

COMMIT;
```

#### Step 1 验证

```sql
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'favorite_groups';

SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'favorite_groups';
```

期望：`relrowsecurity = true`，策略为 `user_id = (auth.uid())::text`。

客户端：登录后确认收藏分组同步/展示正常。

#### Step 1 回滚（如需要）

```sql
ALTER TABLE favorite_groups DISABLE ROW LEVEL SECURITY;
-- 可选：DROP POLICY IF EXISTS "用户可读写自己的收藏分组" ON favorite_groups;
```

---

### Step 2：text → uuid + FK 加固（可选）

三表策略已用 `auth.uid()` 后，安全边界基本到位。本步对齐 `ai_configs` / `radial_configs`，并防止脏 `user_id`。

**前置**：建议先完成 Step 1。

#### 2a. 备份（必须）

```sql
CREATE TABLE favorites_backup AS SELECT * FROM favorites;
CREATE TABLE favorite_groups_backup AS SELECT * FROM favorite_groups;
CREATE TABLE workflows_backup AS SELECT * FROM workflows;
```

或 Dashboard → Table Editor 导出 CSV。记下行数应对应为 **27 / 2 / 29**。

#### 2b. 迁移脚本（一次性事务执行）

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

#### 2c. 验证

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

#### Step 2 回滚说明

仅恢复行数据不够：还需还原列类型、外键与策略。若 Step 2 出问题，优先用事务自动回滚（未 COMMIT 前）；若已 COMMIT，需手写反向 DDL 或从项目备份恢复，**不要**只跑旧版 `TRUNCATE + INSERT` 就当完整回滚。

---

## 生产核实用查询（备查）

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

---

## 其他说明

- **ai_configs** / **radial_configs** 创建时已用 `uuid` + `auth.uid()`，无需迁移
- 客户端服务层已 `.eq('user_id', userId)` + Auth session，**不必为 Step 1/2 改应用代码**
- `SUPABASE_SETUP.md` 仍写旧的 `current_setting` 策略；迁移完成后应同步改文档，避免按文档重建库再现漏洞
- **不要**按旧 handoff 假设「三表仍是 current_setting」原样执行旧脚本；以本文 Step 1 → Step 2 为准

---

## 文件改动汇总

| 文件 | 状态 |
|------|------|
| `src/pages/Settings.tsx` | ✅ 已提交（隐私声明） |
| `SUPABASE_SETUP.md` | ⏳ 待 Step 完成后同步更新文档中的 RLS 示例 |
| `docs/handoff.md` | 本文件（2026-07-30 按生产核实结果修订） |
