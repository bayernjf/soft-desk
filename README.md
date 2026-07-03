# SoftDesk (Desktop)

SoftDesk 桌面应用版,基于 Electron 打包(`electron/` + `electron-builder`),与纯网页版共享同一套 React 源码。

> **命名说明**:本仓库原名 `soft-desk-electron`,现已接管主名 `soft-desk` 作为桌面版主仓库。纯网页版见 [soft-desk-web](https://github.com/bayernjf/soft-desk-web)。

---

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

```bash
# 安装依赖
npm install

# 启动开发模式(热重载 + DevTools)
npm run dev
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发模式(Vite + Electron,热更新,秒启) |
| `npm run restart` | 杀掉残留 Electron 进程后重新启动 dev |
| `npm run check` | TypeScript 类型检查 |
| `npm run lint` | ESLint 代码检查 |
| `npm run test` | 运行单元测试(vitest) |
| `npm run build` | 生产构建(tsc + vite build,输出到 `dist/` + `dist-electron/`) |
| `npm run dist:mac` | 本地打 macOS 安装包(.dmg + .zip,输出到 `release/`) |
| `npm run dist:win` | 本地打 Windows 安装包(.exe NSIS,输出到 `release/`) |

### 三种运行方式对比

| 对比项 | 命令行 dev 模式 | 本地打包安装 | CI 构建安装包 |
|--------|----------------|-------------|--------------|
| **怎么启动** | `npm run dev` | `npm run dist:mac` 后装 `.dmg` | GitHub Actions 产物下载 `.dmg` / `.exe` |
| **代码更新** | 改完自动热重载(Vite HMR) | 改完要重新打包重装 | push 代码触发 CI,等几分钟 |
| **调试工具** | Chrome DevTools、Console 全有 | 只有主进程日志,调试麻烦 | 完全无调试工具 |
| **环境变量** | 读本地 `.env` + `node_modules` | 打包进 asar,用生产配置 | CI Secrets 注入 |
| **速度** | 秒启 | 打包 2-5 分钟 | CI 跑 5-15 分钟 |
| **原生模块** | 直接用本地 rebuild 的 | 打包进 asar,跟生产一致 | 跟生产完全一致 |
| **适用场景** | 日常开发、调 bug | 发布前本地验证、回归测试 | 给别人测、跨端验证、正式发版 |

### 推荐工作流

```
1. 日常开发 → npm run dev (快,能调试,有 DevTools)
    ↓
2. 功能做完 → push 代码 → CI 自动出包
    ↓
3. 自己验证 → 本地 npm run dist:mac 装一下试试
    ↓
4. 给别人测 → 发 CI 构建产物链接
    ↓
5. 正式发版 → 打 tag → release.yml 自动发 GitHub Release
```

### 什么时候必须用安装包测?

1. **原生功能验证** — 托盘、全局快捷键(uiohook)、本地数据库(better-sqlite3)、软件扫描这些跟系统交互的功能,dev 模式和打包后行为可能不一致
2. **发布前验证** — 确保打包后的 asar 产物没丢文件、图标正常、签名正常
3. **跨端测试** — 比如在 Mac 上开发,要验证 Windows 端扫描/图标是否正常
4. **给非开发人员测** — 产品/测试同学不用搭环境,双击安装就行
5. **性能测试** — dev 模式有 source map 和调试代码,性能不准

---

## 安装与已知提示

### macOS: 首次打开提示 “SoftDesk 已损坏,无法打开”

**这不是文件损坏**,是 macOS Gatekeeper 对**未经 Apple Developer ID 签名 + 公证**的 dmg 的默认拦截。当前 GitHub Actions 打包出的 dmg 只做了 ad-hoc 签名,系统会给从浏览器下载的 dmg 打 `com.apple.quarantine` 标记并直接判为 “已损坏”。

**解决方式(任选其一)**:

1. **推荐**:装完 SoftDesk 后,在 **终端** 里跑一条命令去除隔离标记:

   ```bash
   xattr -cr /Applications/SoftDesk.app
   ```

   之后双击即可正常打开,只需操作一次。

2. **不安装到 Applications**:如果你把 SoftDesk 拖到了其它位置,把上面路径改成实际路径即可。

3. **未来无感体验**:等我们接入 Apple Developer ID($99/年) + 公证后,此步骤将不再需要。届时自动更新也会全程无感。

### Windows: SmartScreen 阻止运行

Windows 会对未签名的 exe 弹一次 “Windows 已保护你的电脑” 蓝框。点击左上角 **“更多信息” → “仍要运行”** 即可。首次装完后不再提示。

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  extends: [
    // other configs...
    // Enable lint rules for React
    reactX.configs['recommended-typescript'],
    // Enable lint rules for React DOM
    reactDom.configs.recommended,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```
