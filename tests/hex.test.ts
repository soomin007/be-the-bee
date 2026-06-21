import { describe, it, expect } from 'vitest'
import {
  hex,
  hexKey,
  hexFromKey,
  hexEquals,
  hexAdd,
  hexSubtract,
  hexDistance,
  hexNeighbor,
  hexNeighbors,
  HEX_DIRECTIONS,
  HEX_AXES,
} from '../src/engine/hex'

describe('hex 좌표계', () => {
  it('q + r + s = 0 불변식을 유지한다', () => {
    const h = hex(2, -3)
    expect(h.s).toBe(1)
    expect(h.q + h.r + h.s).toBe(0)
  })

  it('hexKey / hexFromKey 는 왕복 변환된다', () => {
    for (const h of [hex(0, 0), hex(3, -1), hex(-2, 5)]) {
      expect(hexEquals(hexFromKey(hexKey(h)), h)).toBe(true)
    }
  })

  it('hexKey 는 s 와 무관하게 q,r 로 결정된다', () => {
    expect(hexKey(hex(1, -2))).toBe('1,-2')
  })

  it('add / subtract', () => {
    expect(hexEquals(hexAdd(hex(1, 2), hex(3, -1)), hex(4, 1))).toBe(true)
    expect(hexEquals(hexSubtract(hex(4, 1), hex(3, -1)), hex(1, 2))).toBe(true)
  })

  it('거리: 원점에서 이웃은 1, 같은 칸은 0', () => {
    expect(hexDistance(hex(0, 0), hex(0, 0))).toBe(0)
    for (const d of HEX_DIRECTIONS) {
      expect(hexDistance(hex(0, 0), d)).toBe(1)
    }
    expect(hexDistance(hex(0, 0), hex(3, 0))).toBe(3)
  })

  it('6방향이 서로 다르고 마주보는 쌍(0↔3,1↔4,2↔5)을 이룬다', () => {
    expect(HEX_DIRECTIONS).toHaveLength(6)
    for (let i = 0; i < 3; i++) {
      const a = HEX_DIRECTIONS[i]!
      const b = HEX_DIRECTIONS[i + 3]!
      expect(hexEquals(hexAdd(a, b), hex(0, 0))).toBe(true)
    }
  })

  it('3축은 6방향 중 서로 마주보지 않는 3개다', () => {
    expect(HEX_AXES).toHaveLength(3)
    // 어떤 두 축도 서로의 반대 벡터가 아니다
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        expect(hexEquals(hexAdd(HEX_AXES[i]!, HEX_AXES[j]!), hex(0, 0))).toBe(false)
      }
    }
  })

  it('hexNeighbor 범위 밖 인덱스는 던진다', () => {
    expect(() => hexNeighbor(hex(0, 0), 6)).toThrow()
  })

  it('hexNeighbors 는 6개의 서로 다른 이웃을 준다', () => {
    const ns = hexNeighbors(hex(0, 0))
    expect(ns).toHaveLength(6)
    const keys = new Set(ns.map(hexKey))
    expect(keys.size).toBe(6)
  })
})
