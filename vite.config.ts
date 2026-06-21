/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages 프로젝트 사이트(/be-the-bee/) 하위 경로에서도 에셋이 풀리도록 상대 경로.
  base: './',
  // 엔진은 DOM이 필요 없으므로 테스트는 node 환경에서 돈다.
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
  },
})
