// value-net 학습 데이터 생성(Stage 1). self-play 각 국면의 피처(노랑 관점) + 게임 결과 z(노랑 관점)
// → JSONL. 실행: $env:GEN_N='120'; npm run probe -- probes/_gen-training.test.ts. 학습은 scripts/train-valuenet.mjs.
import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createAi, createInitialState, applyMove, encodeFeatures } from '../src/engine/index'
import type { Difficulty } from '../src/engine/index'

const N = Number(process.env.GEN_N ?? 0) // 0 = 스킵(아래 early return). 실행 시 GEN_N 지정.
const PLY_CAP = 130
const OUT = process.env.GEN_OUT ?? 'probes/.out/training.jsonl'

function genGame(da: Difficulty, db: Difficulty, seed: number): string[] {
  const aiY = createAi({ difficulty: da, seed })
  const aiB = createAi({ difficulty: db, seed: seed + 9973 })
  let state = createInitialState()
  const traj: number[][] = []
  try {
    for (let ply = 0; ply < PLY_CAP && state.phase === 'playing'; ply++) {
      traj.push(encodeFeatures(state.board, 'yellow')) // 노랑 관점 피처
      const ai = state.turn === 'yellow' ? aiY : aiB
      state = applyMove(state, ai.chooseMove(state))
    }
  } catch {
    /* 막다른 위치 → 거기까지로 종료 */
  }
  // 노랑 관점 결과 z: 노랑 승 +1, 갈색 승 -1, 무/미완 0. 모든 국면이 같은 게임 결과를 타깃으로(AlphaZero식).
  const z = state.phase === 'finished' && state.result?.kind === 'win' ? (state.result.winner === 'yellow' ? 1 : -1) : 0
  return traj.map((f) => JSON.stringify({ f, z }))
}

describe('value-net 학습 데이터 생성', () => {
  it('self-play → (피처, 결과) JSONL', () => {
    if (N <= 0) return // npm test(GEN_N 미설정)에선 self-play 안 돌림(무겁다)
    const lines: string[] = []
    // 강도/seed 다양화(과적합·약화 데이터 편중 방지). medium/easy 위주(hard depth-4 는 느림).
    const diffs: Difficulty[] = ['easy', 'medium', 'easy']
    let yWins = 0
    for (let s = 0; s < N; s++) {
      const da = diffs[s % 3]!
      const db = diffs[(s + 1) % 3]!
      const g = genGame(da, db, s * 31 + 7)
      lines.push(...g)
      if (g.length && (JSON.parse(g[0]!) as { z: number }).z === 1) yWins++
    }
    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, lines.join('\n') + '\n')
    // eslint-disable-next-line no-console
    console.log(`생성: ${lines.length} positions, ${N} games (노랑승 ${yWins}) → ${OUT}`)
  }, 1800000)
})
