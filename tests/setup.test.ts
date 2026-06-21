import { describe, it, expect } from 'vitest'
import { ENGINE_VERSION } from '../src/engine/index'

// 0단계 스모크 테스트: 툴체인(Vitest + TS)이 동작하고
// 엔진 모듈을 import할 수 있는지만 확인한다.
describe('setup smoke test', () => {
  it('엔진 모듈을 import할 수 있다', () => {
    expect(ENGINE_VERSION).toBe('0.0.0')
  })
})
