-- =====================================================
-- Migration 009: Fix favorite groups RLS
-- File: 009_favorite_groups_rls_fix.sql
-- Date: 2026-09-09 22:34
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: favorite_groups was created without RLS, letting
--       any anon key holder read/write every row. Enables
--       RLS and adds an owner policy restricting access
--       to user_id = auth.uid()::text, matching the other
--       auth.uid() based policies.
-- -----------------------------------------------------
-- ============================================================================
-- SoftDesk 收藏分组 · RLS 修复补丁
--
-- 问题:
--   favorite_groups 表建表时没有启用 RLS, 而客户端直接持有 Supabase anon key,
--   导致任何匿名请求都可以 SELECT 全表 (读到所有用户的收藏分组), 甚至
--   INSERT/UPDATE/DELETE 任意行.
--
-- 修复:
--   1. 对 favorite_groups 启用 RLS (默认拒绝一切匿名访问);
--   2. 新建一条属主策略, 仅允许 user_id = auth.uid()::text 的行被读写,
--      与 radial_configs / shares 等表的 auth.uid() 做法保持一致.
--
-- 使用方式:
--   在 Supabase SQL Editor 里执行本文件全部内容 (幂等, 可反复执行).
--
-- 回滚:
--   drop policy if exists "用户可读写自己的收藏分组" on favorite_groups;
--   alter table favorite_groups disable row level security;
-- ============================================================================

begin;

alter table favorite_groups enable row level security;

drop policy if exists "用户可读写自己的收藏分组" on favorite_groups;
create policy "用户可读写自己的收藏分组"
  on favorite_groups
  for all
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

commit;


-- ============================================================================
-- 验证
-- ============================================================================
-- relrowsecurity 应为 true
select relname, relrowsecurity
  from pg_class
  where relname = 'favorite_groups';

-- 应能看到上面创建的策略 (cmd = ALL, qual/with_check 均带 auth.uid())
select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'favorite_groups';
