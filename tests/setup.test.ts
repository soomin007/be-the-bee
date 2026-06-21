import { describe, it, expect } from 'vitest'
import { ENGINE_VERSION, createInitialState } from '../src/engine/index'

// 툴체인(Vitest + TS)과 엔진 배럴이 정상 동작하는지 확인하는 스모크 테스트.
describe('setup smoke test', () => {
  it('엔진 버전 문자열을 노출한다', () => {
    expect(typeof ENGINE_VERSION).toBe('string')
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('초기 상태를 만들 수 있다', () => {
    const s = createInitialState()
    expect(s.phase).toBe('playing')
    expect(s.turn).toBe('yellow')
  })
})
