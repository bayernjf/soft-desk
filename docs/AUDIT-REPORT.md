# SoftDesk 代码审计报告

> 审计日期：2026-07-29  
> 分支：`feature/20260622`  
> 审计范围：完整代码库（electron/ + src/）

---

## 执行摘要

| 审计维度 | 问题数量 | 严重 | 高 | 中 | 低 |
|---------|---------|------|-----|-----|-----|
| 安全审计 | 10 | 0 | 1 | 0 | 9 |
| 性能审计 | 16 | 2 | 5 | 6 | 3 |
| 架构审计 | 28 | 3 | 7 | 13 | 5 |
| **总计** | **54** | **5** | **13** | **19** | **17** |

**整体评估**：代码库整体质量良好，安全基础扎实，但存在内存泄漏、架构臃肿等问题需要优先修复。

---

## 一、安全审计

### 🔴 中风险（1项）

#### 1. Shell 命令注入风险
**文件**：`electron/window-locator.ts:274-278`, `electron/scanner.ts`  
**描述**：PowerShell 脚本中仅转义单引号，未验证可执行路径是否在预期目录内  
**修复建议**：
```typescript
// 添加路径白名单验证
const ALLOWED_PREFIXES = ['/Applications', '/System/Applications', '/Users'];
function isPathAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix));
}
```

### 🟡 低风险（9项）

| # | 问题 | 文件 | 描述 | 建议 |
|---|------|------|------|------|
| 2 | XSS（低风险） | `Account.tsx:130`, `Sidebar.tsx:264` | `dangerouslySetInnerHTML` 渲染静态 SVG | 考虑改用 SVG 组件或 DOMPurify |
| 3 | executeJavaScript | `main.ts:686-688` | 直接执行 JavaScript 代码 | 改用 IPC 消息传递 |
| 4 | Path Traversal | `window-locator.ts:274-275` | 路径转义不完整 | 使用白名单验证 |
| 5-10 | 其他低风险项 | 多处 | 主要是代码模式问题 | 详见详细报告 |

### ✅ 安全亮点

- **SQL 注入防护**：所有数据库查询使用参数化查询
- **敏感数据加密**：Token、API Key 使用 `safeStorage` 加密存储
- **IPC 安全**：启用了 `contextIsolation`，最小化暴露 API
- **RLS 策略**：Supabase 表已启用行级安全

---

## 二、性能审计

### 🔴 严重（2项）

#### 1. 内存泄漏：未移除的 Event Listener
**文件**：`src/stores/settings.store.ts:100-108`  
**描述**：`watchSystemTheme()` 添加的 `change` 监听器从未移除  
**修复**：
```typescript
export function watchSystemTheme() {
  if (systemThemeWatching || typeof window === 'undefined') return () => {};
  systemThemeWatching = true;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => { /* ... */ };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
```

#### 2. 内存泄漏：Document Event Listeners
**文件**：`SoftwareCard.tsx:97-106`, `337-347`  
**描述**：`mousedown` 事件监听器清理可能不及时  
**修复**：使用 ref 跟踪 handler 确保稳定清理

### 🟠 高风险（5项）

#### 3. 低效算法 O(n²)
**文件**：`src/services/software-matching.ts:14-29`  
**描述**：`nameSimilarity` 函数嵌套循环，字符匹配使用 `includes()`  
**修复**：
```typescript
function nameSimilarity(a: string, b: string): number {
  // ...
  const longerSet = new Set(longer);  // O(m) 预处理
  let hit = 0;
  for (const ch of shorter) {
    if (longerSet.has(ch)) hit++;  // O(1) 查找
  }
  return (hit / longer.length) * 0.5;
}
```

#### 4. 缺少 useMemo
**文件**：`Dashboard.tsx:89-92`  
**描述**：`topApps` 和 `recentApps` 每次渲染都重新排序  
**修复**：
```typescript
const topApps = useMemo(() => 
  [...software].sort((a, b) => b.usageMinutes - a.usageMinutes).slice(0, 5),
  [software]
);
```

#### 5-7. 其他高风险性能问题
- Dashboard StatCard 重复计算
- Main Process 同步文件操作阻塞
- Category overview 重复过滤

---

## 三、架构审计

### 🔴 严重（3项）

#### 1. God Object：main.ts 过于臃肿
**文件**：`electron/main.ts` (1720+ 行)  
**描述**：单文件处理窗口管理、40+ IPC handlers、托盘、快捷键等  
**修复建议**：
```
electron/
  ipc/
    handlers/
      auth.ts
      software.ts
      radial.ts
  window-manager.ts
  tray-manager.ts
  shortcut-manager.ts
```

#### 2. 静默错误吞噬
**文件**：多处 `.catch(() => {})`  
**位置**：
- `scanner.ts:34-35`, `690`
- `ai.ts:198`
- `auth.ts:86-88`
**修复**：至少使用 logger 记录错误

#### 3. 未处理的 Promise Rejection
**文件**：`software.store.ts:217`, `195`  
**描述**：fire-and-forget 调用没有错误处理  
**修复**：添加 `.catch()` 处理器

### 🟠 高风险（7项）

#### 4. 跨平台代码重复
**文件**：`scanner.ts` (759行), `scanner-win.ts` (1078行)  
**描述**：图标缓存、分类检测逻辑重复  
**修复**：创建 `BaseScanner` 抽象类

#### 5. Store 循环依赖
**文件**：`software.store.ts` ↔ `settings.store.ts`  
**描述**：通过 `registerRadialSyncBridge` 形成循环  
**修复**：使用事件驱动或中介者模式

#### 6. 过度类型断言
**文件**：多处 `as` 关键字  
**位置**：`auth.ts:54-56`, `shares.service.ts:166-249`  
**修复**：使用类型守卫替代断言

#### 7. 缺少 Error Boundary
**描述**：React 组件没有错误边界，单点故障会崩溃整个应用  
**修复**：实现 `ErrorBoundary` 组件

#### 8-10. 其他高风险架构问题
- TypeScript 配置不够严格 (`strict: false`)
- 类型定义重复
- 数据库操作缺少事务安全

---

## 四、问题统计

### 按文件分布

| 文件 | 问题数 | 最高严重级别 |
|------|--------|-------------|
| `electron/main.ts` | 12 | 严重 |
| `electron/scanner.ts` | 8 | 严重 |
| `src/pages/Dashboard.tsx` | 6 | 高 |
| `src/stores/settings.store.ts` | 5 | 严重 |
| `src/stores/software.store.ts` | 5 | 严重 |
| `electron/window-locator.ts` | 4 | 中 |
| `src/components/features/SoftwareCard.tsx` | 4 | 严重 |
| `electron/auth.ts` | 4 | 高 |
| 其他文件 | 6 | 中/低 |

### 按类别分布

```
安全:  ████████░░░░░░░░░░░░ 10项
性能:  █████████████░░░░░░░ 16项
架构:  ████████████████████████ 28项
```

---

## 五、优先修复建议

### P0 - 立即修复（严重级别）

1. [ ] 修复 `settings.store.ts` 内存泄漏（Event Listener）
2. [ ] 修复 `SoftwareCard.tsx` 内存泄漏（Document 事件）
3. [ ] 添加错误日志（替换所有空 catch 块）
4. [ ] 处理未捕获的 Promise 异常
5. [ ] 拆分 `main.ts` 为多个模块

### P1 - 本周修复（高优先级）

1. [ ] 优化 `software-matching.ts` 算法（O(n²) → O(n)）
2. [ ] 为 Dashboard 添加 useMemo 优化
3. [ ] 创建 BaseScanner 抽象类
4. [ ] 实现 React Error Boundary
5. [ ] 修复 Store 循环依赖

### P2 - 后续优化（中低优先级）

- 替换 `dangerouslySetInnerHTML`
- 启用严格 TypeScript 配置
- 统一类型定义位置
- 添加路径白名单验证

---

## 六、附录

### 运行诊断命令

```bash
# 类型检查
npm run check

# 代码规范
npm run lint

# 测试
npm run test

# 构建
npm run build
```

### 审计工具

- 静态分析：ESLint + TypeScript Compiler
- 代码复杂度：人工审查
- 安全检查：模式匹配审查
- 性能分析：代码审查

---

*报告生成时间：2026-07-29*  
*下次建议审计时间：一个月后或重大版本发布前*
