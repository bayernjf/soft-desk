-- ============================================================================
-- SoftDesk 社区分享 · RLS 修复补丁
--
-- 问题:
--   Community-Share-Schema.sql 里 shares / share_imports 的 RLS 策略用了
--   current_setting('app.current_user_id', true), 但项目走 Supabase Auth
--   JWT 通道, 会话变量始终为 null, 导致所有 insert/update 被拒绝并抛出
--   "new row violates row-level security policy for table shares".
--
-- 修复:
--   把策略切换到 Supabase Auth 原生的 auth.uid()::text = owner_id / importer_id.
--   与项目里 radial_configs 表的做法保持一致.
--
-- 使用方式:
--   在 Supabase SQL Editor 里执行本文件全部内容 (幂等, 可反复执行).
-- ============================================================================


-- ============================================================================
-- 1. shares
-- ============================================================================

-- 匿名 select 策略保持不变(公开预览), 只重建 owner 管理策略
drop policy if exists "owner manage own shares" on shares;
create policy "owner manage own shares"
  on shares
  for all
  using (auth.uid()::text = owner_id)
  with check (auth.uid()::text = owner_id);


-- ============================================================================
-- 2. share_imports
-- ============================================================================

drop policy if exists "user read own imports" on share_imports;
create policy "user read own imports"
  on share_imports
  for select
  using (auth.uid()::text = importer_id);

drop policy if exists "user insert own imports" on share_imports;
create policy "user insert own imports"
  on share_imports
  for insert
  with check (auth.uid()::text = importer_id);

-- Owner 视角: 可看自己分享下所有导入记录
drop policy if exists "owner read imports of own shares" on share_imports;
create policy "owner read imports of own shares"
  on share_imports
  for select
  using (
    exists (
      select 1 from shares
      where shares.id = share_imports.share_id
        and auth.uid()::text = shares.owner_id
    )
  );


-- ============================================================================
-- 3. share_reports
-- 保持不变: 匿名 / 登录用户均可 insert; 举报人可读自己的举报
-- 但把 reporter 相关策略也切到 auth.uid() 以便一致
-- ============================================================================

drop policy if exists "reporter read own reports" on share_reports;
create policy "reporter read own reports"
  on share_reports
  for select
  using (
    reporter_id is not null
    and auth.uid()::text = reporter_id
  );


-- ============================================================================
-- 4. share_events (Phase 2 埋点)
-- ============================================================================

drop policy if exists "actor read own share events" on share_events;
create policy "actor read own share events"
  on share_events
  for select
  using (
    actor_id is not null
    and auth.uid()::text = actor_id
  );

drop policy if exists "owner read share events" on share_events;
create policy "owner read share events"
  on share_events
  for select
  using (
    exists (
      select 1 from shares
      where shares.id = share_events.share_id
        and auth.uid()::text = shares.owner_id
    )
  );


-- ============================================================================
-- 5. 验证
-- ============================================================================
-- 执行完成后, 在 Supabase Table Editor 里检查每张表的 RLS 策略列表,
-- 确认没有还在引用 current_setting('app.current_user_id', ...) 的策略.

select tablename, policyname, cmd
  from pg_policies
  where schemaname = 'public'
    and tablename in ('shares', 'share_imports', 'share_reports', 'share_events')
  order by tablename, policyname;
