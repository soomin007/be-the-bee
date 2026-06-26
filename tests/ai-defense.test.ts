// 회귀: ① 전문가 AI 가 상대의 (잠기지 않은) "연속 열린 3목"을 막는다(빔이 차단수를 쳐내던 문제).
//       ② 전문가는 성향(persona)에 상관없이 동일하게 둔다(전문가=항상 최선 → 성향 무시).
//
// 주의: backlog §2 실제 패배 기보의 14수는 노랑이 이미 q+r=0 축에 **타일 벌집(5+)을 잠가** 그 위를
// 갈색이 못 두는 국면이라(사후 차단 불가) 여기선 재현하지 않는다. 그 케이스(허리 끊기)는 평가 튜닝 +
// self-play 검증이 필요한 별도 과제(backlog §2). 이 테스트는 "잠기지 않은 말 라인 차단"만 본다.
import { describe, it, expect } from 'vitest'
import {
  createInitialState, withTile, withPiece, hex, createAi, type Move, type GameState, type Player,
} from '../src/engine/index'

// 노랑 말 3개가 한 줄(axis q+1)로 (0,0)(1,0)(2,0). 밑 타일은 색을 섞어 노랑 벌집(5+)이 안 생기게 →
// 양끝 (-1,0)(3,0) 은 갈색 타일(빈칸)이라 갈색이 말을 놓아 막을 수 있다. 갈색 차례.
function openThreeState(): GameState {
  let board = {}
  const tiles: [number, number, Player][] = [
    [-1, 0, 'brown'], [0, 0, 'yellow'], [1, 0, 'brown'], [2, 0, 'yellow'], [3, 0, 'brown'],
    [0, 1, 'brown'], [1, 1, 'yellow'], [2, 1, 'brown'],
  ]
  for (const [q, r, o] of tiles) board = withTile(board, hex(q, r), o)
  for (const [q, r] of [[0, 0], [1, 0], [2, 0]] as [number, number][]) {
    board = withPiece(board, hex(q, r), { owner: 'yellow', kind: 'normal' })
  }
  return { ...createInitialState(), board, turn: 'brown' }
}
const pieceAt = (m: Move) => (m.type === 'twoTiles' ? null : m.piece.at)
const blocksEnd = (m: Move): boolean => {
  const h = pieceAt(m)
  return !!h && ((h.q === -1 && h.r === 0) || (h.q === 3 && h.r === 0))
}

describe('전문가 AI 방어/성향', () => {
  it('① 잠기지 않은 열린 3목의 끝을 막는다', () => {
    const m = createAi({ difficulty: 'expert' }).chooseMove(openThreeState())
    expect(blocksEnd(m)).toBe(true) // (-1,0) 또는 (3,0) 에 갈색 말 → 차단
  })

  it('② 성향과 무관하게 동일한 수를 둔다(전문가=성향 무시)', () => {
    const agg = createAi({ difficulty: 'expert', persona: 'aggressive' }).chooseMove(openThreeState())
    const def = createAi({ difficulty: 'expert', persona: 'defensive' }).chooseMove(openThreeState())
    expect(JSON.stringify(agg)).toBe(JSON.stringify(def)) // 성향 무시 → 완전히 같은 선택
    expect(blocksEnd(agg)).toBe(true)
  })
})
