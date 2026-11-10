# SoftDesk 深度代码评审报告

> 评审日期：2026-11-02
> 评审方式：只读静态评审 + 本地验证门实测（未修改任何源码、未提交任何 git 操作）
> 评审范围：`electron/`、`src/`、`supabase/migrations/`、`scripts/`、`.github/workflows/`、构建与测试配置、根目录及 `docs/` 文档。排除 `node_modules`、`dist`、`dist-electron`、`build`、`coverage`、`release` 产物目录。
> 基线提交：`910314f Merge pull request #41 from bayernjf/feature/20260622`（当前分支 `dev`，工作区干净，0 个未推送提交）

---

## 一、仓库定位与规模概览

SoftDesk 桌面应用版（原 `soft-desk-electron`）：本地软件管理与智能启动工具。

- **技术栈**：Electron 41 + Vite 6 + React 18 + TypeScript 5.8 + zustand 5 + Tailwind 3；本地存储 better-sqlite3（WAL）；云同步 Supabase（Postgres + Auth + RLS）；打包 electron-builder 26；自动更新 electron-updater（GitHub Releases）。
- **进程结构**：主进程（`electron/main.ts` 1719 行，含全部 IPC handler）+ 统一 preload（`electron/preload.ts`，contextBridge 白名单 API）+ 三个渲染入口（`index.html` 主窗口 / `radial.html` 径向菜单 / `animation.html` 光标爆炸动画）。
- **代码规模**：git 跟踪 162 个文件；手写 TS/TSX 约 26.7k 行（`wc -l` 实测），其中 `electron/` 12 个文件，`src/` 约 70 个文件。
- **云端表**：`shares / share_imports / share_reports / share_events / feedbacks / feedback_logs / product_events / announcements / favorites / favorite_groups / workflows / radial_configs / ai_configs`（前 8 张由 `supabase/migrations/001-009` 管理，后 5 张基础表由 `SUPABASE_SETUP.md` 手工建表 SQL 管理）。

## 二、结论摘要

| 严重度 | 数量 |
|--------|------|
| P0 | 0 |
| P1 | 3 |
| P2 | 6 |
| P3 | 9 |

**验证门实测全部通过**：ESLint 0 错误、`tsc -b --noEmit` 0 错误、Vitest 13 文件 181/181 通过、`npm run build` 成功、`npm audit --omit=dev` 0 漏洞。详见第六节。

**最关键的 3 条**：

1. **渲染进程 Token 明文落 localStorage，正面违反架构红线文档**（P1-1）。`src/lib/supabase.ts:6` 创建 client 未关 `persistSession`（supabase-js 默认 `persistSession: true`，见 `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:18`），`auth.store.ts:31-44` 的 `syncSupabaseSession()` 每次登录/回填都把 accessToken+refreshToken 写入渲染层 localStorage；而 `docs/Technical-Architecture.md:474/500/513` 与 `auth.store.ts:10` 注释均明文宣称"Token 禁止放 localStorage / 渲染进程无法读取明文 Token"。`session.bin` 的 safeStorage 加密因此形同虚设——同一份 Token 在磁盘上有明文副本。
2. **使用统计在 Windows 上完全失效**（P1-2）。`electron/monitor.ts:29-38` 的 `getFrontmostApp()` 只调 macOS 专属 `lsappinfo`，无任何 win32 分支（已 grep 确认），而 `main.ts:1664` 无条件 `startMonitor()`：Windows 上每 5 秒 spawn 一个必然失败的进程，统计页（`usage:getStats` 等，`main.ts:983-1027`）永远返回空。
3. **shares 表公开读策略允许枚举全部活跃分享，token 形同虚设**（P1-3）。`supabase/migrations/001:232-240` 的 `public read active shares` 策略只过滤 `is_revoked/is_archived/expires_at`，不校验 `is_public`、也不要求持有 token；anon key 随客户端分发（`vite.config.ts:67-68` 构建期内联），任何人可对 PostgREST 直接 `SELECT * FROM shares` 拉走所有用户的分享 payload（含昵称、软件清单）。

## 三、逐条发现（按严重度排序）

### P0（可被利用的安全问题 / 数据丢失 / 线上中断）

未发现实质问题。已检查：service-role key 未出现于仓库任何源码/文档（`grep -rn "SERVICE_ROLE\|service_role"` 全仓 0 命中）；`.env` 被 `.gitignore` 覆盖且未跟踪（`git check-ignore .env` 确认）；SQL 全部参数化（`electron/database.ts` 全部 `prepare` + 绑定参数）；launch/remove 有扫描白名单（`main.ts:867-884` `knownAppPaths`）+ Windows 路径前缀白名单（`window-locator.ts:272-285`）+ PowerShell 单引号转义（`window-locator.ts:297`、`scanner-win.ts:40`）；深链 token 有字符集/长度白名单（`main.ts:83`）。favorite_groups 曾存在的 RLS 漏洞已由 `009` 修复且 handoff 记录 anon key 复测通过（生产端执行结果**未确认**，本次评审无法远程复核）。

### P1（严重缺陷）

#### P1-1 渲染层 Supabase session 明文持久化到 localStorage，违反安全红线文档

- **位置**：`src/lib/supabase.ts:6`（`createClient(url, key)` 未传 `auth.persistSession: false`）；`src/stores/auth.store.ts:31-44`（`syncSupabaseSession` 调 `setSupabaseSession`）；默认值证据 `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:18`（`persistSession: true`）。
- **影响**：登录后 accessToken/refreshToken 以明文写入 Electron 渲染进程 Local Storage（leveldb，磁盘明文），与 `docs/Technical-Architecture.md:474`「accessToken/refreshToken 维持登录态，**禁止放 localStorage**」、`:500`「Token 走 safeStorage，不进 localStorage」、`:513`「渲染进程……无法直接读取明文 Token」、`auth.store.ts:10` 注释「绝不在 localStorage 存放 Token」全部矛盾。`electron/auth.ts:81-89` 用 safeStorage 加密落盘 `session.bin` 的保护被这份明文副本架空。任何渲染层 XSS 或对本机 userData 目录的读取都可直接拿走长期有效的 refreshToken。
- **修复建议**：二选一——(a) 渲染层 supabase client 改为 `createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })`，每次启动经 `auth:getTokens` 拿 token 后仅内存 setSession；或 (b) 让渲染层不直连 Supabase，数据访问全部收口到主进程（与 AI 推理的架构一致），token 彻底不出主进程。同时修订文档或代码使二者一致。

#### P1-2 使用时长监控仅实现 macOS，Windows 端统计功能整体失效

- **位置**：`electron/monitor.ts:27-38`（`getFrontmostApp` 只调 `lsappinfo`，`catch` 后返回 `undefined`，`tick()` 直接 return）；`main.ts:1664`（`startMonitor()` 无平台判断）。`grep "win32|platform" electron/monitor.ts` 0 命中。
- **影响**：Windows 用户的使用统计、共现分析、工作流建议、24 小时节律、时段分布（`main.ts:983-1027` 全部 `usage:*` IPC）永远无数据；且每 5 秒（`POLL_INTERVAL_MS`，`monitor.ts:9`）产生一次注定失败的进程 spawn，属于持续噪音开销。仓库提供 Windows 安装包（`package.json` `dist:win`、`.github/workflows/build-win.yml`），该缺陷面向真实发布对象。
- **修复建议**：Windows 端用 `Get-Process`/`user32 GetForegroundWindow`（项目已有 PowerShell P/Invoke 先例 `window-locator.ts:184-256`）实现等价前台窗口探测，并在 `startMonitor` 加平台分支；至少在 Windows 上短路 monitor 并在统计页给出"暂不支持"提示，避免静默空数据。

#### P1-3 shares 表"公开读"策略可被 anon key 枚举全量分享

- **位置**：`supabase/migrations/001_community_share_schema.sql:232-240`（策略 `public read active shares`：`using (is_revoked = false and is_archived = false and (expires_at is null or expires_at > now()))`，无 `is_public`、无 token 条件）；anon key 打包进客户端：`vite.config.ts:67-68`、`src/lib/supabase.ts:3-6`。
- **影响**：分享设计意图是"知道 `softdesk://share/<token>` 链接才能看"（10 位 token，`shares.service.ts:58-72`），但 RLS 策略实际允许任何持有 anon key 的人不带 token 拉取**全部**活跃分享的 `payload`（工作流/收藏分组/径向配置快照，含软件名、bundleId、base64 图标）与 `owner_nickname`。`is_public` 字段（`001:42`，注释自称"预留： 广场公开开关"）在策略中完全未生效。属设计层面的数据过度暴露。
- **修复建议**：在 `public read active shares` 策略的 `using` 中追加 `and is_public = true`，并把创建分享时的默认值改为 `is_public = false`；或将按 token 预览改为 `security definer` RPC（入参 token、只返回单行），撤掉对 `shares` 的公开 SELECT 策略。

### P2（质量 / 可维护性 / 性能）

#### P2-1 工作流登录同步：先无条件 upsert 本地、后拉云端，旧设备可覆盖新数据

- **位置**：`src/services/workflows.service.ts:114-128`（`syncWorkflowsOnLogin` 先把全部本地工作流 upsert 上云，然后才 select 云端）；时间戳合并只在本地内存做（`mergeWorkflows:79-100`）。
- **影响**：两台设备场景下，持有过期本地副本的设备登录瞬间会用旧数据覆盖云端较新行（upsert 已发生），随后内存合并虽按 `updatedAt` 选了云端版，云端数据已被写脏。数据一致性缺陷。
- **修复建议**：先拉云端、按 `updatedAt` 合并后，仅把"本地更新"的行 upsert 回云端。

#### P2-2 `ai:getProviders` 把明文 apiKey 送回渲染层，与自身注释声明矛盾

- **位置**：`electron/ai.ts:151-154`（`getProviders` 返回未脱敏的 `rawProviders`，含 apiKey）；`main.ts:1392-1398`；矛盾注释 `main.ts:1379-1380`（"apiKey 不再随业务 IPC 往返暴露给页面"）。渲染层确在 store 内存长期持有 apiKey（`settings.store.ts:142-160` `reviveProviderConfig`）。
- **影响**：渲染进程一旦被注入（XSS），攻击面从"只能发起推理"扩大为"直接打包带走全部 AI apiKey"。当前渲染层 XSS 入口有限（仅 3 处 `dangerouslySetInnerHTML`，均为静态 SVG，`src/lib/avatars.ts` 固定数组 + 索引钳制），故不定 P1。
- **修复建议**：`ai:getProviders` 返回时剥离 apiKey、仅回 `apiKeyHint`；设置页编辑时"留空=保持不变"的语义 `buildProviderConfig` 已支持（`settings.store.ts:166`），不依赖渲染层持有明文。

#### P2-3 "记住我"开关不生效

- **位置**：UI 开关 `src/pages/Account.tsx:332`（`rememberMe`）；store 仅用它决定 `lastEmail`（`auth.store.ts:139,198`）；主进程 `electron/auth.ts:189` `persistSession(currentSession)` 无条件持久化，无任何对 rememberMe 的判断。
- **影响**：用户取消"记住我"后重启应用仍处于登录态（session.bin 已写盘）。属于安全语义的承诺落空（公共电脑场景）。
- **修复建议**：把 rememberMe 经 `auth:login`/`auth:register` IPC 传入主进程，`persistSession` 仅在 true 时落盘；false 时仅保留内存会话。

#### P2-4 收藏/工作流云同步携带 base64 图标 data URL

- **位置**：`src/services/favorites.service.ts:83`（`icon: software.icon`，icon 为扫描器生成的 `data:image/png;base64,...`，见 `electron/scanner.ts:112-120`）；`src/stores/software.store.ts:101-122` `buildSoftwareMeta` 含 icon，经 `workflows.service.ts:63-70` 上云；分享 payload 同样携带（`share-serializer.ts` 链路 + `shares.service.ts` 100KB 上限）。
- **影响**：单张 128px PNG base64 约 10-30KB，数百收藏/工作流会使 favorites/workflows 表行体积膨胀一个数量级；跨设备拉取与分享创建（100KB payload 硬上限，`001:50-51`）都因此更易触顶。且 Mac 生成的图标对 Windows 设备无意义（平台已隔离但 favorites 表无 platform 列——`SUPABASE_SETUP.md:19-32`，favorites 跨平台同步，data URL 图标在异平台设备上是死数据）。
- **修复建议**：云端只存图标类型/颜色/bundleId，图标在本机按扫描缓存重建；或单独 icons 表按 content-hash 去重。

#### P2-5 三张 HTML 入口均无 Content-Security-Policy

- **位置**：`index.html`（全文无 CSP meta）、`radial.html`、`animation.html`；`grep -rn "Content-Security-Policy"` 全仓（排除产物目录）0 命中。
- **影响**：Electron 安全基线缺一层。当前窗口导航/开窗已拦截（`main.ts:791-801`），风险有限；但一旦发生渲染层注入（结合 P1-1/P2-2，renderer 内有 token 与 apiKey），无 CSP 意味着可直接外联 exfiltrate。
- **修复建议**：为三个入口加 `<meta http-equiv="Content-Security-Policy">`，至少限制 `default-src 'self'`、`connect-src 'self' https://*.supabase.co`、`img-src 'self' data:`；或主进程 `session.defaultSession.webRequest.onHeadersReceived` 统一注入。

#### P2-6 `ai:test` 允许渲染层指定任意 endpoint 由主进程发带凭证请求

- **位置**：`main.ts:1323-1377`（endpoint 仅 trim，无协议/主机白名单；`joinChatCompletionsUrl` 后直接 fetch，带 `Authorization: Bearer`）。
- **影响**：被注入的渲染层可借主进程（无 CORS 限制）向内网/元数据地址（如 `http://169.254.169.254`）发请求并读回响应体片段（错误信息回传含响应 body 前 200 字符，`main.ts:1355-1364`）。属低概率 SSRF 面。
- **修复建议**：endpoint 强制 `https:`（或显式允许 `localhost`/`127.0.0.1` 白名单），回传错误不再携带响应体。

### P3（体验 / 规范）

1. **macOS 分发无签名无公证**：`package.json` `build.mac.identity: null`、`hardenedRuntime: false`、`gatekeeperAssess: false`（adr 式选择，handoff 已记录 ad-hoc 签名冒烟通过）。用户首装需绕过 Gatekeeper；上线前建议接 Apple Developer 签名+公证。
2. **使用统计口径误差**：`monitor.ts:45-62` `flushCurrent` 把整段会话计入开始日（跨零点失真），机器睡眠时长计入使用时长（tick 恢复后 `lastTick=now` 直接累加）。文档未声明该口径。
3. **测试缺口**：181 个测试集中在纯函数/服务层（`electron/ai.test.ts`、`src/services/*.test.ts` 等 13 个文件）；`electron/database.ts`（使用统计核心写路径）、`electron/auth.ts`、`electron/monitor.ts`、`electron/scanner*.ts`、`electron/updater.ts`、`src/services/shares.service.ts`、`favorites.service.ts`、`announcement.service.ts`、`feedback.service.ts` 均无测试。`vitest.config.ts` 未配置覆盖率阈值，覆盖率不构成交付门。另：`ErrorBoundary.test.tsx` 的预期错误栈直接打到测试输出（本次实测可见多段 `Error: page blew up` 噪音），建议 mock console。
4. **迁移链不自足**：`favorites / favorite_groups / workflows / radial_configs / ai_configs` 五张基础表只在 `SUPABASE_SETUP.md` 的手工 SQL 里，`supabase/migrations/001` 头部自述"Requires existing workflows / favorites / favorite_groups / radial_configs"。全新部署仅按 migrations 目录执行建不齐 schema。且 9 个迁移文件命名均为名词式（`001_community_share_schema.sql`），违反本仓 `MIGRATION_CONVENTION.md:18-28` 的"动词开头"规则；9 个文件头部 `Date` 全部被统一重写为 `2026-09-09 22:34`（`git log` 显示 `6f787dd chore: standardize database migration files` 批量改写），违反该规范"`-- Date:` 创建后不再编辑"的要求。
5. **handoff.md 已过时**：`handoff.md:14-22` 称"当前状态（分支 feature/20260622）、本地领先 origin 20 余个提交尚未推送"，实际当前在 `dev` 分支、工作区干净、领先 0 提交，且该 feature 分支已经 PR #41 合并（`910314f`）。
6. **Smoke-Test-Checklist 两处与代码不符**：`docs/Smoke-Test-Checklist.md:8` 称端口"被占用时自动顺延到 5174"，但 `vite.config.ts:17-20` 是 `strictPort: true`（占用即失败）；同文件称浏览器预览会 fallback 到 `MOCK_SOFTWARE` mock 数据，但 `src/` 全仓 grep 无 `MOCK_SOFTWARE`（仅测试文件命中 mock 字样）。
7. **`package.json` 含 npm 下无效的 bun 专属字段**：`trustedDependencies`（:92-99）与 `allowScripts`（:173-180）对 npm 无作用，`postinstall` 里的原生模块编译实际由 `electron-builder install-app-deps` 承担。易误导协作者以为 npm 会尊重这些白名单。
8. **排序同步 N 次请求**：`favorites.service.ts:286-299` `reorderCloudFavorites` 对每次拖拽发起 N 条 UPDATE（Promise.all），`syncFavoritesToCloud:126-131` 串行 await 逐条 upsert。数据量小可接受，但建议改 RPC 批量。
9. **Gemini apiKey 拼在 URL query**：`electron/ai.ts:298-300`（`?key=...`）。URL 易随代理/错误日志泄露；当前 `extractError` 不回传 URL、logger 有脱敏（`electron/lib/logger.ts:28-31`），风险低。建议改用 `x-goog-api-key` 请求头。

## 四、按评审维度的小结

1. **整体架构与模块边界**：主/渲染进程边界清晰——contextIsolation + nodeIntegration:false + sandbox 默认开（`main.ts:782-788`，含 `SOFTDESK_NO_SANDBOX` 受限环境逃生门）；preload 为窄通道白名单（`preload.ts` 全量 143 行，无 `ipcRenderer` 裸暴露）；launch/remove 经扫描白名单二次校验。主要瑕疵：三个窗口共用同一 preload，径向菜单这种纯展示窗口也持有含 `getAuthTokens`/`removeSoftware` 的完整 API 面（`preload.ts:78,18`），建议按窗口拆分最小权限 preload。
2. **正确性与潜在 bug**：见 P1-2（Windows 监控失效）、P2-1（同步覆盖）、P2-3（rememberMe 失效）、P3-2（统计口径）。其余核心路径（深链冷启动 token 缓存 `main.ts:87-106`、单实例锁 `:1606-1621`、uiohook tsfn 防 abort `:375-399`）设计严谨。
3. **安全**：见 P1-1、P1-3、P2-2、P2-5、P2-6、P3-1、P3-9。值得肯定：日志管道有完整脱敏链（`electron/lib/logger.ts:28-91`，Bearer/JWT/email/敏感 key/home 目录全覆盖）；渲染层日志注入有长度/条数校验（`main.ts:829-856`）；分析事件有 meta key 白名单 + 双重同意门（`analytics.service.ts:43-56,264-272`）。
4. **数据模型与迁移一致性**：9 个迁移幂等（`IF NOT EXISTS`/`drop policy if exists`）、头注释齐全、未发现改写已部署迁移的痕迹（`git log` 仅一次批量标准化改名/重写头，内容未变这一点**未逐一 diff 确认**）。问题见 P3-4（链不自足 + 命名/Date 违规）。RLS 覆盖逐文件核对：shares/imports/reports（001）、share_events（002:65-87）、feedbacks（006:83-123）、product_events（007:86-106，插入开、查询关，符合遥测语义）、announcements（008:69-73，公开读，公告本身即公开内容，合理）、favorite_groups（009）。唯一实质问题是 P1-3。
5. **错误处理与失败模式**：整体良好——AI 请求有 30s 超时（`ai.ts:180-190`）、ai:test 有 20s 超时（`main.ts:1333-1334`）、云端服务普遍 try/catch + 日志 + 降级返回空。瑕疵：云同步大量 `void promise` 失败仅打日志用户无感知（如 `software.store.ts:321,348`）；主进程无 `process.on('unhandledRejection')` 兜底（未确认是否有意为之）。
6. **测试覆盖与验证门真实性**：见第三节 P3-3 与第六节实测。CI（`.github/workflows/ci.yml`）在 macOS+Windows 双端跑 lint/typecheck/test/build，门禁真实；但 E2E/冒烟全靠人工 checklist，无自动化。
7. **依赖与构建健康**：`npm audit --omit=dev` 0 漏洞；锁文件为 npm 的 `package-lock.json`（无 pnpm/yarn/bun 锁混杂）；Electron 41.10.7 已修掉 32 条告警（handoff 记录，本次未独立复核）；`npm run build` 实测通过。瑕疵见 P3-7（bun 字段误导）。
8. **明显性能热点**：未发现需要立即处理的热点。已核查：图标抽取有版本化磁盘缓存 + 清理（`scanner.ts:16-40`）、FSEvents 400ms 去抖（`scanner.ts:687-719`）、Windows 改 10 分钟轮询（`scanner.ts:694-699`）、大列表用 `content-visibility` 准虚拟化（`LazyMount.tsx:15-25`）、`getUsageSummary` 已避免相关子查询（`database.ts:101-122`）。每次全量扫描把全部图标 base64 经 IPC 推渲染层（171 图标场景 handoff 实测 340s 主要是 sips 提取，IPC 体积 MB 级），可接受但值得记录。P3-8 为小倍数放大。
9. **文档与实现一致性**：抽查 8 处——① handoff「181 单测全过」✅ 实测属实；② 架构文档 Token 红线 ❌（P1-1）；③ 冒烟清单端口顺延 ❌（P3-6）；④ 冒烟清单 MOCK_SOFTWARE ❌（P3-6）；⑤ SUPABASE_SETUP 与 005/008 迁移存在性 ✅；⑥ handoff 分支/推送状态 ❌ 过时（P3-5）；⑦ README 命令表与 package.json scripts ✅ 一致；⑧ MIGRATION_CONVENTION 命名规则 ❌ 自身未遵守（P3-4）。

## 五、验证门实际执行结果

在仓库根目录实际执行（Node 环境为仓库既有 node_modules，未新装依赖）：

| 命令 | 结果 | 备注 |
|------|------|------|
| `npm run lint`（eslint .） | ✅ 通过，0 错误 0 警告 | 输出为空即通过 |
| `npx tsc -b --noEmit`（= `npm run check`） | ✅ 通过，exit 0 | 首次经 `npm run check` 触发超 2 分钟转后台，重跑裸 `tsc` 通过 |
| `npm test`（vitest run） | ✅ 13 个测试文件、181/181 通过，5.99s | 输出含 ErrorBoundary 用例的预期错误栈噪音（见 P3-3） |
| `npm run build`（tsc -b + vite build ×3 入口） | ✅ 通过，exit 0；最大 chunk `dist-electron/main-*.js` 789KB（gzip 176KB） | 无构建警告阻塞 |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities | 需联网，已执行成功 |

未执行项：`npm run dist:mac` / `dist:win`（ electron-builder 全量打包 + 原生模块重编译，预计远超 3 分钟且写 `release/` 产物，超出只读评审的快速验证范围）；E2E 不存在（仓库无 Playwright/Cypress 配置，冒烟靠 `docs/Smoke-Test-Checklist.md` 人工执行）。

## 六、修复优先级建议

**第一批（本周内）**：
1. P1-1：渲染层 supabase client 关 `persistSession`，消除 localStorage 明文 token（改动小、收益大）。
2. P1-3：shares 公开读策略补 `is_public = true` 条件（一条新 migration；注意先确认现存行 `is_public` 分布，避免误伤在用的分享链接）。
3. P2-3：rememberMe 透传主进程，恢复开关语义。

**第二批（下个迭代）**：
4. P1-2：Windows 前台窗口监控（复用 `window-locator.ts` 的 P/Invoke 模式）。
5. P2-1：workflows 同步改为"先拉后合并再回写"。
6. P2-2：`ai:getProviders` 脱敏返回。
7. P2-5：三入口补 CSP。

**第三批（持续改进）**：
8. P2-4 图标上云瘦身；P2-6 endpoint 白名单。
9. P3 批量：迁移命名/日期规范化、handoff 与冒烟清单刷文档、`package.json` 清理 bun 字段、测试补 `database.ts`/`shares.service.ts` 并设覆盖率阈值、mac 公证评估。

---

*本报告所有结论均可在上述 file:line 或已列命令输出中复核；标注"未确认"处为本次评审环境无法验证的事项（生产库实际状态、handoff 中历史冒烟结论等）。*
