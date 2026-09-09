import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // 组件测试用 .tsx 后缀,并在文件顶部用 `// @vitest-environment jsdom` 注释
    // 单独切环境。不在这里全局改成 jsdom:electron/ 下的测试要跑在 node 里。
    // 也不用 environmentMatchGlobs——它在 vitest 3 已被弃用。
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      // 只统计手写源码。默认行为会把 dist-electron/ 里历史累积的打包产物
      // (每个 30k 行)算进分母,总行数被撑到 50 万行,覆盖率数字失去意义。
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.ts'],
      exclude: ['**/*.d.ts'],
    },
  },
});
