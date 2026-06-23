// reviewMove: 수 해설/블런더 분류. 실제 공유 기보(vsAi 35수, 노랑=사람 승)로 검증.
// 이 판의 결정적 장면: 34수에서 AI가 상대 5목 리치를 안 막음(missBlock) → 35수 사람 승(win).
import { describe, it, expect } from 'vitest'
import { applyMove, createInitialState, hex, notePolarity, reviewMove } from '../src/engine/index'
import type { Board, GameState, Move } from '../src/engine/index'

const MV =
  't -1 0 0 0;t 1 -1 -1 0;t -1 1 1 -1;t 1 1 -1 1;t -2 2 1 0;2 1 -2 1 2;t 1 -3 1 -3;t -1 2 -1 2;t -1 3 -1 3;t -1 -1 -1 -1;t -1 -2 -1 -2;t 0 2 0 2;t 1 3 -2 2;t 2 0 1 1;t 0 3 2 0;t 3 0 3 0;2 -2 3 -3 3;t -2 1 -2 1;t 0 1 0 1;t 0 -1 0 -1;t -3 2 -3 2;t 2 -1 1 2;t 2 -3 2 -3;t 2 2 2 2;t 3 2 3 2;t 2 1 2 1;t 4 -1 4 -1;2 2 -2 -2 -1;t 0 -3 0 -3;t -1 -3 -1 -3;2 3 -3 4 -3;t 1 -4 1 -4;t 4 -2 3 -3;t -2 0 -2 0;t 4 0 4 -3'

function decMove(tok: string): Move {
  const p = tok.trim().split(/\s+/)
  const n = (i: number): number => Number(p[i])
  if (p[0] === '2') return { type: 'twoTiles', first: hex(n(1), n(2)), second: hex(n(3), n(4)) }
  if (p[0] === 't') return { type: 'tileAndPiece', tile: hex(n(1), n(2)), piece: { at: hex(n(3), n(4)), kind: 'normal' } }
  return { type: 'pieceOnly', piece: { at: hex(n(1), n(2)), kind: 'normal' } }
}

describe('reviewMove — 실제 기보 분석', () => {
  const moves = MV.split(';').map(decMove)
  // 각 수 직전 국면(states[i] = i번째 수를 두기 전)을 미리 만든다.
  const states: GameState[] = []
  let s = createInitialState()
  for (const m of moves) {
    states.push(s)
    s = applyMove(s, m)
  }

  it('승부가 난 마지막 수(35수)는 win', () => {
    expect(reviewMove(states[34]!, moves[34]!)).toBe('win')
  })

  it('34수(AI)는 상대 5목 리치를 막지 않은 missBlock(블런더)', () => {
    const note = reviewMove(states[33]!, moves[33]!)
    expect(note).toBe('missBlock')
    expect(notePolarity(note!)).toBe('bad')
  })

  it('평범한 초반 수에는 코멘트가 없다(null)', () => {
    // 2수(상대 첫 응수)는 위협·차단·벌집 어느 것도 아님
    expect(reviewMove(states[1]!, moves[1]!)).toBeNull()
  })

  it('벌집을 완성한 수는 hive로 칭찬(예: 6수 AI 벌집)', () => {
    expect(reviewMove(states[5]!, moves[5]!)).toBe('hive')
  })

  it('연속 4목(끝에 한 칸)은 사람도 바로 보이므로 코칭 생략 — 33수는 threat 아님', () => {
    // 33수로 (0,-3)~(3,-3) 연속 4목, 승리칸 (4,-3)은 끝 → 너무 뻔해서 멘트 없음.
    expect(reviewMove(states[32]!, moves[32]!)).not.toBe('threat')
  })
})

describe('reviewMove — 떨어진 4목(gapped four)만 threat', () => {
  const yp = (): Board[string] => ({ tile: { owner: 'yellow' }, piece: { owner: 'yellow', kind: 'normal' } })
  const yt = (): Board[string] => ({ tile: { owner: 'yellow' } })
  const base = (board: Board): GameState => ({
    board,
    turn: 'yellow',
    supplies: {
      yellow: { tiles: 20, pieces: 20, queenUsed: false },
      brown: { tiles: 20, pieces: 20, queenUsed: false },
    },
    moveNumber: 6,
    phase: 'playing',
  })
  // 한 축(q)에 노랑 말 0,1,3 + 빈 타일 2(가운데). 이번 수로 4에 타일+말 → 0,1,_,3,4.
  // 승리칸은 가운데 2(양옆이 내 말 = 떨어진 4목) → threat.
  const place4: Move = { type: 'tileAndPiece', tile: hex(4, 0), piece: { at: hex(4, 0), kind: 'normal' } }

  it('가운데를 끼우는 떨어진 4목을 만들면 threat(칭찬)', () => {
    const before = base({ '0,0': yp(), '1,0': yp(), '2,0': yt(), '3,0': yp() })
    const note = reviewMove(before, place4)
    expect(note).toBe('threat')
    expect(notePolarity(note!)).toBe('good')
  })
})
