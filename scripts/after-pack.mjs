import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const contentsPath = join(appPath, 'Contents');

  if (existsSync(contentsPath)) {
    const markerPath = join(contentsPath, '.metadata_never_index');
    writeFileSync(markerPath, '');
  }
}
