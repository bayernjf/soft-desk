import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // 只统计手写源码。默认行为会把 dist-electron/ 里历史累积的打包产物
      // (每个 30k 行)算进分母,总行数被撑到 50 万行,覆盖率数字失去意义。
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.ts'],
      exclude: ['**/*.d.ts'],
    },
  },
});
