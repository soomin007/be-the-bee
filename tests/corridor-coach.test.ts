// 방어 코칭 탐지기 corridorLockThreats: "곧 잠길 벌집 줄"의 결정적 순간에 끊을 칸(키스톤)을 잡는가.
// 픽스처는 ai_hive_lock_defense §2 의 BTB1 게임1·2(사람 노랑이 회랑으로 승). 오발률·발동 빈도 측정은
// session_logs/2026-06-30 "코칭 폴백"(self-play 8판 10%) 참고 — 여기선 결정적 정확성만 단언(AI 없이 빠름).
import { describe, it, expect } from 'vitest'
import { createInitialState, applyMove, hex, corridorLockThreats } from '../src/engine/index'
import type { Move } from '../src/engine/index'

function parseTok(tok: string): Move {
  const p = tok.trim().split(/\s+/)
  const n = (i: number): number => Number(p[i])
  if (p[0] === '2') return { type: 'twoTiles', first: hex(n(1), n(2)), second: hex(n(3), n(4)) }
  if (p[0] === 't') return { type: 'tileAndPiece', tile: hex(n(1), n(2)), piece: { at: hex(n(3), n(4)), kind: 'normal' } }
  return { type: 'pieceOnly', piece: { at: hex(n(1), n(2)), kind: 'normal' } }
}
function reconstruct(mv: string): ReturnType<typeof createInitialState>[] {
  let s = createInitialState()
  const states = [s]
  for (const m of mv.split(';').map(parseTok)) { try { s = applyMove(s, m) } catch { break } states.push(s) }
  return states
}
function decode(b64: string): string {
  return (JSON.parse(Buffer.from(b64, 'base64').toString()) as { mv: string }).mv
}
function cutSet(board: ReturnType<typeof createInitialState>['board'], attacker: 'yellow' | 'brown'): Set<string> {
  const out = new Set<string>()
  for (const t of corridorLockThreats(board, attacker)) for (const c of t.cutCells) out.add(c)
  return out
}

const G1 = 't -1 1 0 0;2 0 1 2 -1;t 1 -1 1 0;t 2 0 2 0;2 2 -2 3 -3;t 1 1 1 1;t -2 2 1 -1'
const COR1 = ['-1,1', '0,0', '1,-1', '2,-2', '3,-3']
const B2 = 'eyJ2IjoxLCJtdiI6InQgMCAxIDEgMDsyIDIgMCAyIC0xO3QgMyAwIDIgMDt0IDIgLTIgMCAwO3QgMiAxIDIgLTE7dCAzIC0yIDAgMTt0IDQgLTEgMyAtMjt0IDAgLTEgMCAtMTt0IDAgLTIgMCAtMjt0IDEgLTIgMiAtMjsyIDEgMiAwIDM7dCAxIC0xIDEgLTE7dCAzIC0zIDMgLTM7dCAtMSAxIC0xIDE7dCAtMiAyIC0yIDI7dCAtMiAxIC0yIDE7dCAtMyAxIC0zIDE7dCAxIDEgMSAxO3QgMyAtMSAzIC0xO3QgMyAtNCAzIC00O3QgMyAxIDMgMTt0IC0xIC0xIC0xIC0xO3QgMCAyIDMgMCIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0ODY5NDAzNjJ9'
const COR2_KEYSTONE = '3,0'

describe('corridorLockThreats — 방어 코칭(곧 잠길 벌집 줄 끊기)', () => {
  it('빈 보드/초반엔 발동하지 않는다', () => {
    expect(corridorLockThreats(createInitialState().board, 'yellow')).toHaveLength(0)
  })

  it('게임1: 마지막 예방 기회(갈색 차례, 4번째 수 직전)에 회랑 칸을 끊을 수 있다고 알린다', () => {
    const st = reconstruct(G1)[3]! // 3플라이 후 = 갈색 차례(문서상 마지막 예방 기회)
    expect(st.turn).toBe('brown')
    const cuts = cutSet(st.board, 'yellow') // 공격자 = 노랑(사람)
    expect(cuts.size).toBeGreaterThan(0)
    expect(COR1.some((c) => cuts.has(c))).toBe(true) // 회랑 칸 중 하나 이상을 끊을 곳으로 제시
  })

  it('게임2: 잠기기 전(갈색 7번째 수 직전) 키스톤 (3,0) 을 끊을 곳으로 제시한다', () => {
    const st = reconstruct(decode(B2))[7]! // 잠김(11수) 전 예방 창
    expect(st.turn).toBe('brown')
    expect(cutSet(st.board, 'yellow').has(COR2_KEYSTONE)).toBe(true)
  })

  it('순수·결정적: 같은 보드는 같은 결과', () => {
    const st = reconstruct(decode(B2))[7]!
    expect(corridorLockThreats(st.board, 'yellow')).toEqual(corridorLockThreats(st.board, 'yellow'))
  })
})
