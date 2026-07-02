# SoftDesk (Desktop)

SoftDesk 桌面应用版,基于 Electron 打包(`electron/` + `electron-builder`),与纯网页版共享同一套 React 源码。

> **命名说明**:本仓库原名 `soft-desk-electron`,现已接管主名 `soft-desk` 作为桌面版主仓库。纯网页版见 [soft-desk-web](https://github.com/bayernjf/soft-desk-web)。

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
