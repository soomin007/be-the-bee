// 공유 코드(BTB1:) 인코드↔디코드 라운드트립. compact 형식이 작고, 재생으로 정확히 복원되는지.
import { describe, it, expect } from 'vitest'
import { encodeSnapshot, decodeSnapshot } from '../src/ui/game-save'
import type { GameSnapshot } from '../src/ui/game-save'
import { applyMove, createAi, createInitialState } from '../src/engine/index'
import type { GameState, Move } from '../src/engine/index'

// AI 로 N 수 둬서 합법 수만으로 스냅샷을 만든다(수동 좌표 추측 회피).
function playSnapshot(plies: number, infinite = false): GameSnapshot {
  const ai = createAi({ difficulty: 'easy', seed: 7 })
  let state = createInitialState({ infiniteTiles: infinite })
  const history: GameState[] = []
  const moveLog: Move[] = []
  for (let i = 0; i < plies && state.phase === 'playing'; i++) {
    const m = ai.chooseMove(state)
    history.push(state)
    state = applyMove(state, m)
    moveLog.push(m)
  }
  return { v: 1, state, history, moveLog, mode: 'vsAi', savedAt: 1700000000000 }
}

describe('공유 코드 라운드트립', () => {
  it('compact 코드로 복원하면 보드/턴/자원/수기록이 원본과 같다', () => {
    const snap = playSnapshot(12)
    const code = encodeSnapshot(snap)
    expect(code.startsWith('BTB1:')).toBe(true)

    const back = decodeSnapshot(code)
    expect(back).not.toBeNull()
    expect(back!.moveLog.length).toBe(snap.moveLog.length)
    // 재생 결과가 원본 상태와 완전히 일치
    expect(back!.state.board).toEqual(snap.state.board)
    expect(back!.state.turn).toBe(snap.state.turn)
    expect(back!.state.supplies).toEqual(snap.state.supplies)
    expect(back!.state.moveNumber).toBe(snap.state.moveNumber)
    expect(back!.mode).toBe('vsAi')
  })

  it('무한 모드 플래그가 코드를 통해 보존된다', () => {
    const snap = playSnapshot(8, true)
    const back = decodeSnapshot(encodeSnapshot(snap))
    expect(back!.state.infiniteTiles).toBe(true)
    expect(back!.state.board).toEqual(snap.state.board)
  })

  it('compact 코드는 전체 스냅샷 직렬화보다 훨씬 짧다', () => {
    const snap = playSnapshot(20)
    const code = encodeSnapshot(snap)
    const full = JSON.stringify(snap)
    expect(code.length).toBeLessThan(full.length / 4)
  })

  it('빈/손상 코드는 null', () => {
    expect(decodeSnapshot('')).toBeNull()
    expect(decodeSnapshot('BTB1:!!!not-base64!!!')).toBeNull()
    expect(decodeSnapshot('BTB1:' + btoa('{"v":1,"mv":"t 0 0"}'))).toBeNull() // 불완전 토큰 → 재생 실패
  })

  it('메신저에 인사말과 섞여 와도 BTB1: 코드만 뽑아 복원한다', () => {
    const snap = playSnapshot(10)
    const code = encodeSnapshot(snap)
    const pasted = `재밌었어요!\n${code}\n분석 부탁해요 🙏`
    const back = decodeSnapshot(pasted)
    expect(back).not.toBeNull()
    expect(back!.state.board).toEqual(snap.state.board)
  })
})
