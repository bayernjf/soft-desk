/**
 * postinstall 钩子：在 macOS 上对开发模式的 Electron.app 做 ad-hoc 签名，
 * 防止 XProtect 将未签名的 Electron 二进制识别为恶意软件并自动删除。
 * 非 macOS 平台直接跳过。
 */
const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

if (process.platform !== 'darwin') {
  process.exit(0);
}

const electronApp = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'Electron.app'
);

if (!fs.existsSync(electronApp)) {
  console.log('[sign-dev-electron] Electron.app not found, skipping.');
  process.exit(0);
}

try {
  execSync(`codesign --force --deep --sign - "${electronApp}"`, {
    stdio: 'inherit',
  });
  console.log('[sign-dev-electron] Electron.app ad-hoc signed.');
} catch (err) {
  console.error('[sign-dev-electron] Failed (non-fatal):', err.message);
}
