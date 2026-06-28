import { describe, it, expect } from 'vitest'
import { hex, hexKey } from '../src/engine/hex'
import { findLines } from '../src/engine/lines'

// 좌표 목록을 같은 값 v 로 채운 맵을 만든다.
function lineMap(coords: ReturnType<typeof hex>[], v: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of coords) m.set(hexKey(c), v)
  return m
}

describe('findLines (한 스캔 두 용도)', () => {
  it('5개 미만은 직선으로 보지 않는다', () => {
    const m = lineMap([hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0)], 'y')
    expect(findLines(m, 5)).toHaveLength(0)
  })

  it('q축 5연속을 하나의 직선으로 찾는다', () => {
    const coords = [hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0), hex(4, 0)]
    const lines = findLines(lineMap(coords, 'y'), 5)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.cells).toHaveLength(5)
    expect(lines[0]!.value).toBe('y')
  })

  it('6연속도 길이 6의 단일 직선(시작 칸에서만 보고)', () => {
    const coords = [hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0), hex(4, 0), hex(5, 0)]
    const lines = findLines(lineMap(coords, 'y'), 5)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.cells).toHaveLength(6)
  })

  it('값이 다르면 끊긴다', () => {
    const m = lineMap([hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0)], 'y')
    m.set(hexKey(hex(4, 0)), 'b') // 다른 색으로 끊음
    expect(findLines(m, 5)).toHaveLength(0)
  })

  it('교차(+자): 한 칸을 공유하는 두 축 직선을 각각 별개로 찾는다', () => {
    const m = new Map<string, string>()
    // q축 직선: r=0, q=-2..2  → 중심 (0,0) 공유
    for (let q = -2; q <= 2; q++) m.set(hexKey(hex(q, 0)), 'y')
    // r축 직선(HEX_AXES[1] = (1,-1)): 중심을 지나는 5칸
    for (let t = -2; t <= 2; t++) m.set(hexKey(hex(t, -t)), 'y')
    const lines = findLines(m, 5)
    expect(lines).toHaveLength(2)
    // 두 직선 모두 중심 (0,0) 을 포함한다(중복 허용 — docs/design/rules.md §8.4)
    const center = hexKey(hex(0, 0))
    expect(lines.every((l) => l.cells.includes(center))).toBe(true)
  })

  it('서로 다른 값의 두 직선을 구분한다', () => {
    const m = new Map<string, string>()
    for (let q = 0; q < 5; q++) m.set(hexKey(hex(q, 0)), 'y')
    for (let q = 0; q < 5; q++) m.set(hexKey(hex(q, 3)), 'b')
    const lines = findLines(m, 5)
    expect(lines).toHaveLength(2)
    expect(new Set(lines.map((l) => l.value))).toEqual(new Set(['y', 'b']))
  })
})
