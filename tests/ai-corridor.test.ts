// 회귀: 전문가 AI 가 "허리 끊기" — 상대가 회랑(곧 벌집이 될 타일선) 위에 말을 채워 만드는 "막을 수
// 없는 5목"(backlog §2 실패 기보의 정석)을 잠기기 전에 끊는다.
//
// 셋업(실패 기보의 본질): 노랑이 길이-4 회랑 (0,0)..(3,0) 위에 말 2개((1,0),(2,0))를 이미 올렸다.
// 이 줄이 5칸으로 잠기면 갈색은 그 위에 보통 말을 못 둬(§5) 사후 차단이 불가능 → 노랑이 나머지를
// 채워 5목 승리. 정석 대응은 잠기기 전에 빈 급소 (0,0)/(3,0) 에 갈색 말을 선점해 줄을 끊는 것이다.
// (잠금 후에도 그 말이 남아 5목을 끊는다 — §5 소급 적용 없음.) 갈색에겐 자기 말 줄도 줘 "회랑을 끊을까,
// 내 줄을 키울까" 경쟁시킨다. 허리끊기(CONTEST_CUT) 이전 전문가는 자기 줄만 키우고 회랑을 방치했다.
import { describe, it, expect } from 'vitest'
import { createInitialState, withTile, withPiece, hex, createAi, type Move, type GameState, type Player } from '../src/engine/index'

function corridorTrapState(): GameState {
  let board = {}
  const tiles: Array<[number, number, Player]> = [
    [0, 0, 'yellow'], [1, 0, 'yellow'], [2, 0, 'yellow'], [3, 0, 'yellow'], // 노랑 길이-4 회랑
    [0, 1, 'brown'], [2, 1, 'yellow'], [1, -1, 'brown'], [3, -1, 'yellow'], // 주변 혼색(다른 벌집 방지)
    [0, 2, 'brown'], [-1, 2, 'brown'], // 갈색 자기 타일(경쟁 줄)
  ]
  for (const [q, r, o] of tiles) board = withTile(board, hex(q, r), o)
  board = withPiece(board, hex(1, 0), { owner: 'yellow', kind: 'normal' }) // 회랑 위 노랑 말
  board = withPiece(board, hex(2, 0), { owner: 'yellow', kind: 'normal' })
  board = withPiece(board, hex(0, 2), { owner: 'brown', kind: 'normal' }) // 갈색 자기 줄(경쟁 유혹)
  board = withPiece(board, hex(-1, 2), { owner: 'brown', kind: 'normal' })
  return { ...createInitialState(), board, turn: 'brown' }
}

// 갈색이 회랑 (0,0)..(3,0) 의 빈 급소 (0,0)/(3,0) 에 말을 선점했는가.
const cutsCorridor = (m: Move): boolean => {
  const at = m.type === 'twoTiles' ? null : m.piece.at
  return !!at && at.r === 0 && (at.q === 0 || at.q === 3)
}

describe('전문가 AI 허리 끊기(회랑 잠김 예방)', () => {
  it('상대가 말을 채운 회랑을 잠기기 전에 끊는다', () => {
    const state = corridorTrapState()
    for (const seed of [0x2222, 1, 7]) {
      const m = createAi({ difficulty: 'expert', seed }).chooseMove(state)
      expect(cutsCorridor(m)).toBe(true) // (0,0) 또는 (3,0) 에 갈색 말 → 회랑 끊김
    }
  }, 30000)

  it('허리끊기(CONTEST_CUT)를 끄면 회랑을 방치한다(기능이 책임짐을 확인)', () => {
    const state = corridorTrapState()
    // CONTEST_CUT=0 = 옛 전문가. 자기 줄을 키우느라 회랑을 안 끊는다(실패 기보의 행동).
    const m = createAi({ difficulty: 'expert', seed: 0x2222, weights: { CONTEST_CUT: 0 } }).chooseMove(state)
    expect(cutsCorridor(m)).toBe(false)
  }, 30000)
})
