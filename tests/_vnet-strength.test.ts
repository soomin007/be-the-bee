// value-net Stage 2 Gate 2(b): value-net leaf expert 의 강도 회귀 확인. vnet vs hard, off(휴리스틱
// leaf) vs hard 대조. 수동: SIM_N=2 npx vitest run tests/_vnet-strength.test.ts
import { describe, it } from 'vitest'
import { createAi, createInitialState, applyMove } from '../src/engine/index'
import type { AiOptions, Player } from '../src/engine/index'

const N = Number(process.env.SIM_N ?? 0)
const PLY_CAP = 130
function play(a: AiOptions, b: AiOptions, seed: number): Player | 'draw' | 'unfinished' {
  const aiY = createAi({ ...a, seed })
  const aiB = createAi({ ...b, seed: seed + 9973 })
  let s = createInitialState()
  try {
    for (let p = 0; p < PLY_CAP && s.phase === 'playing'; p++) s = applyMove(s, (s.turn === 'yellow' ? aiY : aiB).chooseMove(s))
  } catch {
    return 'unfinished'
  }
  return s.phase === 'finished' && s.result ? (s.result.kind === 'win' ? s.result.winner : 'draw') : 'unfinished'
}
function h2h(a: AiOptions, b: AiOptions): { aw: number; bw: number; d: number } {
  let aw = 0, bw = 0, d = 0
  for (let s = 0; s < N; s++) {
    const r = play(a, b, s * 31 + 7)
    if (r === 'yellow') aw++; else if (r === 'brown') bw++; else d++
    const r2 = play(b, a, s * 31 + 7)
    if (r2 === 'brown') aw++; else if (r2 === 'yellow') bw++; else d++
  }
  return { aw, bw, d }
}

describe('value-net 강도(Gate 2b)', () => {
  it('vnet expert vs hard, off 대조', () => {
    if (N <= 0) return
    const vnet: AiOptions = { difficulty: 'expert', mctsRolloutDepth: 0, valueNet: true }
    const off: AiOptions = { difficulty: 'expert', mctsRolloutDepth: 0 }
    const hard: AiOptions = { difficulty: 'hard' }
    const a = h2h(vnet, hard)
    const b = h2h(off, hard)
    // eslint-disable-next-line no-console
    console.log(`vnet-leaf vs hard: ${a.aw}-${a.bw} (무${a.d}) | off(휴리스틱)-leaf vs hard: ${b.aw}-${b.bw} (무${b.d})`)
  }, 1800000)
})
