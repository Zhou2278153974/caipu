import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Vitest 通过 `test` 字段扩展 vite config（plain JS 下无需类型声明）
export default defineConfig({
  plugins: [
    // 构建时把所有 JS/CSS 内联到一个 HTML 文件
    viteSingleFile(),
  ],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
  },
});
