import { describe, it, expect } from 'vitest'
import { hex, hexKey, hexEquals } from '../src/engine/hex'
import { cellAt, createInitialState, pieceAt } from '../src/engine/state'
import { allowedMoveTypes, applyMove, validateMove, frontierCells } from '../src/engine/moves'
import { withTile } from '../src/engine/state'
import { detectWin } from '../src/engine/victory'
import { createAi } from '../src/engine/ai'
import type { Board, GameState, Move, Player, PlayerSupply } from '../src/engine/types'

const fullSupply: PlayerSupply = { tiles: 30, pieces: 30, queenUsed: false }

function makeState(board: Board, turn: Player, over: Partial<GameState> = {}): GameState {
  return {
    board,
    turn,
    supplies: { yellow: { ...fullSupply }, brown: { ...fullSupply } },
    moveNumber: 5,
    phase: 'playing',
    ...over,
  }
}

// 타일/말을 좌표·소유자 튜플로 깐다.
function build(
  tiles: Array<[ReturnType<typeof hex>, Player]>,
  pieces: Array<[ReturnType<typeof hex>, Player]> = [],
): Board {
  const board: Board = {}
  for (const [h, owner] of tiles) board[hexKey(h)] = { tile: { owner } }
  for (const [h, owner] of pieces) {
    const cell = board[hexKey(h)]
    if (!cell) throw new Error('말은 타일 위에만')
    board[hexKey(h)] = { tile: cell.tile, piece: { owner, kind: 'normal' } }
  }
  return board
}

// 색을 번갈아 깐 타일선(같은 색 5목 → 벌집 잠금 방지용)
function mixedRow(qFrom: number, qTo: number, r: number): Array<[ReturnType<typeof hex>, Player]> {
  const out: Array<[ReturnType<typeof hex>, Player]> = []
  for (let q = qFrom; q <= qTo; q++) out.push([hex(q, r), q % 2 === 0 ? 'yellow' : 'brown'])
  return out
}

function pieceOwnerAt(applied: GameState, h: ReturnType<typeof hex>): Player | undefined {
  return pieceAt(applied.board, h)?.owner
}

describe('AI: 즉시 승리', () => {
  it('기존 타일 위 5번째 말로 즉시 승리한다', () => {
    const board = build(
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
        [hex(2, 0), 'brown'],
        [hex(3, 0), 'brown'],
        [hex(4, 0), 'brown'],
      ],
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
        [hex(2, 0), 'brown'],
        [hex(3, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 1 }).chooseMove(state)
    const applied = applyMove(state, move)
    expect(applied.phase).toBe('finished')
    expect(applied.result).toEqual({ kind: 'win', winner: 'brown' })
  })

  it('프론티어 칸에 타일+말로 즉시 승리한다', () => {
    const board = build(
      mixedRow(0, 3, 0), // 0..3 타일(혼합색, 벌집 아님)
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
        [hex(2, 0), 'brown'],
        [hex(3, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 1 }).chooseMove(state)
    expect(move.type).toBe('tileAndPiece')
    // 4목의 양끝(4,0)/(-1,0) 모두 빈 프론티어 칸이므로 어느 쪽이든 승리다
    if (move.type === 'tileAndPiece') {
      const at = move.piece.at
      expect(hexEquals(at, hex(4, 0)) || hexEquals(at, hex(-1, 0))).toBe(true)
    }
    const applied = applyMove(state, move)
    expect(applied.result).toEqual({ kind: 'win', winner: 'brown' })
  })
})

describe('AI: 붐비는 보드에서도 승리/차단 (후보 캡 무관)', () => {
  it('말이 많아도 자기 승리수(한쪽 막힌 4목 완성)를 놓치지 않는다', () => {
    // 3행 띠 + q 패리티 색칠 → 벌집(5타일 일렬) 없음(승리 칸 안 잠김). 빈 타일이 많아 후보 캡(24) 초과.
    const board: Board = {}
    for (let q = -4; q <= 8; q++) for (let r = -1; r <= 1; r++) {
      board[hexKey(hex(q, r))] = { tile: { owner: q % 2 === 0 ? 'yellow' : 'brown' } }
    }
    // 갈색 4목 (0,0)..(3,0), (4,0) 빈 칸(승리), (-1,0) 노랑이 막음
    for (let q = 0; q <= 3; q++) board[hexKey(hex(q, 0))] = { tile: board[hexKey(hex(q, 0))]!.tile, piece: { owner: 'brown', kind: 'normal' } }
    board[hexKey(hex(-1, 0))] = { tile: board[hexKey(hex(-1, 0))]!.tile, piece: { owner: 'yellow', kind: 'normal' } }

    expect(detectWin(board)).toBeNull()
    const state = makeState(board, 'brown')
    const applied = applyMove(state, createAi({ difficulty: 'medium', seed: 1 }).chooseMove(state))
    expect(applied.result).toEqual({ kind: 'win', winner: 'brown' })
  })
})

describe('AI: 막다른 위치에서 여왕벌 최후 수단', () => {
  it('일반 말로 둘 곳이 전혀 없으면(빈 칸이 전부 상대 잠긴 벌집·타일 소진) 여왕벌로 합법수를 둔다', () => {
    // 노랑 5타일 일렬 = 노랑 벌집(잠김). 빈 칸은 이 5칸뿐, 갈색은 타일 소진 → 일반 말로 둘 곳 없음.
    // canMove 는 여왕벌 가능성으로 "둘 수 있다"고 보므로, AI 는 막히지 않게 여왕벌을 최후 수단으로 쓴다.
    const board = build([
      [hex(0, 0), 'yellow'],
      [hex(1, 0), 'yellow'],
      [hex(2, 0), 'yellow'],
      [hex(3, 0), 'yellow'],
      [hex(4, 0), 'yellow'],
    ])
    const state: GameState = {
      board,
      turn: 'brown',
      supplies: {
        yellow: { tiles: 0, pieces: 30, queenUsed: false },
        brown: { tiles: 0, pieces: 30, queenUsed: false },
      },
      moveNumber: 10,
      phase: 'playing',
    }
    const move = createAi({ difficulty: 'medium', seed: 1 }).chooseMove(state)
    expect(validateMove(state, move).ok).toBe(true)
    expect(() => applyMove(state, move)).not.toThrow()
    const kind = move.type === 'twoTiles' ? 'normal' : move.piece.kind
    expect(kind).toBe('queen')
  })
})

describe('AI: 잠긴 벌집 승리 칸에서 멈추지 않는다 (리치 오판 회귀)', () => {
  it('유일한 승리 칸이 상대 벌집(잠김)이면 일반 말로 못 두므로 합법수를 반환한다', () => {
    // 갈색 4목 (0,0)..(3,0). 5번째 칸 (4,0) 은 노랑 벌집(세로 5타일)의 일부라 잠김.
    // 왼쪽 끝 (-1,0) 은 노랑 말로 막음 → 갈색의 유일한 "기하학적 승리 칸"은 잠긴 (4,0).
    // winningCells 는 queen 가능성으로 (4,0) 을 포함하지만 AI 는 여왕벌을 안 쓴다 →
    // 예전엔 normal 로 두려다 applyMove throw → "생각 중" 영구 정지. 이제 합법수를 둬야 한다.
    const board = build(
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
        [hex(2, 0), 'brown'],
        [hex(3, 0), 'brown'],
        [hex(-1, 0), 'yellow'],
        // 노랑 벌집(세로 5타일) — (4,0) 포함 → (4,0) 잠김
        [hex(4, 0), 'yellow'],
        [hex(4, 1), 'yellow'],
        [hex(4, 2), 'yellow'],
        [hex(4, 3), 'yellow'],
        [hex(4, 4), 'yellow'],
      ],
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
        [hex(2, 0), 'brown'],
        [hex(3, 0), 'brown'],
        [hex(-1, 0), 'yellow'],
      ],
    )
    const state = makeState(board, 'brown')
    for (const diff of ['easy', 'medium', 'hard'] as const) {
      const ai = createAi({ difficulty: diff, seed: 7 })
      const move = ai.chooseMove(state)
      // 합법수여야 하고(throw 안 함), (4,0) 에 일반 말을 두는 불법수가 아니어야 한다.
      expect(validateMove(state, move).ok).toBe(true)
      expect(() => applyMove(state, move)).not.toThrow()
    }
  })
})

describe('AI 성향(persona)', () => {
  const sig = (m: Move): string =>
    m.type === 'twoTiles'
      ? `2:${hexKey(m.first)}|${hexKey(m.second)}`
      : m.type === 'tileAndPiece'
        ? `t:${hexKey(m.tile)}|${hexKey(m.piece.at)}`
        : `p:${hexKey(m.piece.at)}`

  it('성향마다 합법수를 두고, 같은 국면에서 선택이 갈린다', () => {
    // 전술 압박이 없는 조용한 초반 — 성향별 가치판단이 그대로 수 선택에 드러난다.
    const board = build(
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
        [hex(2, 0), 'brown'],
        [hex(3, 0), 'brown'],
      ],
      [[hex(0, 0), 'brown']],
    )
    const state = makeState(board, 'brown')
    const personas = ['balanced', 'aggressive', 'defensive', 'hive'] as const
    const sigs = personas.map((persona) => {
      const mv = createAi({ difficulty: 'medium', persona, seed: 3 }).chooseMove(state)
      expect(validateMove(state, mv).ok).toBe(true)
      return sig(mv)
    })
    // 네 성향이 전부 같은 수를 두지는 않는다(성향이 실제로 작동 — 벌집형은 타일 발전 등).
    expect(new Set(sigs).size).toBeGreaterThan(1)
  })

  it('벌집형은 타일선(벌집) 발전을 균형형보다 선호한다(타일 2개 수)', () => {
    // 빈 타일·프론티어가 넉넉한 초반 국면 — 벌집형은 ①(twoTiles)로 타일선을 깐다.
    const tiles: Array<[ReturnType<typeof hex>, Player]> = []
    for (let q = 0; q <= 3; q++) tiles.push([hex(q, 0), 'brown'])
    const board = build(tiles, [[hex(0, 0), 'brown']])
    const state = makeState(board, 'brown')
    const hiveMove = createAi({ difficulty: 'medium', persona: 'hive', seed: 5 }).chooseMove(state)
    expect(validateMove(state, hiveMove).ok).toBe(true)
    expect(hiveMove.type).toBe('twoTiles')
  })
})

describe('AI: 상대 즉시 승리 차단', () => {
  it('기존 타일 끝을 막는다', () => {
    // 노랑 말 0..3, 왼쪽 끝(-1,0)은 갈색 말로 이미 막힘 → 위협은 (4,0) 하나
    const board = build(
      [...mixedRow(-1, 4, 0)],
      [
        [hex(0, 0), 'yellow'],
        [hex(1, 0), 'yellow'],
        [hex(2, 0), 'yellow'],
        [hex(3, 0), 'yellow'],
        [hex(-1, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 2 }).chooseMove(state)
    const applied = applyMove(state, move)
    expect(pieceOwnerAt(applied, hex(4, 0))).toBe('brown')
  })

  it('프론티어 완성 위협을 막는다 (타일이 아직 없는 끝)', () => {
    // (4,0)에는 타일 없음(프론티어). 상대는 타일+말 한 수로 5목 가능 → 막아야 함
    const board = build(
      [...mixedRow(-1, 3, 0)],
      [
        [hex(0, 0), 'yellow'],
        [hex(1, 0), 'yellow'],
        [hex(2, 0), 'yellow'],
        [hex(3, 0), 'yellow'],
        [hex(-1, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 2 }).chooseMove(state)
    expect(move.type).toBe('tileAndPiece')
    const applied = applyMove(state, move)
    expect(pieceOwnerAt(applied, hex(4, 0))).toBe('brown')
  })

  it('끊긴 4(P P _ P P)의 빈틈을 막는다', () => {
    const board = build(
      [...mixedRow(0, 4, 0)],
      [
        [hex(0, 0), 'yellow'],
        [hex(1, 0), 'yellow'],
        [hex(3, 0), 'yellow'],
        [hex(4, 0), 'yellow'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 2 }).chooseMove(state)
    const applied = applyMove(state, move)
    expect(pieceOwnerAt(applied, hex(2, 0))).toBe('brown')
  })

  it('이중 위협이면 throw 없이 합법수를 반환한다', () => {
    // 노랑 열린 4 (양끝 (-1,0),(4,0) 모두 타일 있고 비어 위협) → 둘 다 못 막음
    const board = build(
      [...mixedRow(-1, 4, 0)],
      [
        [hex(0, 0), 'yellow'],
        [hex(1, 0), 'yellow'],
        [hex(2, 0), 'yellow'],
        [hex(3, 0), 'yellow'],
      ],
    )
    const state = makeState(board, 'brown')
    const move = createAi({ seed: 3 }).chooseMove(state)
    expect(validateMove(state, move).ok).toBe(true)
  })
})

describe('AI: 합법성 / allowedMoveTypes', () => {
  it('타일이 0개면 pieceOnly 를 둔다', () => {
    const board = build([
      [hex(0, 0), 'brown'],
      [hex(1, 0), 'brown'],
    ])
    const state = makeState(board, 'brown', {
      supplies: { yellow: { ...fullSupply }, brown: { tiles: 0, pieces: 30, queenUsed: false } },
    })
    expect(allowedMoveTypes(state)).toEqual(['pieceOnly'])
    const move = createAi({ seed: 4 }).chooseMove(state)
    expect(move.type).toBe('pieceOnly')
    expect(validateMove(state, move).ok).toBe(true)
  })

  it('선플레이어 첫 턴(moveNumber 0)은 tileAndPiece 를 둔다', () => {
    const state = createInitialState() // turn yellow, moveNumber 0
    const move = createAi({ seed: 4 }).chooseMove(state)
    expect(move.type).toBe('tileAndPiece')
    expect(validateMove(state, move).ok).toBe(true)
  })

  it('무작위로 도달한 상태들에서 항상 합법수를 낸다 (퍼즈)', () => {
    // 합법성은 수 생성/폴백 문제라 탐색 깊이와 무관 → 빠른 easy(1수)로 검증.
    const rng = mulberry(99)
    const ai = createAi({ difficulty: 'easy', seed: 5 })
    let state = createInitialState()
    for (let i = 0; i < 120 && state.phase === 'playing'; i++) {
      const aiMove = ai.chooseMove(state)
      expect(validateMove(state, aiMove).ok).toBe(true)
      const rnd = randomLegalMove(state, rng)
      if (rnd === null) break
      state = applyMove(state, rnd)
    }
  })
})

describe('AI: self-play (엔진 통합)', () => {
  it('AI vs AI 가 합법수만으로 게임을 종료까지 진행한다', () => {
    const ai = createAi({ seed: 7 })
    let state = createInitialState()
    let plies = 0
    while (state.phase === 'playing' && plies < 2000) {
      const move = ai.chooseMove(state)
      expect(validateMove(state, move).ok).toBe(true)
      state = applyMove(state, move)
      plies++
    }
    expect(state.phase).toBe('finished')
    expect(state.result).toBeDefined()
  })

  it('medium(빔 서치)가 easy(1수)보다 강하다', () => {
    const games = 6
    let mediumWins = 0
    let easyWins = 0
    for (let i = 0; i < games; i++) {
      const med = createAi({ difficulty: 'medium', seed: 100 + i })
      const esy = createAi({ difficulty: 'easy', seed: 200 + i })
      const medIsYellow = i % 2 === 0
      const winner = medIsYellow ? playGame(med, esy) : playGame(esy, med)
      const medSide: Player = medIsYellow ? 'yellow' : 'brown'
      if (winner === medSide) mediumWins++
      else if (winner !== 'draw') easyWins++
    }
    // eslint-disable-next-line no-console
    console.log(`medium ${mediumWins} : ${easyWins} easy (무 ${games - mediumWins - easyWins})`)
    expect(mediumWins).toBeGreaterThan(easyWins)
  }, 30000)

  it('AI가 게임 특색을 쓴다 — 기존 타일 위 말 + 타일 2개', () => {
    const ai = createAi({ difficulty: 'medium', seed: 11 })
    let state = createInitialState()
    let onExisting = 0 // 방금 놓은 타일이 아닌 기존 타일 위에 말
    let onOpponentTile = 0 // 상대 색 타일 위에 말(선점)
    let twoTiles = 0
    let plies = 0
    while (state.phase === 'playing' && plies < 90) {
      const mover = state.turn
      const move = ai.chooseMove(state)
      if (move.type === 'twoTiles') twoTiles++
      else {
        const at = move.piece.at
        const existing = cellAt(state.board, at)
        const isNewTile = move.type === 'tileAndPiece' && hexEquals(move.tile, at)
        if (existing && !isNewTile) {
          onExisting++
          if (existing.tile.owner !== mover) onOpponentTile++
        }
      }
      state = applyMove(state, move)
      plies++
    }
    // eslint-disable-next-line no-console
    console.log(`특색: 기존타일위말 ${onExisting}, 상대타일선점 ${onOpponentTile}, 타일2개 ${twoTiles}`)
    expect(onExisting).toBeGreaterThan(0)
  }, 30000)

  // 난이도 노브 = 탐색 깊이(easy 1수 / medium 깊이2 / hard 깊이4). medium·hard 모두 easy 보다 강한지
  // 검증한다(hard vs medium 자체 대국은 둘 다 유능해 마진이 노이즈라 비교 대상으로 부적합).
  it('hard(깊은 서치)가 easy(1수)보다 강하다', () => {
    const games = 4
    let hardWins = 0
    let easyWins = 0
    for (let i = 0; i < games; i++) {
      const hard = createAi({ difficulty: 'hard', seed: 300 + i })
      const esy = createAi({ difficulty: 'easy', seed: 500 + i })
      const hardIsYellow = i % 2 === 0
      const winner = hardIsYellow ? playGame(hard, esy) : playGame(esy, hard)
      const hardSide: Player = hardIsYellow ? 'yellow' : 'brown'
      if (winner === hardSide) hardWins++
      else if (winner !== 'draw') easyWins++
    }
    // eslint-disable-next-line no-console
    console.log(`hard ${hardWins} : ${easyWins} easy (무 ${games - hardWins - easyWins})`)
    expect(hardWins).toBeGreaterThan(easyWins)
  }, 60000)

  it('같은 seed·상태면 같은 수를 낸다 (결정성)', () => {
    const board = build(
      [...mixedRow(0, 3, 0)],
      [
        [hex(0, 0), 'brown'],
        [hex(1, 0), 'brown'],
      ],
    )
    const state = makeState(board, 'brown')
    const a = createAi({ seed: 42 }).chooseMove(state)
    const b = createAi({ seed: 42 }).chooseMove(state)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('AI: 전문가가 벌어진 3목을 잠기기 전에 끊는다 (벌집-채우기 예방 회귀)', () => {
  // 실제 패배 대국(BTB1)의 28수 직전 국면. 노랑이 (-4,1)(-2,-1)(0,-3)로 "벌어진 3목"을 만들었고,
  // 그 줄은 다음 수(29수)에 노랑 벌집으로 잠긴다. 잠기면 갈색은 보통 말로 그 위에 못 둔다(§5) →
  // 사후 차단 불가. 그래서 전문가는 잠기기 전에 빈 급소 (-3,0)/(-1,-2)를 선점해 줄을 끊어야 한다.
  // spreadThree 인식 전(옛 전문가)엔 엉뚱한 (2,-5)를 둬 그대로 패배했다 — 이 테스트가 예방을 고정한다.
  const PREFIX =
    't -1 1 0 0;t 1 -1 -1 1;t 0 -1 1 -1;t -1 0 -1 0;t -1 -1 -1 -1;t 1 1 0 -1;t 1 -2 1 -2;t 1 2 1 0;t 1 3 1 1;t 0 -2 0 -2;t 1 -3 1 -3;t 1 -4 1 -4;t -2 -1 -2 -1;t -2 1 -2 1;t -3 2 -3 2;t 0 -4 0 -4;t 0 -3 0 -3;t -1 -4 -1 -4;t 2 -4 2 -4;t -1 -3 -1 -3;t -2 -4 -2 -4;t -2 -2 -2 -2;t -3 -1 -3 -1;t -3 1 -3 1;t -4 1 -4 1;t 1 -5 1 -5;t 2 -6 2 -6'

  function parseMove(tok: string): Move {
    const p = tok.trim().split(/\s+/)
    const n = (i: number): number => Number(p[i])
    if (p[0] === '2') return { type: 'twoTiles', first: hex(n(1), n(2)), second: hex(n(3), n(4)) }
    if (p[0] === 't')
      return { type: 'tileAndPiece', tile: hex(n(1), n(2)), piece: { at: hex(n(3), n(4)), kind: 'normal' } }
    return { type: 'pieceOnly', piece: { at: hex(n(1), n(2)), kind: 'normal' } }
  }

  it('전문가가 급소 (-3,0)/(-1,-2)를 선점해 벌어진 3목을 끊는다', () => {
    let state = createInitialState()
    for (const tok of PREFIX.split(';')) state = applyMove(state, parseMove(tok))
    expect(state.turn).toBe('brown') // 28수(갈색=AI) 차례

    const move = createAi({ difficulty: 'expert', seed: 0x2222 }).chooseMove(state)
    expect(validateMove(state, move).ok).toBe(true)
    const at = move.type === 'twoTiles' ? null : move.piece.at
    const breaksSpread = at !== null && (hexEquals(at, hex(-3, 0)) || hexEquals(at, hex(-1, -2)))
    expect(breaksSpread).toBe(true)
  }, 30000)
})

// 한 판을 끝까지 두고 승자를 반환.
function playGame(yellowAi: ReturnType<typeof createAi>, brownAi: ReturnType<typeof createAi>): Player | 'draw' {
  let state = createInitialState()
  let plies = 0
  while (state.phase === 'playing' && plies < 400) {
    const ai = state.turn === 'yellow' ? yellowAi : brownAi
    state = applyMove(state, ai.chooseMove(state))
    plies++
  }
  if (state.result?.kind === 'win') return state.result.winner
  if (state.result?.kind === 'score') return state.result.winner
  return 'draw'
}

// ---- 테스트용 무작위 합법수 생성 -------------------------------------------

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(rng() * arr.length)]
}

function emptyTiles(board: Board): ReturnType<typeof hex>[] {
  const out: ReturnType<typeof hex>[] = []
  for (const key of Object.keys(board)) {
    if (!board[key]!.piece) {
      const [q, r] = key.split(',').map(Number)
      out.push(hex(q!, r!))
    }
  }
  return out
}

function randomLegalMove(state: GameState, rng: () => number): Move | null {
  const allowed = allowedMoveTypes(state)
  if (allowed.length === 0) return null
  const board = state.board
  const frontier = frontierCells(board)
  for (let i = 0; i < 80; i++) {
    const t = pick(allowed, rng)
    let m: Move | null = null
    if (t === 'tileAndPiece' && frontier.length > 0) {
      const tile = pick(frontier, rng)!
      const board1 = withTile(board, tile, state.turn)
      const at = pick(emptyTiles(board1), rng)
      if (at) m = { type: 'tileAndPiece', tile, piece: { at, kind: 'normal' } }
    } else if (t === 'twoTiles' && frontier.length > 0) {
      const first = pick(frontier, rng)!
      const second = pick(frontierCells(withTile(board, first, state.turn)), rng)
      if (second) m = { type: 'twoTiles', first, second }
    } else if (t === 'pieceOnly') {
      const at = pick(emptyTiles(board), rng)
      if (at) m = { type: 'pieceOnly', piece: { at, kind: 'normal' } }
    }
    if (m && validateMove(state, m).ok) return m
  }
  return null
}
