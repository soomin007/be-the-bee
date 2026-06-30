// value-net Stage 2: 회랑 기보(게임1~3, 모두 노랑 승) replay → 각 국면 피처 + 결과 z. 색교환으로
// 양 진영(z 반전). 피처는 회전 불변이라 대칭 증강은 피처-MLP엔 무의미(공간 CNN=Stage 3에서만).
// 수동: GEN_C=1 npx vitest run tests/_gen-corridor.test.ts → corridor.jsonl
import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createInitialState, applyMove, encodeFeatures, hex } from '../src/engine/index'
import type { Board, Move, Player } from '../src/engine/index'

const RUN = Number(process.env.GEN_C ?? 0)
const SP = 'C:/Users/soomi/AppData/Local/Temp/claude/C--Users-soomi-Dev-Be-the-Bee/a9d0705f-d9f2-4eeb-af49-1e8362798b0a/scratchpad'
const OUT = `${SP}/corridor.jsonl`

// 게임1~3 BTB1(ai_hive_lock_defense §2). 모두 노랑(공격)이 회랑으로 승.
const B64 = [
  'eyJ2IjoxLCJtdiI6InQgLTEgMSAwIDA7MiAwIDEgMiAtMTt0IDEgLTEgMSAwO3QgMiAwIDIgMDsyIDIgLTIgMyAtMzt0IDEgMSAxIDE7dCAtMiAyIDEgLTE7dCAwIDIgMCAyO3QgLTEgMyAtMSAzO3QgMyAtMSAzIC0xO3QgNCAtMiA0IC0yO3QgMiAxIDIgMTt0IDMgLTIgMiAtMjt0IDQgLTEgNCAtMTt0IDUgLTIgMyAtMzt0IDQgLTQgNCAtNDt0IDEgLTIgLTEgMSIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0NDMyMDQ1MTR9',
  'eyJ2IjoxLCJtdiI6InQgMCAxIDEgMDsyIDIgMCAyIC0xO3QgMyAwIDIgMDt0IDIgLTIgMCAwO3QgMiAxIDIgLTE7dCAzIC0yIDAgMTt0IDQgLTEgMyAtMjt0IDAgLTEgMCAtMTt0IDAgLTIgMCAtMjt0IDEgLTIgMiAtMjsyIDEgMiAwIDM7dCAxIC0xIDEgLTE7dCAzIC0zIDMgLTM7dCAtMSAxIC0xIDE7dCAtMiAyIC0yIDI7dCAtMiAxIC0yIDE7dCAtMyAxIC0zIDE7dCAxIDEgMSAxO3QgMyAtMSAzIC0xO3QgMyAtNCAzIC00O3QgMyAxIDMgMTt0IC0xIC0xIC0xIC0xO3QgMCAyIDMgMCIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0ODY5NDAzNjJ9',
  'eyJ2IjoxLCJtdiI6InQgMiAwIDEgMDt0IDEgLTEgMiAwO3QgMSAxIDEgMTt0IDEgMiAxIDI7dCAzIC0xIDEgLTE7dCAxIC0yIDEgLTI7MiA0IC0yIDAgMjt0IDIgMSAyIDE7dCAyIDIgMiAyO3QgMyAwIDMgMDt0IDAgMyAwIDM7dCAyIC0zIDIgLTM7dCAyIC0xIDIgLTE7dCAwIC0xIDAgLTE7dCAtMSAwIC0xIDA7dCAzIC00IDMgLTQ7dCA0IC01IDQgLTU7dCA0IC0xIDQgLTE7dCA1IC0yIDUgLTI7dCAzIC0yIDMgLTI7MiAwIDQgMCAxO3QgMiAtMiAyIC0yO3QgMCAtMiAwIC0yO3QgMyAtMyAzIC0zO3QgMyAtNSAzIC01O3QgMSAtMyAxIC0zO3QgNCAtMyA0IC0zO3QgMCAtMyAwIC0zO3QgLTEgLTMgLTEgLTM7dCAyIC01IDIgLTU7MiA0IC00IDQgLTY7dCAtMSAtMiAtMSAtMjt0IDEgLTQgMSAtNDt0IDIgLTQgMiAtNDt0IDIgLTYgMiAtNjt0IDMgMiAzIDI7dCA0IC03IDQgLTQ7dCA1IC01IDUgLTU7dCAtMSAzIDQgLTY7dCAxIC01IDEgLTU7dCA1IC0zIDQgLTciLCJpbmYiOjAsInFuIjowLCJtb2RlIjoidnNBaSIsImF0IjoxNzgyNDg3Mjg4NzgyfQ==',
]

function parseTok(tok: string): Move {
  const p = tok.trim().split(/\s+/)
  const n = (i: number): number => Number(p[i])
  if (p[0] === '2') return { type: 'twoTiles', first: hex(n(1), n(2)), second: hex(n(3), n(4)) }
  if (p[0] === 't') return { type: 'tileAndPiece', tile: hex(n(1), n(2)), piece: { at: hex(n(3), n(4)), kind: 'normal' } }
  return { type: 'pieceOnly', piece: { at: hex(n(1), n(2)), kind: 'normal' } }
}
function decode(b64: string): Move[] {
  return (JSON.parse(Buffer.from(b64, 'base64').toString()) as { mv: string }).mv.split(';').map(parseTok)
}
const flip = (p: Player): Player => (p === 'yellow' ? 'brown' : 'yellow')
function swapBoard(board: Board): Board {
  const out: Board = {}
  for (const key of Object.keys(board)) {
    const c = board[key]!
    out[key] = c.piece
      ? { tile: { owner: flip(c.tile.owner) }, piece: { owner: flip(c.piece.owner), kind: c.piece.kind } }
      : { tile: { owner: flip(c.tile.owner) } }
  }
  return out
}

describe('회랑 학습 데이터 생성', () => {
  it('게임1~3 replay → (피처, 결과) + 색교환', () => {
    if (RUN <= 0) return
    const lines: string[] = []
    for (const b64 of B64) {
      const moves = decode(b64)
      let s = createInitialState()
      const states: Board[] = []
      try {
        for (const m of moves) {
          if (s.phase === 'playing') states.push(s.board)
          s = applyMove(s, m)
        }
      } catch {
        /* 끝 */
      }
      const z = s.phase === 'finished' && s.result?.kind === 'win' ? (s.result.winner === 'yellow' ? 1 : -1) : 0
      for (const b of states) {
        lines.push(JSON.stringify({ f: encodeFeatures(b, 'yellow'), z }))
        lines.push(JSON.stringify({ f: encodeFeatures(swapBoard(b), 'yellow'), z: -z })) // 색교환=양 진영
      }
    }
    writeFileSync(OUT, lines.join('\n') + '\n')
    // eslint-disable-next-line no-console
    console.log(`회랑 데이터: ${lines.length} positions (게임1~3 × 색교환) → ${OUT}`)
  }, 120000)
})
