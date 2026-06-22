/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// 상성 시뮬레이션(scripts/sim.test.ts) 전용 설정. `npm run sim` 으로 실행.
// npm test(vite.config.ts)는 tests/ 와 src/ 만 잡아 이 느린 분석을 자동으로 돌리지 않는다.
export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['scripts/sim.test.ts'],
    testTimeout: 900000,
  },
})
