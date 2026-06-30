// @vitest-environment happy-dom
// 코칭 폴백 UI 통합: '강하게' 코칭에서 곧 잠길 상대 벌집 줄이 있으면 청록 점선 강조 + "잠기기 전에 끊으세요"
// 안내가 뜨는가. autosave 복원으로 게임2(BTB1)의 잠김 전 국면을 주입해 검증한다(AI 는 회랑을 잘 안 쌓아
// 라이브 트리거가 어려우므로 픽스처 주입). 엔진 탐지기 정확성은 corridor-coach.test.ts 가 별도 단언.
import { describe, it, expect, beforeEach } from 'vitest'
import { mountGame } from '../src/ui/game-ui'
import { createInitialState, applyMove, hex } from '../src/engine/index'
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
const B2 = 'eyJ2IjoxLCJtdiI6InQgMCAxIDEgMDsyIDIgMCAyIC0xO3QgMyAwIDIgMDt0IDIgLTIgMCAwO3QgMiAxIDIgLTE7dCAzIC0yIDAgMTt0IDQgLTEgMyAtMjt0IDAgLTEgMCAtMTt0IDAgLTIgMCAtMjt0IDEgLTIgMiAtMjsyIDEgMiAwIDM7dCAxIC0xIDEgLTE7dCAzIC0zIDMgLTM7dCAtMSAxIC0xIDE7dCAtMiAyIC0yIDI7dCAtMiAxIC0yIDE7dCAtMyAxIC0zIDE7dCAxIDEgMSAxO3QgMyAtMSAzIC0xO3QgMyAtNCAzIC00O3QgMyAxIDMgMTt0IC0xIC0xIC0xIC0xO3QgMCAyIDMgMCIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0ODY5NDAzNjJ9'

describe('코칭 폴백 UI (headless DOM)', () => {
  let root: HTMLDivElement
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  it("'강하게' 코칭: 곧 잠길 상대 벌집 줄을 청록으로 강조하고 끊기 안내를 띄운다", () => {
    const states = reconstruct(decode(B2))
    const st = states[7]! // 잠김(11수) 전, 갈색 차례 — 노랑(상대)이 대각 벌집 줄을 잇는 중
    expect(st.turn).toBe('brown')
    // 코칭 강하게 + 핫시트(갈색 차례에 AI 자동착수 없음) + 튜토리얼 스킵
    localStorage.setItem('be-the-bee/settings', JSON.stringify({ coachLevel: 'strong', mode: 'hotseat' }))
    localStorage.setItem('be-the-bee/tutorial-seen', '1')
    // 진행 중 판으로 복원되도록 autosave 주입
    localStorage.setItem('be-the-bee/autosave', JSON.stringify({ v: 1, state: st, history: states.slice(0, 8), moveLog: [], mode: 'hotseat', savedAt: 0 }))

    mountGame(root)

    // 청록(#0891b2) 점선 강조 폴리곤이 1개 이상 그려진다(끊을 칸).
    const cut = Array.from(root.querySelectorAll('polygon')).filter((p) => p.getAttribute('stroke') === '#0891b2')
    expect(cut.length).toBeGreaterThan(0)
    // 끊기 안내 문구가 보인다.
    expect(root.textContent).toContain('잠기기 전에')
  })

  it("'끄기' 코칭에서는 강조하지 않는다", () => {
    const states = reconstruct(decode(B2))
    localStorage.setItem('be-the-bee/settings', JSON.stringify({ coachLevel: 'off', mode: 'hotseat' }))
    localStorage.setItem('be-the-bee/tutorial-seen', '1')
    localStorage.setItem('be-the-bee/autosave', JSON.stringify({ v: 1, state: states[7]!, history: states.slice(0, 8), moveLog: [], mode: 'hotseat', savedAt: 0 }))
    mountGame(root)
    const cut = Array.from(root.querySelectorAll('polygon')).filter((p) => p.getAttribute('stroke') === '#0891b2')
    expect(cut.length).toBe(0)
  })
})
