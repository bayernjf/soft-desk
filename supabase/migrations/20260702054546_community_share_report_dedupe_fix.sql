-- ============================================================================
-- SoftDesk 社区分享 · 举报去重加固补丁
--
-- 目的:
--   修复"同一用户/匿名用户可无限刷举报, 3 次即撤销分享"的滥用漏洞。
--
-- 加固点:
--   1. 强制 reporter_id NOT NULL   -> 匿名不能举报, 断掉匿名刷单路径
--   2. 唯一索引 (share_id, reporter_id) -> 数据库层保证一人一份举报
--   3. 触发器改用 distinct 计数    -> report_count 变成"独立举报人数"
--   4. 顺便清理历史脏数据: 匿名举报 & 同一用户重复举报
--
-- 使用方式:
--   在 Supabase SQL Editor 里整段执行 (幂等)。
-- ============================================================================


-- ============================================================================
-- 1. 清理历史脏数据
-- ============================================================================

-- 1a. 删除所有匿名举报 (reporter_id 为 null)
delete from share_reports where reporter_id is null;

-- 1b. 同一用户对同一分享的重复举报, 只保留最早那条
delete from share_reports a
  using share_reports b
  where a.share_id    = b.share_id
    and a.reporter_id = b.reporter_id
    and a.reporter_id is not null
    and a.id > b.id;


-- ============================================================================
-- 2. 收紧列约束: reporter_id 必填
-- ============================================================================

alter table share_reports
  alter column reporter_id set not null;


-- ============================================================================
-- 3. 唯一索引: 一个用户对一个分享只能举报一次
-- ============================================================================

create unique index if not exists uq_share_reports_reporter
  on share_reports(share_id, reporter_id);


-- ============================================================================
-- 4. 触发器改造: report_count 语义 = distinct 举报人数
-- ============================================================================

create or replace function fn_auto_revoke_on_reports()
returns trigger
language plpgsql
security definer
as $$
declare
  distinct_reporters int;
begin
  -- 只按 distinct reporter_id 计数, 天然去重。
  -- 与旧实现的差异: 即便有历史脏数据混入, 这里也会用"独立人数"重新校准。
  select count(distinct reporter_id)
    into distinct_reporters
    from share_reports
    where share_id = new.share_id;

  update shares
    set report_count = distinct_reporters,
        is_revoked   = case
                         when distinct_reporters >= 3 then true
                         else is_revoked
                       end,
        updated_at   = now()
    where id = new.share_id;
  return new;
end;
$$;

-- 触发器绑定保持不变 (仍是 after insert on share_reports)
drop trigger if exists trg_shares_auto_revoke on share_reports;
create trigger trg_shares_auto_revoke
  after insert on share_reports
  for each row execute function fn_auto_revoke_on_reports();


-- ============================================================================
-- 5. 修正历史 shares.report_count (可选, 让计数与新语义对齐)
-- ============================================================================

update shares s
  set report_count = coalesce((
    select count(distinct reporter_id)
      from share_reports r
      where r.share_id = s.id
  ), 0);

-- 校准 is_revoked (跟着新计数走; 已经手动撤销的保持不变)
update shares
  set is_revoked = true, updated_at = now()
  where is_revoked = false and report_count >= 3;


-- ============================================================================
-- 6. RLS 加固: 收紧 insert 策略, 只允许 reporter_id = auth.uid() 的插入
-- ============================================================================
-- 旧策略 with check (true) 允许任何请求写入 (含匿名 anon key)。
-- 加固后必须登录且只能以自己的身份举报。

drop policy if exists "anyone insert reports" on share_reports;
drop policy if exists "reporter insert own reports" on share_reports;
create policy "reporter insert own reports"
  on share_reports
  for insert
  with check (auth.uid()::text = reporter_id);


-- ============================================================================
-- 7. 验证
-- ============================================================================
-- (a) 试写重复举报, 期望第二条被 unique 拦截:
--   insert into share_reports(share_id, reporter_id, reason)
--     values (<some_share_id>, 'test-user', '第一次'), (<some_share_id>, 'test-user', '第二次');
--   -- ERROR: duplicate key value violates unique constraint "uq_share_reports_reporter"
--
-- (b) 试写匿名举报, 期望被 not null 拦截:
--   insert into share_reports(share_id, reason) values (<some_share_id>, '匿名');
--   -- ERROR: null value in column "reporter_id" violates not-null constraint
--
-- (c) 查看 3 个 distinct 用户举报后是否触发撤销:
--   select share_token, report_count, is_revoked from shares where share_token = 'xxx';
--   -- report_count = 3, is_revoked = true
-- ============================================================================
