# Handoff — Supabase RLS 安全迁移

> 分支：`feature/20260622`  
> 日期：2026-07-29  
> 状态：**隐私声明已提交，RLS 迁移待执行**

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

---

## 待完成：Supabase RLS 安全迁移

### 问题背景

`favorites` / `favorite_groups` / `workflows` 三表使用 `user_id text` + `current_setting('app.current_user_id')` 的 RLS 策略，但 `app.current_user_id` **从未被应用层设置**，导致任何持有 anon key 的人理论上可读写他人数据。

### 数据诊断结果（已验证 ✅）

| 表 | user_id 格式 | 与 auth.users 匹配 |
|----|-------------|-------------------|
| favorites | UUID (36字符) | ✅ 100% 匹配 |
| favorite_groups | UUID (36字符) | ✅ 100% 匹配 |
| workflows | UUID (36字符) | ✅ 100% 匹配 |

**结论**：数据格式正确，可以安全迁移。

---

## 迁移步骤（需手动执行）

### Step 1: 备份数据（必须）

在 Supabase SQL Editor 中执行：

```sql
-- 创建临时备份表
CREATE TABLE favorites_backup AS SELECT * FROM favorites;
CREATE TABLE favorite_groups_backup AS SELECT * FROM favorite_groups;
CREATE TABLE workflows_backup AS SELECT * FROM workflows;
```

或在 Dashboard → Table Editor 中导出 CSV。

---

### Step 2: 执行迁移脚本

在 Supabase SQL Editor 中**一次性执行**以下完整脚本（事务化，出错自动回滚）：

```sql
-- ============================================
-- Supabase RLS 安全迁移脚本
-- 事务化执行，出错自动回滚
-- ============================================

BEGIN;

-- 1. 删除旧 RLS 策略
DROP POLICY IF EXISTS "用户可读写自己的收藏" ON favorites;
DROP POLICY IF EXISTS "用户可读写自己的收藏分组" ON favorite_groups;
DROP POLICY IF EXISTS "用户可读写自己的工作流" ON workflows;

-- 2. 修改列类型（使用 USING 子句处理转换）
ALTER TABLE favorites 
    ALTER COLUMN user_id TYPE uuid 
    USING user_id::uuid;

ALTER TABLE favorite_groups 
    ALTER COLUMN user_id TYPE uuid 
    USING user_id::uuid;

ALTER TABLE workflows 
    ALTER COLUMN user_id TYPE uuid 
    USING user_id::uuid;

-- 3. 添加外键约束
ALTER TABLE favorites 
    ADD CONSTRAINT fk_favorites_user 
    FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE favorite_groups 
    ADD CONSTRAINT fk_favgroups_user 
    FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE workflows 
    ADD CONSTRAINT fk_workflows_user 
    FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- 4. 重建 RLS 策略（使用安全的 auth.uid()）
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

---

### Step 3: 验证迁移结果

执行完成后，运行验证查询：

```sql
-- 验证数据行数是否一致
SELECT 'favorites' as table_name, COUNT(*) as row_count FROM favorites
UNION ALL
SELECT 'favorite_groups', COUNT(*) FROM favorite_groups
UNION ALL
SELECT 'workflows', COUNT(*) FROM workflows;

-- 验证 RLS 策略已生效
SELECT tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('favorites', 'favorite_groups', 'workflows');
```

---

### 回滚方案（如需要）

如果迁移后发现问题，可从备份恢复：

```sql
-- 从备份表恢复（假设需要回滚）
TRUNCATE favorites;
INSERT INTO favorites SELECT * FROM favorites_backup;

TRUNCATE favorite_groups;
INSERT INTO favorite_groups SELECT * FROM favorite_groups_backup;

TRUNCATE workflows;
INSERT INTO workflows SELECT * FROM workflows_backup;
```

---

## 其他说明

- **ai_configs** 和 **radial_configs** 表在创建时已经使用 `uuid` 类型和 `auth.uid()`，无需迁移
- 迁移完成后，建议测试一下收藏/分组/工作流的同步功能是否正常
- 如有任何问题，联系项目开发者协助

---

## 文件改动汇总

| 文件 | 状态 |
|------|------|
| `src/pages/Settings.tsx` | ✅ 已提交（隐私声明） |
| `SUPABASE_SETUP.md` | 未改动（文档保持现状） |
| `docs/handoff.md` | 本文件，记录迁移任务 |
