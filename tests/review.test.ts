// reviewMove: 수 해설/블런더 분류. 실제 공유 기보(vsAi 35수, 노랑=사람 승)로 검증.
// 이 판은 노랑(사람)이 잠긴 벌집 위에 말 5목을 채워 이긴 패턴이다 — 34수의 노랑 위협 (4,-3) 은
// 노랑 잠긴 벌집 칸이라 갈색이 막을 수 없었다(놓친 차단 아님). 35수 사람 승(win). "막을 수 있는
// 위협을 안 막은" 진짜 missBlock 과, 막을 수 없는 위협의 구분은 아래 별도 describe 들로 검증한다.
import { describe, it, expect } from 'vitest'
import { analyzeGame, applyMove, createInitialState, hex, hexKey, notePolarity, reviewMove } from '../src/engine/index'
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

  it('34수는 막을 수 없는 위협(노랑 잠긴 벌집 위 5목)이라 missBlock 이 아니다', () => {
    // 노랑 승리칸 (4,-3) 은 노랑이 잠근 벌집 칸 → 갈색은 §5 로 거기 말을 못 둔다(여왕벌 OFF).
    // 막을 방법이 없으니 "놓친 차단(블런더)"으로 비난하면 오진이다. 진짜 패인은 그 회랑이 잠기기
    // 전 더 이른 수다. 막을 수 있는 위협을 안 막은 진짜 missBlock 은 아래 별도 describe 로 검증.
    expect(reviewMove(states[33]!, moves[33]!)).toBeNull()
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

describe('analyzeGame — 기보 한 판 분석', () => {
  const moves = MV.split(';').map(decMove)

  it('실전 35수 기보를 분석: 마지막 수 win 하이라이트 + 막을 수 없는 34수는 블런더 아님', () => {
    const review = analyzeGame(createInitialState(), moves)
    // 35수(승리)는 하이라이트.
    expect(review.highlights.some((r) => r.index === 35 && r.note === 'win')).toBe(true)
    // 34수는 노랑 잠긴 벌집 위 5목이라 갈색이 막을 수 없었다 → 블런더(놓친 차단)로 잡지 않는다.
    expect(review.blunders.some((r) => r.index === 34)).toBe(false)
    // 집계 합이 reviews 수와 일치(진영별 good/bad 누락 없음).
    const total = review.counts.yellow.good + review.counts.yellow.bad + review.counts.brown.good + review.counts.brown.bad
    expect(total).toBe(review.reviews.length)
  })

  it('각 review 의 index 는 1-based 이고 reviewMove 결과와 일치한다', () => {
    const review = analyzeGame(createInitialState(), moves)
    // 처음부터 재생해 직접 검증: index i 의 note 는 (i-1)번째 수를 그 직전 국면에서 본 결과.
    let s = createInitialState()
    const expected = new Map<number, string>()
    for (let i = 0; i < moves.length; i++) {
      const note = reviewMove(s, moves[i]!)
      if (note) expected.set(i + 1, note)
      s = applyMove(s, moves[i]!)
    }
    expect(review.reviews.length).toBe(expected.size)
    for (const r of review.reviews) expect(r.note).toBe(expected.get(r.index))
  })

  it('빈 기보는 빈 분석을 반환한다', () => {
    const review = analyzeGame(createInitialState(), [])
    expect(review.reviews).toEqual([])
    expect(review.blunders).toEqual([])
    expect(review.highlights).toEqual([])
  })
})

describe('reviewMove — 막을 수 있는 위협을 안 막으면 missBlock(블런더)', () => {
  it('상대의 막을 수 있는 즉시 5목 위협을 안 막고 딴 데 두면 missBlock', () => {
    // 갈색 말 4목 (0,0)~(3,0). 왼끝 (-1,0) 은 노랑 말로 막힘, 오른끝 (4,0) 은 빈 프론티어(타일 없음)
    // 라 잠기지 않아 노랑도 둘 수 있다 → "막을 수 있는" 단일 위협. 노랑이 안 막고 (0,1) 에 두면 missBlock.
    const board: Board = {
      [hexKey(hex(0, 0))]: { tile: { owner: 'brown' }, piece: { owner: 'brown', kind: 'normal' } },
      [hexKey(hex(1, 0))]: { tile: { owner: 'brown' }, piece: { owner: 'brown', kind: 'normal' } },
      [hexKey(hex(2, 0))]: { tile: { owner: 'brown' }, piece: { owner: 'brown', kind: 'normal' } },
      [hexKey(hex(3, 0))]: { tile: { owner: 'brown' }, piece: { owner: 'brown', kind: 'normal' } },
      [hexKey(hex(-1, 0))]: { tile: { owner: 'yellow' }, piece: { owner: 'yellow', kind: 'normal' } },
    }
    const before: GameState = {
      board,
      turn: 'yellow',
      supplies: {
        yellow: { tiles: 20, pieces: 20, queenUsed: false },
        brown: { tiles: 20, pieces: 20, queenUsed: false },
      },
      moveNumber: 9,
      phase: 'playing',
    }
    const away: Move = { type: 'tileAndPiece', tile: hex(0, 1), piece: { at: hex(0, 1), kind: 'normal' } }
    const note = reviewMove(before, away)
    expect(note).toBe('missBlock')
    expect(notePolarity(note!)).toBe('bad')
  })
})

describe('reviewMove — 잠긴 벌집 5목은 "놓친 차단"이 아니다(사용자 제보 54수 기보)', () => {
  // 갈색(사람)이 q+r=1 벌집을 8수에 잠그고 그 잠긴 회랑 안에서 말 5목(3,-2..7,-6)을 완성해 54수 승.
  // 노랑(AI)은 잠긴 갈색 벌집 위 승리칸 (7,-6) 을 막을 수 없었다(§5) → 53수는 블런더(놓친 차단)가 아니다.
  const MV2 =
    't 1 -1 1 0;t 2 -1 1 -1;t -1 1 2 -1;t 0 1 0 0;t 2 -2 0 1;t 3 -2 3 -2;t -2 2 2 -2;2 -1 2 4 -3;t 1 1 1 1;t 2 1 2 1;t 2 -3 2 -3;t 2 -4 2 -4;t -2 1 -2 1;t -3 1 -3 1;t 0 -1 0 -1;t -1 0 -1 0;t 3 -3 -2 2;t -2 0 -2 0;t -1 -1 -1 -1;t 1 -2 1 -2;t -2 3 -2 3;t -2 4 -2 4;t -3 0 -3 0;t 4 -4 4 -4;t 1 -3 1 -3;2 5 -4 3 -4;t 0 -2 3 -4;t 1 -4 0 -2;t -3 -1 -3 -1;t -2 -1 -2 -1;t -1 3 -1 3;2 6 -5 7 -6;t -3 3 -3 3;t -4 3 -4 3;t 0 -3 0 -3;t -1 -3 -1 -3;t 0 3 3 -3;t 0 -4 0 3;t 2 0 2 0;t 0 2 4 -3;t 3 -1 3 -1;t 6 -4 0 2;t 4 -2 4 -2;t 5 -3 5 -3;t 3 0 3 0;t 4 0 4 0;t -4 4 -4 4;t -5 5 -5 5;t -3 4 -3 4;t -4 5 5 -4;2 1 3 -3 2;t 7 -4 6 -5;t -3 -2 -3 -2;t -1 -4 7 -6'
  const moves2 = MV2.split(';').map(decMove)
  const states2: GameState[] = []
  let s2 = createInitialState()
  for (const m of moves2) {
    states2.push(s2)
    s2 = applyMove(s2, m)
  }

  it('53수(노랑)는 막을 수 없는 위협이라 missBlock 이 아니다', () => {
    expect(reviewMove(states2[52]!, moves2[52]!)).not.toBe('missBlock')
  })

  it('54수(갈색)는 잠긴 회랑 안에서 5목을 완성한 승리(win)', () => {
    expect(reviewMove(states2[53]!, moves2[53]!)).toBe('win')
  })
})
