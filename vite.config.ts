import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv('', process.cwd(), 'VITE');

// https://vite.dev/config/
export default defineConfig({
  // 固定 dev 端口并禁止自动切换:Electron 的 localStorage 按 origin(含端口)隔离,
  // 端口漂移会导致换到全新的空 localStorage,引发"重启后配置丢失"的假象。
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: path.join(__dirname, 'index.html'),
        radial: path.join(__dirname, 'radial.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store)[\\/]/.test(
                id
              )
            ) {
              return 'react-vendor';
            }
          }
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    tsconfigPaths(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: ['electron', 'better-sqlite3', 'ws', 'uiohook-napi'] },
          },
          define: {
            'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
            'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
              fileName: () => 'preload.cjs',
            },
            rollupOptions: {
              external: ['electron'],
            },
          },
          plugins: [
            {
              name: 'preload-force-cjs',
              // vite-plugin-electron 的 lib+cjs 在本插件版本下会产出混入 ESM 语法、
              // 且带重复尾巴的损坏代码,导致 sandbox preload 报 SyntaxError。
              // 早期通过字符串截取 exposeInMainWorld(...) 重建 CJS,但这会丢弃 esbuild
              // 内联的 electron 命名空间变量(被压缩成 r),导致运行时 `r is not defined`。
              // 这里改为直接用 esbuild 重新打包 preload,产出自洽的纯净 CJS 覆盖输出。
              closeBundle() {
                const file = path.join(__dirname, 'dist-electron', 'preload.cjs');
                buildSync({
                  entryPoints: [path.join(__dirname, 'electron', 'preload.ts')],
                  outfile: file,
                  bundle: true,
                  platform: 'node',
                  format: 'cjs',
                  target: 'node18',
                  minify: true,
                  external: ['electron'],
                });
              },
            },
          ],
        },
      },
    ]),
    renderer(),
  ],
})
