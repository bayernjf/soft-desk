# SoftDesk 社区分享功能 PRD（MVP：单向分享 + 一键导入）

> 文档版本：v1.1（Phase 2 增量）
> 创建日期：2026-07-01
> 更新日期：2026-07-01
> 状态：Phase 1 + Phase 2 已交付
> 关联主 PRD：[PRD.md](./PRD.md)

## 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-07-01 | 首版:定义 3 类内容分享 + 深链 + 举报治理 |
| v1.1 | 2026-07-01 | Phase 2 增量:埋点/漏斗 + 导入冲突处理 + 二维码 |

---

## 1. 背景与目标

### 1.1 背景
SoftDesk 当前的工作流、收藏夹、径向菜单配置均为**单账户跨设备同步**，用户无法将自己精心设计的软件组合、启动流程分享给他人。为满足社区共创诉求、降低新用户冷启动门槛，本次迭代交付**社区功能 MVP**：

> **单向分享 + 一键导入**——用户可将本地内容生成可分享链接，他人打开链接后一键导入自己的账户，无需评论、点赞、关注等重社区能力。

### 1.2 目标
1. **验证核心假设**：用户是否愿意主动分享自己的工作流 / 收藏 / 径向菜单
2. **降低冷启动成本**：新用户可通过链接快速复用他人的优质配置
3. **沉淀内容资产**：分享内容作为后续「广场 / 推荐」功能的数据基础
4. **控制交付范围**：无广场、无评论、无付费，最小闭环上线

### 1.3 非目标（V1 明确不做）
- ❌ 公开广场 / 内容发现页
- ❌ 评论 / 点赞 / 关注创作者
- ❌ 付费分享 / 打赏
- ❌ 分享内容的双向订阅同步
- ❌ 人工审核后台（用「举报 + 关键词黑名单」兜底）

---

## 2. 目标用户与场景

### 2.1 用户角色
| 角色 | 描述 | 核心诉求 |
|---|---|---|
| **分享者** | 有独特工作流 / 精选软件组合的重度用户 | 一键生成链接、可撤销、了解传播效果 |
| **接收者** | 想复用他人配置的新用户 / 好奇用户 | 免登录预览、一键导入、清楚知道会导入什么 |
| **访客** | 未安装 SoftDesk 的路人 | 能看到内容大致长啥样，引导下载 |

### 2.2 典型场景
1. **UP 主分享视频剪辑三件套**：将 PR + AE + Audition 的工作流发到 B 站粉丝群 → 粉丝一键导入
2. **设计师分享精选字体工具收藏夹**：分享给团队新人 → 团队新人快速对齐工具链
3. **极客分享径向菜单快捷布局**：把自己精调的 8 键径向布局分享到小红书 → 效率控直接照搬

---

## 3. 功能需求

### 3.1 分享内容类型（MVP 首批 3 类）

| 类型 | 中文名 | 数据来源 | payload 结构关键字段 |
|---|---|---|---|
| `workflow` | 工作流 | `workflows` 表 | `name / description / softwareIds / color / softwareMeta[]` |
| `favorite_group` | 收藏夹分组 | `favorite_groups` + `favorites` 表 | `name / softwareIds / softwareMeta[]` |
| `radial` | 径向菜单配置 | `radial_configs` 表 | `layout / slots[] / softwareMeta[]` |

> **`softwareMeta[]` 说明**：为解决"分享者机器上有该软件、接收者没有"的问题，快照中必须保存软件的 `id / name / bundleId / category / iconRef`。导入时按 `bundleId` 匹配本机扫描结果：
> - 已安装 → 直接绑定本地软件 id
> - 未安装 → 保留占位卡片，UI 标灰并提示"未安装，点击去下载"

### 3.2 分享链接协议

- **格式**：`softdesk://share/:token`
- **Token 规则**：`nanoid(10)`（约 5×10¹⁷ 组合，防爆破）
- **协议注册**：通过 `app.setAsDefaultProtocolClient('softdesk')`
- **唤起处理**：
  - macOS：`app.on('open-url')`
  - Windows/Linux：`app.on('second-instance')`
  - 应用未启动 → 启动后跳转 `/share/:token`
  - 应用已启动 → 聚焦窗口并跳转

### 3.3 分享方流程

```
[入口] 工作流卡片 / 收藏夹分组 / 径向菜单 → 三点菜单 → "分享"
   ↓
[ShareDialog 弹窗]
   ├─ 标题（默认取原名，可编辑，≤ 50 字）
   ├─ 描述（可选，≤ 200 字）
   ├─ 有效期（永久 / 30 天 / 7 天，默认永久）
   └─ [生成链接] 按钮
   ↓
[结果卡片]
   ├─ 分享链接（含复制按钮）
   ├─ 二维码（预留 v1.1）
   └─ "在系统分享中打开"（macOS Share Sheet）
```

### 3.4 接收方流程

```
点击 softdesk://share/xxx → 应用启动 / 聚焦
   ↓
[SharePreview 预览页 /share/:token]（免登录）
   ├─ 分享者昵称 + 时间
   ├─ 标题 + 描述
   ├─ 类型徽标（工作流 / 收藏夹 / 径向菜单）
   ├─ 包含软件列表（区分"已安装 / 未安装"）
   ├─ 观看数 / 导入数
   ├─ [导入到我的账户] CTA
   └─ [举报] 次要按钮
   ↓（点击导入）
[登录闸门]
   ├─ 已登录 → 直接进入导入
   └─ 未登录 → 弹登录框，登录成功后自动继续
   ↓
[导入策略选择]（仅径向菜单需要）
   ├─ 覆盖当前配置 (replace)
   ├─ 追加到空槽位 (merge)
   └─ 仅预览不导入 (preview_only)
   ↓
[导入执行]
   ├─ 生成新的本地 id（避免冲突）
   ├─ 按 bundleId 匹配本机软件
   ├─ 写入 store → 触发既有云同步
   ├─ 调用 share_imports 记录（防重复 + 计数）
   └─ Toast 成功 + 跳转对应页面高亮
```

### 3.5 管理方流程

```
[入口] 侧边栏 → "我的分享"
   ↓
[MySharesPage /my-shares]（需登录）
   ├─ 列表列：标题 / 类型 / 观看数 / 导入数 / 创建时间 / 状态 / 操作
   ├─ 行操作：复制链接 / 撤销 / 删除
   └─ 空态：引导去分享
```

### 3.6 举报与治理

- **前置过滤**：分享创建时，标题 + 描述过关键词黑名单（配置文件维护）
- **举报入口**：预览页 [举报] 按钮，提交理由（≤ 200 字）
- **自动隐藏**：累计举报 ≥ 3 → 自动设 `is_revoked=true`，链接返回 404
- **无审核后台**：MVP 靠自动机制兜底，v1.2 再补管理后台

### 3.7 数据统计

- 每次预览页加载 → `view_count += 1`（去重：同 IP + Token 5 分钟窗口只算一次）
- 每次成功导入 → `import_count += 1`（`share_imports` 唯一约束保证同用户不重复计数）

---

## 4. 非功能性需求

### 4.1 性能
| 指标 | 目标 |
|---|---|
| 分享创建接口 P95 | < 300ms |
| 预览页首屏 | < 1s |
| 一键导入端到端 | < 2s |
| 深链唤起响应 | < 500ms |

### 4.2 容量限制
| 项 | 上限 |
|---|---|
| 单个用户活跃分享数 | 100 |
| 单个 payload 大小 | 100 KB |
| 标题长度 | 50 字符 |
| 描述长度 | 200 字符 |
| 举报理由长度 | 200 字符 |

### 4.3 安全 & 隐私
1. Token 使用 nanoid 10 位，防暴力枚举
2. Payload **仅序列化必要字段**，禁止包含：邮箱、accessToken、AI API Key、径向菜单绑定的敏感应用密码
3. 分享者可随时撤销，撤销后新链接 404，但**已导入的用户不受影响**（快照本地化）
4. 匿名预览走 Supabase 匿名 client，不带用户 JWT
5. 举报 + 关键词黑名单双重防线
6. 180 天无访问的分享自动归档（`is_archived=true`）

### 4.4 兼容性
- 完全复用现有 Supabase + Zustand + Electron 架构
- 不改动 `workflows / favorites / favorite_groups / radial_configs` 现有表结构
- 未登录用户可预览，与现有 auth 流程解耦

---

## 5. 数据模型

### 5.1 新增表

#### `shares`（分享主表）
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigint identity | 主键 |
| `share_token` | text unique | 短码 (nanoid 10) |
| `owner_id` | text | 分享者 user_id |
| `owner_nickname` | text | 冗余：分享者昵称快照 |
| `kind` | text | `workflow` / `favorite_group` / `radial` |
| `title` | text | 分享标题 |
| `description` | text | 分享描述 |
| `payload` | jsonb | 内容快照 |
| `view_count` | int | 观看数 |
| `import_count` | int | 导入数 |
| `is_public` | boolean | 预留：链接可见 vs 广场公开 |
| `is_revoked` | boolean | 撤销标记 |
| `is_archived` | boolean | 归档标记 (180 天无访问) |
| `expires_at` | timestamptz | 可选过期时间 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

#### `share_imports`（导入记录）
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigint identity | 主键 |
| `share_id` | bigint FK | 关联 shares |
| `importer_id` | text | 导入者 user_id |
| `imported_at` | timestamptz | 导入时间 |
| 唯一约束 | `(share_id, importer_id)` | 防重复计数 |

#### `share_reports`（举报表）
| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigint identity | 主键 |
| `share_id` | bigint FK | 关联 shares |
| `reporter_id` | text | 举报者 user_id (可空，匿名) |
| `reason` | text | 举报理由 |
| `created_at` | timestamptz | 举报时间 |

### 5.2 RLS 策略要点
- `shares`：匿名可读**未撤销 && 未归档 && 未过期**记录；owner 可全操作
- `share_imports`：用户只可读/写自己的导入记录
- `share_reports`：任何登录用户可插入；owner_id / 管理员可读

详细 SQL 见配套建表脚本。

---

## 6. 接口设计（Renderer Service）

新增 `src/services/shares.service.ts`：

```ts
// 创建分享
createShare(input: {
  kind: 'workflow' | 'favorite_group' | 'radial';
  sourceId: string;                // 本地资源 id
  title: string;
  description?: string;
  expiresIn?: '7d' | '30d' | 'permanent';
}): Promise<{ shareToken: string; url: string }>

// 匿名读取（预览用）
getShareByToken(token: string): Promise<PublicShare | null>

// 我的分享列表
listMyShares(): Promise<Share[]>

// 撤销
revokeShare(id: number): Promise<void>

// 导入
importShare(
  token: string,
  strategy?: 'replace' | 'merge' | 'preview_only'
): Promise<{ importedId: string; missingSoftware: SoftwareMeta[] }>

// 举报
reportShare(shareId: number, reason: string): Promise<void>
```

配套 `src/services/share-serializer.ts` 负责 3 类内容的序列化/反序列化。

---

## 7. 页面 / 组件清单

| 路径 | 类型 | 登录要求 |
|---|---|---|
| `/share/:token` | 页面：预览 + 导入 CTA | ❌ 不需要 |
| `/my-shares` | 页面：分享管理 | ✅ 需要 |
| `ShareDialog.tsx` | 组件：创建分享弹窗 | ✅ 需要 |
| `RadialImportDialog.tsx` | 组件：径向菜单导入策略选择 | ✅ 需要 |
| `ShareCard.tsx` | 组件：分享列表项 | — |
| `SoftwareBadgeList.tsx` | 组件：软件安装状态徽标 | — |

---

## 8. 里程碑

### Phase 1（M1，2 周）— 核心闭环
- [ ] Supabase 建表 + RLS
- [ ] `shares.service.ts` + serializer
- [ ] 工作流分享 UI + 预览 + 导入
- [ ] 自定义 URL Scheme 注册
- [ ] "我的分享"管理页
- [ ] 举报 + 黑名单

### Phase 2（M2，1 周）— 补齐类型
- [ ] 收藏夹分组分享
- [ ] 径向菜单配置分享（含合并策略）
- [ ] 二维码生成
- [ ] 导入冲突处理

### Phase 3（M3，可选）— Web 中转页
- [ ] 独立 Web 落地页 + Open Graph
- [ ] 未安装用户下载引导

---

## 9. 关键风险与预案

| 风险 | 概率 | 影响 | 预案 |
|---|---|---|---|
| 用户分享意愿低 | 中 | 高 | MVP 埋点观察 2 周，不达标下线 |
| 恶意内容传播 | 中 | 中 | 举报 + 黑名单 + 手动隐藏 |
| Payload 冷启动数据爆炸 | 低 | 中 | 硬上限 + 定时归档 |
| Deep Link 在部分系统不生效 | 低 | 中 | Phase 3 补 Web 中转页 |
| 分享者撤销引发用户投诉 | 低 | 低 | 明确文案：撤销不影响已导入 |

---

## 10. 埋点与成功度量

### 埋点事件
- `share_create` — 分享创建成功（参数：kind、有效期）
- `share_view` — 预览页曝光
- `share_import_click` — 点击导入按钮
- `share_import_success` — 导入成功
- `share_revoke` — 分享撤销
- `share_report` — 举报提交

### 成功指标（上线后 4 周）
| 指标 | 目标值 |
|---|---|
| 分享创建数 | ≥ 500 |
| 唯一分享者占登录用户比例 | ≥ 8% |
| 预览 → 导入转化率 | ≥ 25% |
| 举报率 | < 2% |
| P95 导入耗时 | < 2s |

达标 → 启动 Phase 2 广场规划
未达标 → 复盘意愿低的原因，考虑功能下线

---

## 11. 附录

### 11.1 关联文档
- 主 PRD：[PRD.md](./PRD.md)
- 技术架构：[Technical-Architecture.md](./Technical-Architecture.md)
- 建表脚本 Phase 1：`.trae/documents/Community-Share-Schema.sql`
- 建表脚本 Phase 2：`.trae/documents/Community-Share-Phase2-Analytics.sql`
- Dry-run 验证脚本：`.trae/documents/Community-Share-DryRun.sql`

### 11.2 术语表
- **深链 (Deep Link)**：形如 `softdesk://` 的自定义 URL Scheme，用于唤起本应用
- **Payload 快照**：分享时序列化的当前内容副本，与源数据解耦
- **软件占位**：接收者未安装的软件在导入结果中以灰色卡片展示
- **漏斗事件**：`share_events` 表按事件类型串起来的 `create → copy → view → import_click → import_success` 完整链路
- **名称去重**：导入时若本地已存在同名工作流/收藏夹分组,自动追加 `(2) (3)` 后缀,不覆盖用户既有数据

---

## 12. Phase 2 增量（v1.1）

Phase 1 交付了「单向分享 + 一键导入」核心闭环。Phase 2 聚焦三件事：**验证核心假设的数据能力**、**兜住二次导入体感**、**扩大跨端分发能力**。

### 12.1 埋点体系（新增）

#### 12.1.1 数据模型
新增 `share_events` 表(明细流水,与 `shares.view_count / import_count` 计数器互补)：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigint identity | 主键 |
| `event_type` | text | 事件类型枚举(见下) |
| `share_id` | bigint FK | 关联 shares,可空(shares 被删除后置 null) |
| `share_token` | text | 分享码冗余,便于溯源 |
| `actor_id` | text | 触发用户 id,可空(匿名预览) |
| `kind` | text | 分享类型冗余 |
| `meta` | jsonb | 事件附加信息(耗时、冲突类型等) |
| `created_at` | timestamptz | 事件时间 |

#### 12.1.2 事件类型（9 类）
| 事件 | 触发时机 | 关键 meta |
|---|---|---|
| `share_create` | 用户在 ShareDialog 生成分享成功 | `expiry` |
| `share_copy` | 复制分享链接(区分创建流 vs 我的分享页) | `from=my_shares` |
| `share_view` | 预览页曝光(登录/匿名都埋) | — |
| `share_import_click` | 点击导入按钮 | `blocked_by / reimport` |
| `share_import_conflict` | 导入过程遇到冲突(重名/满槽) | `workflow_renamed / group_renamed / radial_slots_insufficient` |
| `share_import_success` | 导入成功 | `duration_ms / missing_software` |
| `share_revoke` | 撤销分享 | — |
| `share_delete` | 删除分享 | — |
| `share_report` | 提交举报 | `reason_length` |

#### 12.1.3 看板视图
- **`share_funnel_daily`**：每日漏斗 (creates → copies → views → import_clicks → import_success → conflicts / reports)
- **`share_top_creators`**：分享者 Top 榜(累计 view / import / 分享数)

#### 12.1.4 RLS 策略
- 任何人可 insert(匿名场景需要)
- actor 可读自己作为主体的事件
- shares owner 可读自己分享下的所有事件(供个人看板)

### 12.2 导入冲突处理（新增）

#### 12.2.1 场景 A · 工作流 / 收藏夹分组重名
**问题**：导入的工作流名称与本地已有工作流冲突,原实现会创建报错或名称重复。
**新方案**：调用 `dedupeName(desired, existing)` 自动追加 `(2)/(3)/...`,填补中间空位。
- 单元测试：[share-serializer.test.ts](../../src/services/share-serializer.test.ts) 覆盖 6 种场景

#### 12.2.2 场景 B · 用户重复导入同一分享
**问题**：用户可能不小心点两次「导入」,创建多份完全相同的副本。
**新方案**：预览页加载时通过 `hasUserImported(shareId, userId)` 查询 `share_imports` 记录,若曾导入过则弹出蓝色 sky 提示条,首次点击导入被拦截,二次点击才真正执行。

#### 12.2.3 场景 C · 径向菜单空槽不足
**问题**：merge 策略要把 N 个扇区导入到本地径向菜单,但空槽 < N,静默丢弃后半段。
**新方案**：
1. 预览页顶部实时显示"当前径向菜单剩余 N 个空槽"
2. merge 模式下 N < 需求量 → 显示 amber 警示条 + 建议切换到 replace
3. 用户仍强制导入 → 拦截并埋 `share_import_conflict` 事件

### 12.3 二维码分享（新增）

#### 12.3.1 依赖
- 引入 `qrcode ^1.5` (~3KB gzip) + `@types/qrcode`

#### 12.3.2 交互
- ShareDialog 生成分享成功后,异步生成 240×240 白底二维码,失败静默(不阻塞主流程)
- 复制按钮旁增加 QrCode 图标切换显示/隐藏
- 展开面板包含二维码大图 + 一键下载 `softdesk-share-{token}.png` 图片
- 二维码内容即分享深链 `softdesk://share/:token`,便于跨设备中转

### 12.4 服务层新增接口

| Service / 函数 | 用途 |
|---|---|
| `trackShareEvent(input)` | 通用埋点上报(fire-and-forget) |
| `hasUserImported(shareId, userId)` | 查询当前用户是否导入过该分享 |
| `dedupeName(desired, existing)` | 通用名称去重工具 |

### 12.5 单元测试覆盖

**新增文件**：[share-serializer.test.ts](../../src/services/share-serializer.test.ts)
- `dedupeName`: 6 组场景(无冲突/单冲突/多冲突/空位补齐/大小写/空 existing)
- `matchSoftware`: 5 组场景(bundleId/softwareId/name 兜底/已卸载排除/空列表)
- `serializeWorkflow / serializeFavoriteGroup / serializeRadial`: 4 组场景
- `isValidPayload`: 5 组场景
- **共 20 个测试用例,全部通过**

### 12.6 Phase 2 度量指标（新增)

在 Phase 1 度量之上追加：

| 指标 | 计算 | 判读 |
|---|---|---|
| **复制率** | `copies / creates` | < 60% → 分享内容不吸引人 |
| **预览曝光** | `views` (`share_funnel_daily`) | 累计增长曲线 |
| **导入转化率** | `import_success / views` | 核心北极星,目标 ≥ 25% |
| **冲突拦截率** | `import_conflict / import_click` | < 5% 说明命名系统健康 |
| **导入 P95 耗时** | `share_import_success.meta.duration_ms` P95 | 目标 < 2000ms |
| **缺失软件占比** | `avg(meta.missing_software / softwareMeta.length)` | > 30% 需要考虑跨账号软件目录同步 |

### 12.7 Dry-run 验证

配套脚本：[Community-Share-DryRun.sql](./Community-Share-DryRun.sql)
- 构造 3 条测试分享 + 一套完整事件流水
- 验证「累计 3 次举报自动撤销」触发器生效
- 验证 `share_funnel_daily` / `share_top_creators` 视图能查
- 结尾一段 CLEAN UP 自动清理所有测试数据

---

## 13. Phase 3 计划（v1.2 待定)

**开始条件**：Phase 2 上线 4 周后达标(导入转化率 ≥ 25% + 唯一分享者 ≥ 8%)

### 13.1 广场 / 发现
- 按类别/热度/最新排序的公开广场
- 支持点赞、收藏、评论
- 创作者主页 + 关注体系

### 13.2 举报管理后台
- 从"累计 3 次自动撤销"升级到"人工审核 + AI 前置筛"
- 引入内容审核 Edge Function

### 13.3 明确不做（红线）
- ❌ 付费分享 / 打赏(合规成本极高)
- ❌ 分享内容双向订阅同步(payload 快照优先)
- ❌ Web 中转页(桌面工具场景优先度低)

---
