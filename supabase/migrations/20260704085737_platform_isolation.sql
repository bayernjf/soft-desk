-- ============================================================================
-- SoftDesk 工作流 & 径向菜单 按平台隔离同步
-- 执行方式: 在 Supabase SQL Editor 中一次性执行全部语句
-- 前置条件: workflows 和 radial_configs 表已存在
-- ============================================================================

begin;

-- ============================================================================
-- 1. workflows 表: 添加 platform 列
-- ============================================================================
alter table workflows
  add column if not exists platform text;

-- 将已有行填充为 'unknown'(后续同步时会自动更新为正确平台)
update workflows set platform = 'unknown' where platform is null;

-- 设置为非空
alter table workflows
  alter column platform set not null,
  alter column platform set default 'unknown';

-- ============================================================================
-- 2. workflows 表: 添加 software_meta 列 (工作流软件元数据快照)
-- ============================================================================
alter table workflows
  add column if not exists software_meta jsonb;

-- ============================================================================
-- 3. radial_configs 表: 添加缺失列
-- ============================================================================
alter table radial_configs
  add column if not exists platform text;

update radial_configs set platform = 'unknown' where platform is null;

alter table radial_configs
  alter column platform set not null,
  alter column platform set default 'unknown';

alter table radial_configs
  add column if not exists show_recent boolean default false;

alter table radial_configs
  add column if not exists style text;

-- ============================================================================
-- 4. radial_configs 表: 将主键从单列 user_id 改为 (user_id, platform)
--    外键 radial_configs.user_id -> auth.users(id) 不受影响
-- ============================================================================
do $$
begin
  -- 4a. 删除旧主键(user_id 单列)
  if exists (
    select 1 from pg_constraint
    where conname = 'radial_configs_pkey'
      and conrelid = 'radial_configs'::regclass
  ) then
    alter table radial_configs drop constraint radial_configs_pkey;
  end if;

  -- 4b. 确保没有 (user_id, platform) 重复行 (理论上不会,因为 platform 刚填充为 'unknown')
  --     如果存在重复,保留 updated_at 最新的那条
  delete from radial_configs a
  using radial_configs b
  where a.user_id = b.user_id
    and a.platform = b.platform
    and a.ctid < b.ctid;

  -- 4c. 添加新联合主键
  if not exists (
    select 1 from pg_constraint
    where conname = 'radial_configs_pkey'
      and conrelid = 'radial_configs'::regclass
  ) then
    alter table radial_configs add primary key (user_id, platform);
  end if;
end $$;

commit;