// threatLines: 상대의 "자라는 위협"(연결 3+목, 곧 5목 될 줄) 탐지. 코칭 '강하게' 강조용.
import { describe, it, expect } from 'vitest'
import { hex, hexKey, threatLines } from '../src/engine/index'
import type { Board, Player } from '../src/engine/index'
function tp(o: Player): Board[string] { return { tile: { owner: o }, piece: { owner: o, kind: 'normal' } } }
function p(o: Player): Board[string] { return { piece: { owner: o, kind: 'normal' }, tile: { owner: o } } }

describe('threatLines — 자라는 위협', () => {
  it('열린 3목을 위협으로 잡는다', () => {
    const b: Board = {}
    for (const r of [0, -1, -2]) b[hexKey(hex(2, r))] = tp('yellow') // (2,0)(2,-1)(2,-2) 연속 3목
    b[hexKey(hex(2, 1))] = { tile: { owner: 'yellow' } } // 위 끝 열림(타일만)
    const tl = threatLines(b, 'yellow')
    expect(tl.length).toBe(1)
    expect(tl[0]!.length).toBe(3)
  })

  it('양끝이 막힌(죽은) 3목은 위협이 아니다', () => {
    const b: Board = {}
    for (const r of [0, -1, -2]) b[hexKey(hex(2, r))] = tp('yellow')
    b[hexKey(hex(2, 1))] = p('brown') // 위 끝 갈색 말
    b[hexKey(hex(2, -3))] = p('brown') // 아래 끝 갈색 말
    expect(threatLines(b, 'yellow').length).toBe(0)
  })

  it('길이 2 이하는 위협이 아니다', () => {
    const b: Board = {}
    for (const r of [0, -1]) b[hexKey(hex(2, r))] = tp('yellow')
    b[hexKey(hex(2, 1))] = { tile: { owner: 'yellow' } }
    expect(threatLines(b, 'yellow').length).toBe(0)
  })
})
