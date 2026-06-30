// value-net Stage 2 Gate 2: value-net leaf(rolloutDepth 0) expert 가 회랑 칸을 선점하는가?
// off(휴리스틱 leaf) 대조. 수동: npx vitest run tests/_probe-valuenet.test.ts
import { describe, it } from 'vitest'
import { createAi, createInitialState, applyMove, hex } from '../src/engine/index'
import type { Move, ValueNetWeights } from '../src/engine/index'
import { defaultValueNetWeights } from '../src/engine/value-net-weights'

function parseTok(tok: string): Move {
  const p = tok.trim().split(/\s+/)
  const n = (i: number): number => Number(p[i])
  if (p[0] === '2') return { type: 'twoTiles', first: hex(n(1), n(2)), second: hex(n(3), n(4)) }
  if (p[0] === 't') return { type: 'tileAndPiece', tile: hex(n(1), n(2)), piece: { at: hex(n(3), n(4)), kind: 'normal' } }
  return { type: 'pieceOnly', piece: { at: hex(n(1), n(2)), kind: 'normal' } }
}
function reconstruct(mv: string): ReturnType<typeof createInitialState>[] {
  const moves = mv.split(';').map(parseTok)
  let s = createInitialState()
  const out = [s]
  for (const m of moves) { try { s = applyMove(s, m) } catch { break } out.push(s) }
  return out
}
function decode(b64: string): string {
  return (JSON.parse(Buffer.from(b64, 'base64').toString()) as { mv: string }).mv
}
function cellOf(m: Move): string | null {
  const at = m.type === 'tileAndPiece' ? m.piece.at : m.type === 'pieceOnly' ? m.piece.at : null
  return at ? `${at.q},${at.r}` : null
}

const G1 = 't -1 1 0 0;2 0 1 2 -1;t 1 -1 1 0;t 2 0 2 0;2 2 -2 3 -3;t 1 1 1 1;t -2 2 1 -1'
const COR1 = new Set(['-1,1', '0,0', '1,-1', '2,-2', '3,-3'])
const B2 = 'eyJ2IjoxLCJtdiI6InQgMCAxIDEgMDsyIDIgMCAyIC0xO3QgMyAwIDIgMDt0IDIgLTIgMCAwO3QgMiAxIDIgLTE7dCAzIC0yIDAgMTt0IDQgLTEgMyAtMjt0IDAgLTEgMCAtMTt0IDAgLTIgMCAtMjt0IDEgLTIgMiAtMjsyIDEgMiAwIDM7dCAxIC0xIDEgLTE7dCAzIC0zIDMgLTM7dCAtMSAxIC0xIDE7dCAtMiAyIC0yIDI7dCAtMiAxIC0yIDE7dCAtMyAxIC0zIDE7dCAxIDEgMSAxO3QgMyAtMSAzIC0xO3QgMyAtNCAzIC00O3QgMyAxIDMgMTt0IC0xIC0xIC0xIC0xO3QgMCAyIDMgMCIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0ODY5NDAzNjJ9'
const COR2 = new Set(['0,3', '1,2', '2,1', '3,0', '4,-1']) // 키스톤 (3,0)
const MV3 = 't 2 0 1 0;t 1 -1 2 0;t 1 1 1 1;t 1 2 1 2;t 3 -1 1 -1;t 1 -2 1 -2;2 4 -2 0 2;t 2 1 2 1;t 2 2 2 2;t 3 0 3 0;t 0 3 0 3;t 2 -3 2 -3;t 2 -1 2 -1;t 0 -1 0 -1;t -1 0 -1 0;t 3 -4 3 -4;t 4 -5 4 -5;t 4 -1 4 -1;t 5 -2 5 -2;t 3 -2 3 -2;2 0 4 0 1;t 2 -2 2 -2;t 0 -2 0 -2;t 3 -3 3 -3;t 3 -5 3 -5;t 1 -3 1 -3;t 4 -3 4 -3;t 0 -3 0 -3;t -1 -3 -1 -3;t 2 -5 2 -5;2 4 -4 4 -6;t -1 -2 -1 -2;t 1 -4 1 -4;t 2 -4 2 -4;t 2 -6 2 -6;t 3 2 3 2;t 4 -7 4 -4;t 5 -5 5 -5;t -1 3 4 -6;t 1 -5 1 -5;t 5 -3 4 -7'
const COR3 = new Set(['4,-3', '4,-4', '4,-5', '4,-6', '4,-7'])

function probe(label: string, states: ReturnType<typeof createInitialState>[], idxs: number[], cor: Set<string>): void {
  for (const idx of idxs) {
    const st = states[idx]
    if (!st || st.phase !== 'playing' || st.turn !== 'brown') continue
    for (const [tag, vn] of [['off', undefined] as const, ['vnet', true as true]]) {
      const ai = createAi({ difficulty: 'expert', seed: 5, mctsRolloutDepth: 0, valueNet: vn as true | ValueNetWeights | undefined })
      const cell = cellOf(ai.chooseMove(st))
      // eslint-disable-next-line no-console
      console.log(`${label} ${idx + 1}수 [${tag}]: ${cell ?? 'none'} ${cell && cor.has(cell) ? '← HIT' : ''}`)
    }
  }
}

describe('Gate 2: value-net 회랑 프로브', () => {
  it('게임1/2/3 회랑 칸 선점 (value-net vs off, rolloutDepth 0)', () => {
    void defaultValueNetWeights // 가중치 로드 확인
    probe('게임1', reconstruct(G1), [3], COR1)
    probe('게임2', reconstruct(decode(B2)), [3, 5, 7, 9], COR2)
    probe('게임3', reconstruct(MV3), [31, 35], COR3)
  }, 300000)
})
