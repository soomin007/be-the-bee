// 난이도/성향 상성 self-play 시뮬레이션(분석 도구). npm test 와 분리되어 있다(vite.config 의
// test.include 는 tests/ 와 src/ 만 잡음). 실행: `npm run sim` (vite.sim.config.ts 사용).
// 결과는 콘솔 + scripts/sim-result.txt 로 출력. 표본(N)이 작아 수치는 러프한 경향치다.
import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createInitialState } from '../src/engine/state'
import { applyMove } from '../src/engine/moves'
import { createAi, type Difficulty, type Persona } from '../src/engine/ai'
import type { Player } from '../src/engine/types'

const N = Number(process.env.SIM_N ?? 4) // 매치업당 한 진영 기준 판수(SIM_N 으로 조절)
const PLY_CAP = 130

interface Cfg {
  difficulty: Difficulty
  persona: Persona
}

function playGame(a: Cfg, b: Cfg, seed: number): Player | 'draw' | 'unfinished' {
  const aiY = createAi({ ...a, seed })
  const aiB = createAi({ ...b, seed: seed + 9973 })
  let state = createInitialState()
  try {
    for (let ply = 0; ply < PLY_CAP && state.phase === 'playing'; ply++) {
      const ai = state.turn === 'yellow' ? aiY : aiB
      state = applyMove(state, ai.chooseMove(state))
    }
  } catch {
    return 'unfinished'
  }
  if (state.phase !== 'finished' || !state.result) return 'unfinished'
  return state.result.kind === 'win' ? state.result.winner : 'draw'
}

// x(노랑) vs y(갈색) N판
function series(x: Cfg, y: Cfg, n: number): { xw: number; yw: number; d: number } {
  let xw = 0
  let yw = 0
  let d = 0
  for (let s = 0; s < n; s++) {
    const r = playGame(x, y, s * 31 + 7)
    if (r === 'yellow') xw++
    else if (r === 'brown') yw++
    else d++
  }
  return { xw, yw, d }
}

const pct = (a: number, b: number): string => {
  const t = a + b
  return t === 0 ? ' - ' : `${Math.round((a / t) * 100)}%`
}

describe('상성 시뮬레이션', () => {
  it('난이도 / 성향 매치업 승률', () => {
    let yTotal = 0
    let bTotal = 0
    const lines: string[] = []

    // 양쪽 진영을 번갈아 둬 선(노랑) 이점을 상쇄한 head-to-head.
    const headToHead = (a: Cfg, b: Cfg): { aw: number; bw: number; d: number } => {
      const f = series(a, b, N)
      const r = series(b, a, N)
      yTotal += f.xw + r.xw
      bTotal += f.yw + r.yw
      return { aw: f.xw + r.yw, bw: f.yw + r.xw, d: f.d + r.d }
    }

    lines.push('=== 난이도 상성 (성향 balanced, 무승부 제외 승률) ===')
    const diffPairs: Array<[Difficulty, Difficulty]> = [
      ['easy', 'medium'],
      ['easy', 'hard'],
      ['medium', 'hard'],
    ]
    for (const [da, db] of diffPairs) {
      const h = headToHead({ difficulty: da, persona: 'balanced' }, { difficulty: db, persona: 'balanced' })
      lines.push(`${da} vs ${db}: ${da} ${pct(h.aw, h.bw)} (${h.aw}-${h.bw}, 무 ${h.d})`)
    }

    lines.push('')
    lines.push('=== 성향 상성 (난이도 medium, 무승부 제외 승률, 양쪽 진영 평균) ===')
    const personas: Persona[] = ['balanced', 'aggressive', 'defensive', 'hive']
    for (let i = 0; i < personas.length; i++) {
      for (let j = i + 1; j < personas.length; j++) {
        const pa = personas[i]!
        const pb = personas[j]!
        const h = headToHead({ difficulty: 'medium', persona: pa }, { difficulty: 'medium', persona: pb })
        lines.push(`${pa} vs ${pb}: ${pa} ${pct(h.aw, h.bw)} (${h.aw}-${h.bw}, 무 ${h.d})`)
      }
    }

    lines.push('')
    lines.push(`=== 선(노랑) 이점: 노랑 ${pct(yTotal, bTotal)} (${yTotal}-${bTotal} 전체) ===`)

    const report = lines.join('\n')
    writeFileSync('scripts/sim-result.txt', report + '\n', 'utf8')
    // eslint-disable-next-line no-console
    console.log('\n' + report + '\n')
  }, 900000)
})
