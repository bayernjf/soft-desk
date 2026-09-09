-- ============================================================================
-- SoftDesk 社区分享 · Dry-run 测试数据
-- 用途:
--   1. 快速验证 shares / share_events / share_imports / share_reports 4 张表就绪
--   2. 验证 share_funnel_daily / share_top_creators 两个视图能查
--   3. 验证累计 3 次举报自动撤销触发器 fn_auto_revoke_on_reports 生效
--   4. 完成后一键清理测试数据
--
-- 使用方式:
--   * 在 Supabase SQL Editor 里逐段执行(推荐)
--   * 或整段执行,末尾 CLEAN UP 会把测试痕迹删干净
--
-- 前置依赖:
--   * 已执行 Community-Share-Schema.sql
--   * 已执行 Community-Share-Phase2-Analytics.sql
-- ============================================================================


-- ============================================================================
-- SETUP: 造 3 条测试分享(workflow / favorite_group / radial)
-- ============================================================================

with inserted as (
  insert into shares(share_token, owner_id, owner_nickname, kind, title, description, payload)
  values
    (
      'drytest001',
      'dry-user-A',
      '干测用户A',
      'workflow',
      '视频剪辑三件套',
      'PR + AE + Audition,一键启动',
      '{"version":1,"kind":"workflow","workflow":{"name":"视频剪辑三件套","description":"PR+AE+Au","softwareIds":["prem","ae","au"],"color":"#8b5cf6"},"softwareMeta":[{"softwareId":"prem","name":"Premiere Pro","bundleId":"com.adobe.PremierePro","category":"media","color":"#8b5cf6"},{"softwareId":"ae","name":"After Effects","bundleId":"com.adobe.AfterEffects","category":"media","color":"#a78bfa"},{"softwareId":"au","name":"Audition","bundleId":"com.adobe.Audition","category":"media","color":"#f59e0b"}]}'::jsonb
    ),
    (
      'drytest002',
      'dry-user-A',
      '干测用户A',
      'favorite_group',
      '前端开发必备',
      NULL,
      '{"version":1,"kind":"favorite_group","group":{"name":"前端开发必备","softwareIds":["vscode","chrome"]},"softwareMeta":[{"softwareId":"vscode","name":"VS Code","color":"#0ea5e9"},{"softwareId":"chrome","name":"Chrome","color":"#f59e0b"}]}'::jsonb
    ),
    (
      'drytest003',
      'dry-user-B',
      '干测用户B',
      'radial',
      '设计师快捷布局',
      '6 键径向菜单',
      '{"version":1,"kind":"radial","radial":{"sectors":6,"style":"glass","items":[{"slot":0,"type":"app","targetId":"figma","name":"Figma","color":"#a855f7"},{"slot":1,"type":"app","targetId":"sketch","name":"Sketch","color":"#f97316"}]},"softwareMeta":[{"softwareId":"figma","name":"Figma","color":"#a855f7"},{"softwareId":"sketch","name":"Sketch","color":"#f97316"}]}'::jsonb
    )
  returning id, share_token, owner_id, kind
)
select * from inserted;

-- 检查: 应看到 3 条分享,is_revoked / is_archived 都是 false
select id, share_token, owner_id, kind, view_count, import_count, report_count, is_revoked
  from shares
  where share_token like 'drytest%';


-- ============================================================================
-- 1) 模拟一波事件流水,验证漏斗表能算
-- ============================================================================

-- 分享创建事件
insert into share_events(event_type, share_id, share_token, actor_id, kind, meta)
select 'share_create', id, share_token, owner_id, kind, jsonb_build_object('expiry','permanent')
  from shares where share_token like 'drytest%';

-- 复制链接 (作者复制自己的)
insert into share_events(event_type, share_id, share_token, actor_id, kind)
select 'share_copy', id, share_token, owner_id, kind
  from shares where share_token like 'drytest%';

-- 匿名预览(actor_id 为 null 也允许)
insert into share_events(event_type, share_id, share_token, actor_id, kind)
select 'share_view', id, share_token, null, kind
  from shares where share_token like 'drytest%';

-- 登录用户预览
insert into share_events(event_type, share_id, share_token, actor_id, kind)
select 'share_view', id, share_token, 'dry-user-B', kind
  from shares where share_token = 'drytest001';
insert into share_events(event_type, share_id, share_token, actor_id, kind)
select 'share_view', id, share_token, 'dry-user-C', kind
  from shares where share_token = 'drytest001';

-- 导入点击 → 导入成功
insert into share_events(event_type, share_id, share_token, actor_id, kind)
select 'share_import_click', id, share_token, 'dry-user-B', kind
  from shares where share_token = 'drytest001';
insert into share_events(event_type, share_id, share_token, actor_id, kind, meta)
select 'share_import_success', id, share_token, 'dry-user-B', kind,
       jsonb_build_object('duration_ms', 320, 'missing_software', 1)
  from shares where share_token = 'drytest001';

-- 导入冲突(重名场景)
insert into share_events(event_type, share_id, share_token, actor_id, kind, meta)
select 'share_import_conflict', id, share_token, 'dry-user-C', kind,
       jsonb_build_object('workflow_renamed', jsonb_build_object('from','视频剪辑三件套','to','视频剪辑三件套 (2)'))
  from shares where share_token = 'drytest001';


-- ============================================================================
-- 2) 模拟导入记录 (share_imports)
-- ============================================================================

insert into share_imports(share_id, importer_id)
select id, 'dry-user-B' from shares where share_token = 'drytest001'
on conflict do nothing;

insert into share_imports(share_id, importer_id)
select id, 'dry-user-C' from shares where share_token = 'drytest001'
on conflict do nothing;

-- 触发 shares.import_count 计数(RPC)
select increment_share_import(id) from shares where share_token = 'drytest001';
select increment_share_import(id) from shares where share_token = 'drytest001';

-- 触发 view_count 计数(RPC,匿名走)
select increment_share_view('drytest001');
select increment_share_view('drytest001');
select increment_share_view('drytest001');


-- ============================================================================
-- 3) 验证「累计 3 次举报自动撤销」触发器
-- 期望: 提交第 3 次举报后,shares.is_revoked 从 false 变 true
-- ============================================================================

insert into share_reports(share_id, reporter_id, reason)
select id, 'reporter-1', '内容不符合预期' from shares where share_token = 'drytest002';

insert into share_reports(share_id, reporter_id, reason)
select id, 'reporter-2', '疑似广告' from shares where share_token = 'drytest002';

-- 第 3 次: 触发器应把 shares.is_revoked 置为 true
insert into share_reports(share_id, reporter_id, reason)
select id, 'reporter-3', '恶意分享' from shares where share_token = 'drytest002';

-- 断言: drytest002 应该 is_revoked = true
select share_token, is_revoked, report_count
  from shares where share_token = 'drytest002';


-- ============================================================================
-- 4) 验证看板视图
-- ============================================================================

-- 今日漏斗数据 (应看到 creates / copies / views / import_clicks / import_success / import_conflict / reports 均非零)
select * from share_funnel_daily where day = current_date;

-- Top 分享者 (drytest001 被导入 2 次,view 被 RPC 加了 3 次,应排在前面)
select * from share_top_creators
  where owner_id like 'dry-user-%'
  order by total_imports desc;


-- ============================================================================
-- 5) 验证 hasUserImported / getShareByToken 逻辑
-- ============================================================================

-- 已撤销的 drytest002 应该查不到(getShareByToken 返回 null)
select share_token, is_revoked
  from shares
  where share_token = 'drytest002'
    and is_revoked = false
    and is_archived = false
    and (expires_at is null or expires_at > now());
-- 期望: 0 行返回

-- dry-user-B 应该已导入过 drytest001
select count(*) as imported
  from share_imports si
  join shares s on s.id = si.share_id
  where s.share_token = 'drytest001' and si.importer_id = 'dry-user-B';
-- 期望: 1


-- ============================================================================
-- CLEAN UP: 删除测试数据
-- ============================================================================
-- 执行完上面的验证并观察数据无误后,再运行此段清理:

delete from share_events where share_token like 'drytest%';
delete from share_reports where share_id in (select id from shares where share_token like 'drytest%');
delete from share_imports where share_id in (select id from shares where share_token like 'drytest%');
delete from shares where share_token like 'drytest%';

-- 清理确认
select count(*) as remaining_shares from shares where share_token like 'drytest%';
select count(*) as remaining_events from share_events where share_token like 'drytest%';
-- 期望: 都是 0
