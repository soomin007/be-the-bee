// 3D 보드 렌더러(src/ui/board3d.ts)가 실제 엔진과 붙는지 검증하는 dev 엔트리.
// 엔진으로 자가대국을 몇 수 진행한 상태를 3D 로 그리고, 버튼으로 더 진행해 update() 를 확인한다.
// 셀 클릭은 onCellClick 으로 좌표를 받아 표시(실제 수 적용·턴 로직 연결은 game-ui 통합 단계).
import { createInitialState } from './engine/state'
import { applyMove } from './engine/moves'
import { createAi } from './engine/ai'
import type { Player } from './engine/types'
import { createBoard3D } from './ui/board3d'

const app = document.getElementById('app') as HTMLElement
const status = document.getElementById('status') as HTMLElement

let state = createInitialState()
const ai: Record<Player, ReturnType<typeof createAi>> = {
  yellow: createAi({ difficulty: 'medium', seed: 1 }),
  brown: createAi({ difficulty: 'medium', seed: 2 }),
}

const board = createBoard3D(app, {
  autoRotate: true,
  onCellClick: (h) => {
    status.textContent = `클릭한 칸: q=${h.q}, r=${h.r} (실제 두기는 게임 통합 단계)`
  },
})

function step(n: number): void {
  for (let i = 0; i < n; i++) {
    if (state.phase !== 'playing') break
    state = applyMove(state, ai[state.turn].chooseMove(state))
  }
  board.update(state)
  const turn = state.phase === 'playing' ? `${state.turn === 'yellow' ? '노랑' : '갈색'} 차례` : '게임 끝'
  status.textContent = `${state.moveNumber}수 · ${turn} · 칸을 클릭하거나 드래그로 돌려보세요`
}

step(24) // 초반 몇 수 깔고 시작
document.getElementById('step')!.addEventListener('click', () => step(2))
