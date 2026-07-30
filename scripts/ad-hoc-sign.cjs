const { execSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function (context) {
  // context.appOutDir 是包含 .app 的目录，例如 release/mac/
  // 构造 .app 的完整路径
  const productName = context.packager.appInfo.productName;
  const appPath = path.join(context.appOutDir, `${productName}.app`);

  console.log(`[ad-hoc-sign] Signing: ${appPath}`);
  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, {
      stdio: 'inherit',
    });
    console.log('[ad-hoc-sign] Done.');
  } catch (err) {
    console.error('[ad-hoc-sign] Failed:', err.message);
    // 不阻断构建流程
  }
};
