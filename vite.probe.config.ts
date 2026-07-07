/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// 연구 프로브(probes/) 전용 설정. `npm run probe` 로만 실행한다.
// npm test(vite.config.ts)와 CI typecheck(tsconfig include)에서 모두 빠져 있어,
// 프로브의 타입 에러·파일 쓰기가 정규 테스트/배포를 깨뜨릴 수 없다(known_issues 2026-06-30).
// 대신 프로브 코드는 typecheck 를 안 받으니, 수정 후엔 여기로 직접 돌려 확인한다.
export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['probes/**/*.{test,spec}.ts'],
    testTimeout: 900000,
  },
})
