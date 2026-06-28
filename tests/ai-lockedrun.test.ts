// 잠긴 벌집 안 "막을 수 없는 말 5목" 공격 인식(lockedRun). 전문가 AI 가 자기 벌집을 잠가
// 상대가 막을 수 없는 5목을 노리는지 검증한다(2026-06-29 "양방향 맹점"의 공격 절반).
//
// 회랑을 잠그는 수(타일)는 즉시 말 진전이 없고, 승리는 잠금→채움→채움(depth-5)이라 전문가
// depth-4 지평을 막 벗어난다 → lockedRun 평가 + 루트 잠금-시딩이 없으면 AI 가 잠금수를 놓친다.
import { describe, it, expect } from 'vitest'
import { createAi, applyMove, hex, hexKey, hiveCountdowns } from '../src/engine/index'
import type { Board, GameState, Move, Player } from '../src/engine/index'

function tile(owner: Player): Board[string] {
  return { tile: { owner } }
}
function tilePiece(owner: Player): Board[string] {
  return { tile: { owner }, piece: { owner, kind: 'normal' } }
}

// 갈색 회랑(q=2, axis (0,-1)): 줄기 타일+말 3개 (2,0)(2,-1)(2,-2), (2,1)(2,2)는 빈칸.
// 아래 끝 (2,-3)은 노랑 말로 막혀 말-라인을 아래로 못 늘리고, 위로 (2,1)에 말을 둬도 노랑이
// (2,2)를 막아 방어된다 → 말-확장만으론 못 이긴다. twoTiles{(2,1),(2,2)} 로 잠그면 그 두 칸이
// 잠겨 노랑이 못 막는 movesLeft=2(채움→채움)가 되어 확정승. 이 승리만이 유일한 길이다.
function makeLockableCorridor(): GameState {
  const board: Board = {}
  board[hexKey(hex(2, 0))] = tilePiece('brown')
  board[hexKey(hex(2, -1))] = tilePiece('brown')
  board[hexKey(hex(2, -2))] = tilePiece('brown')
  board[hexKey(hex(2, -3))] = tilePiece('yellow') // 아래 끝 봉쇄
  board[hexKey(hex(6, 0))] = tilePiece('yellow') // 무해한 고립
  board[hexKey(hex(6, 1))] = tile('yellow')
  return {
    board,
    turn: 'brown',
    supplies: {
      yellow: { tiles: 20, pieces: 20, queenUsed: false },
      brown: { tiles: 20, pieces: 20, queenUsed: false },
    },
    moveNumber: 20,
    phase: 'playing',
    infiniteTiles: false,
    queenEnabled: false,
  }
}

function brownMovesLeft(board: Board): number | null {
  const cd = hiveCountdowns(board).find((c) => c.owner === 'brown')
  return cd ? cd.movesLeft : null
}

describe('lockedRun — 잠긴 벌집 안 막을 수 없는 5목 공격 인식', () => {
  // 전문가 탐색은 무겁다 → it 별 타임아웃을 준다(known_issues 2026-06-27 CI flaky 방지).
  it('전문가 갈색은 회랑을 잠가 막을 수 없는 5목(movesLeft<=2)을 만든다', () => {
    const state = makeLockableCorridor()
    expect(brownMovesLeft(state.board)).toBeNull() // 아직 안 잠김
    // 두 시드로 일관되게 잠그는지(동점 tie-break 영향 배제).
    for (const seed of [12345, 777]) {
      const ai = createAi({ difficulty: 'expert', seed })
      const move: Move = ai.chooseMove(state)
      const after = applyMove(state, move)
      expect(brownMovesLeft(after.board), `seed ${seed}`).not.toBeNull()
      expect(brownMovesLeft(after.board)!, `seed ${seed}`).toBeLessThanOrEqual(2)
    }
  }, 60000)

  it('lockedRun 을 끄면(가중치 0) 같은 위치에서 잠금을 놓친다(이 항이 원인임을 확인)', () => {
    const state = makeLockableCorridor()
    const ai = createAi({ difficulty: 'expert', seed: 12345, weights: { lockedRun: 0 } })
    const after = applyMove(state, ai.chooseMove(state))
    // OFF 면 잠그지 않아 갈색 카운트다운이 안 생긴다(맹점 재현).
    expect(brownMovesLeft(after.board)).toBeNull()
  }, 30000)

  it('medium/hard 는 영향받지 않는다(lockedRun=0) — 잠금-시딩이 전문가 전용', () => {
    // 합법수만 두면 통과(크래시·불법수 회귀 방지). 강도는 self-play 로 별도 검증.
    const state = makeLockableCorridor()
    for (const difficulty of ['medium', 'hard'] as const) {
      const ai = createAi({ difficulty, seed: 7 })
      expect(() => applyMove(state, ai.chooseMove(state))).not.toThrow()
    }
  })
})
