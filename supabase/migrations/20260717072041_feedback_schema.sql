-- ============================================================================
-- SoftDesk 意见反馈表 + RLS
-- 在 Supabase Dashboard SQL Editor 中执行
-- ============================================================================

-- 机器值与国际化显示约定（数据库只保存英文机器值，UI 通过 i18n key 显示）
-- category: bug=功能异常, feature=功能建议, question=使用咨询, other=其他
-- status: new=待处理, processing=处理中, resolved=已解决, closed=已关闭
-- 对应前端单一来源: src/data/feedback.ts；修改枚举时必须同步本文件 CHECK 约束

-- ============================================================================
-- 1. feedbacks 表
-- ============================================================================
create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'feature', 'question', 'other')),
  title text not null check (char_length(title) >= 1 and char_length(title) <= 100),
  content text not null check (char_length(content) >= 1 and char_length(content) <= 5000),
  contact text check (contact is null or char_length(contact) <= 200),
  app_version text not null,
  platform text not null,
  architecture text,
  os_version text,
  status text not null default 'new' check (status in ('new', 'processing', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 索引: 按用户查自己的反馈 + 按状态筛管理端
create index if not exists idx_feedbacks_user_id on feedbacks(user_id);
create index if not exists idx_feedbacks_status on feedbacks(status);
create index if not exists idx_feedbacks_created_at on feedbacks(created_at desc);

-- updated_at 自动更新
create or replace function update_feedbacks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_feedbacks_updated_at on feedbacks;
create trigger trg_feedbacks_updated_at
  before update on feedbacks
  for each row
  execute function update_feedbacks_updated_at();


-- ============================================================================
-- 2. feedback_logs 表
-- ============================================================================
create table if not exists feedback_logs (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references feedbacks(id) on delete cascade,
  content text not null,
  line_count integer not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  truncated boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_logs_feedback_id on feedback_logs(feedback_id);


-- ============================================================================
-- 3. RLS: feedbacks 表
-- ============================================================================
alter table feedbacks enable row level security;

-- 策略 1: 登录用户只能插入自己的反馈
drop policy if exists "user insert own feedbacks" on feedbacks;
create policy "user insert own feedbacks"
  on feedbacks
  for insert
  with check (auth.uid() = user_id);

-- 策略 2: 用户只能读取自己的反馈
drop policy if exists "user read own feedbacks" on feedbacks;
create policy "user read own feedbacks"
  on feedbacks
  for select
  using (auth.uid() = user_id);

-- 策略 3: 用户不能修改反馈(状态由管理端通过 service role 处理)
-- 不创建 update/delete policy,默认拒绝


-- ============================================================================
-- 4. RLS: feedback_logs 表
-- ============================================================================
alter table feedback_logs enable row level security;

-- 策略 1: 登录用户只能插入日志,且 feedback 必须属于自己
drop policy if exists "user insert own feedback_logs" on feedback_logs;
create policy "user insert own feedback_logs"
  on feedback_logs
  for insert
  with check (
    exists (
      select 1 from feedbacks
      where feedbacks.id = feedback_logs.feedback_id
      and feedbacks.user_id = auth.uid()
    )
  );

-- 策略 2: 用户只能读取自己反馈的日志
drop policy if exists "user read own feedback_logs" on feedback_logs;
create policy "user read own feedback_logs"
  on feedback_logs
  for select
  using (
    exists (
      select 1 from feedbacks
      where feedbacks.id = feedback_logs.feedback_id
      and feedbacks.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 5. 验证
-- ============================================================================
-- 执行完成后, 在 Supabase Table Editor 中应看到:
--   - feedbacks (RLS 已开启)
--   - feedback_logs (RLS 已开启)
-- 管理端通过 Supabase Dashboard 直接查看和处理反馈
-- ============================================================================
