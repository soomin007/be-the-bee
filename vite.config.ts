/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // 엔진은 DOM이 필요 없으므로 테스트는 node 환경에서 돈다.
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
  },
})
