// 회랑 끊기 "후보 시딩" 실험 프로브(2026-07-08, backlog #2 — 측정 완료·기각, 결과는
// ai_hive_lock_defense.md §3). 가설: 06-30 그리드가 게임3 예방 0건이었던 건 "끊는 수가 MCTS
// 후보에 없어서"다(06-29 잠금수 교훈의 방어판). 실험: ① corridorLockThreats 는 게임3에서 아예
// 발화하지 않음을 발견(연속 3run 트리거 — 노랑이 -2·-3·-5 틈 유지 후 twoTiles 로 2연속→5연속
// 점프, 발화 순간이 없다. UX 코칭도 게임3 유형엔 침묵하는 블라인드 스팟). ② 그래서 아래
// corridorWindows(창 기준 넓은 스캔)를 만들어 mctsActions 루트에 cutCells 를 시딩(강제 아님)해
// 측정 → 28·30수(예방 가능한 마지막 두 차례)에서 (4,-4)·(4,-6)이 후보에 들어갔지만 기본·
// sims4000·sims4000+d5 전부 같은 수(회랑 밖) 선택. **후보 부재가 원인이 아니라 가치 지평 한계**
// (끊음의 보상이 rollout/leaf 에 안 보임)로 확정 → 엔진 변경 되돌림(시딩 코드는 아래 PATCH 주석).
//   실행: $env:CUT_PROBE='1'; npm run probe -- probes/_corridor-cut-probe.test.ts
//   (엔진은 무시딩 상태 — 시딩 재현은 PATCH 주석을 ai.ts mctsActions 끝에 적용)
// 판정 기준: AI 의 수가 위협 창(lockCells)에 방어 타일/말을 놓으면 "끊음"(창 안 방어 타일·말
// 어느 쪽이든 그 창을 무효로 만든다).
//
// PATCH(시딩 재현용 — src/engine/ai.ts mctsActions 의 return ranked 직전):
//   if (isRoot) {
//     for (const t of corridorWindows(state.board, opponent(me))) {
//       for (const k of t.cutCells) {
//         const m = placementMove(state, hexFromKey(k), me)
//         if (m) add(m)
//       }
//     }
//   }
import { describe, it } from 'vitest'
import {
  createInitialState,
  applyMove,
  createAi,
  lockedTiles,
  cellAt,
  pieceAt,
  hexNeighbors,
  hexAdd,
  hexSubtract,
  hexFromKey,
  HEX_AXES,
  LINE_LENGTH,
  hex,
  hexKey,
} from '../src/engine/index'
import type { Board, GameState, Hex, Move, Player } from '../src/engine/index'

const RUN = Number(process.env.CUT_PROBE ?? 0)

// 창 기준 넓은 회랑 스캔(실험용 — 엔진의 corridorLockThreats 는 연속 3run 트리거라 게임3의
// "틈 있는 회랑"을 못 잡는다). 5칸 창에 attacker 타일 ≥3(연속 불문) + 방어 타일·말 0 + 끊을 칸 ≥1.
// UX 코칭에 쓰려면 오발 측정부터(06-30 보수판 오발 10% 기준) — 여기선 측정·시딩 연구용으로만.
interface CutWindow {
  lockCells: string[]
  cutCells: string[]
}
function corridorWindows(board: Board, attacker: Player): CutWindow[] {
  const defender: Player = attacker === 'yellow' ? 'brown' : 'yellow'
  const locked = lockedTiles(board)
  const tilePlaceable = (c: Hex): boolean => hexNeighbors(c).some((n) => cellAt(board, n) !== undefined)
  const out: CutWindow[] = []
  const seen = new Set<string>()
  for (const key of Object.keys(board)) {
    if (board[key]!.tile.owner !== attacker) continue
    const base = hexFromKey(key)
    for (const dir of HEX_AXES) {
      for (let s = 0; s < LINE_LENGTH; s++) {
        let c = base
        for (let i = 0; i < s; i++) c = hexSubtract(c, dir)
        const windowCells: string[] = []
        const cut: string[] = []
        let mine = 0
        let ok = true
        for (let i = 0; i < LINE_LENGTH; i++) {
          const k = hexKey(c)
          windowCells.push(k)
          const cell = cellAt(board, c)
          const piece = pieceAt(board, c)
          if ((piece && piece.owner === defender) || (cell && cell.tile.owner === defender)) {
            ok = false
            break
          }
          if (cell && cell.tile.owner === attacker) mine++
          if (!locked.has(k)) {
            if (cell && cell.tile.owner === attacker) {
              if (!piece) cut.push(k)
            } else if (!cell && tilePlaceable(c)) {
              cut.push(k)
            }
          }
          c = hexAdd(c, dir)
        }
        if (!ok || mine < 3 || mine >= LINE_LENGTH || cut.length === 0) continue
        const wkey = windowCells.join('|')
        if (seen.has(wkey)) continue
        seen.add(wkey)
        out.push({ lockCells: windowCells, cutCells: cut })
      }
    }
  }
  return out
}

// 게임1·게임3 BTB1(ai_hive_lock_defense §2, _gen-corridor 와 동일). 노랑(공격)이 회랑으로 승.
const GAME1 =
  'eyJ2IjoxLCJtdiI6InQgLTEgMSAwIDA7MiAwIDEgMiAtMTt0IDEgLTEgMSAwO3QgMiAwIDIgMDsyIDIgLTIgMyAtMzt0IDEgMSAxIDE7dCAtMiAyIDEgLTE7dCAwIDIgMCAyO3QgLTEgMyAtMSAzO3QgMyAtMSAzIC0xO3QgNCAtMiA0IC0yO3QgMiAxIDIgMTt0IDMgLTIgMiAtMjt0IDQgLTEgNCAtMTt0IDUgLTIgMyAtMzt0IDQgLTQgNCAtNDt0IDEgLTIgLTEgMSIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0NDMyMDQ1MTR9'
const GAME3 =
  'eyJ2IjoxLCJtdiI6InQgMiAwIDEgMDt0IDEgLTEgMiAwO3QgMSAxIDEgMTt0IDEgMiAxIDI7dCAzIC0xIDEgLTE7dCAxIC0yIDEgLTI7MiA0IC0yIDAgMjt0IDIgMSAyIDE7dCAyIDIgMiAyO3QgMyAwIDMgMDt0IDAgMyAwIDM7dCAyIC0zIDIgLTM7dCAyIC0xIDIgLTE7dCAwIC0xIDAgLTE7dCAtMSAwIC0xIDA7dCAzIC00IDMgLTQ7dCA0IC01IDQgLTU7dCA0IC0xIDQgLTE7dCA1IC0yIDUgLTI7dCAzIC0yIDMgLTI7MiAwIDQgMCAxO3QgMiAtMiAyIC0yO3QgMCAtMiAwIC0yO3QgMyAtMyAzIC0zO3QgMyAtNSAzIC01O3QgMSAtMyAxIC0zO3QgNCAtMyA0IC0zO3QgMCAtMyAwIC0zO3QgLTEgLTMgLTEgLTM7dCAyIC01IDIgLTU7MiA0IC00IDQgLTY7dCAtMSAtMiAtMSAtMjt0IDEgLTQgMSAtNDt0IDIgLTQgMiAtNDt0IDIgLTYgMiAtNjt0IDMgMiAzIDI7dCA0IC03IDQgLTQ7dCA1IC01IDUgLTU7dCAtMSAzIDQgLTY7dCAxIC01IDEgLTU7dCA1IC0zIDQgLTciLCJpbmYiOjAsInFuIjowLCJtb2RlIjoidnNBaSIsImF0IjoxNzgyNDg3Mjg4NzgyfQ=='

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

/** 처음 k수를 적용한 국면(다음 수는 k+1수째). */
function stateAfter(moves: Move[], k: number): GameState {
  let s = createInitialState()
  for (let i = 0; i < k; i++) s = applyMove(s, moves[i]!)
  return s
}

/** 한 수가 건드린 칸들(타일·말 모두 — 방어 타일/말 어느 쪽이든 창을 끊는다). */
function touchedKeys(m: Move): string[] {
  if (m.type === 'twoTiles') return [hexKey(m.first), hexKey(m.second)]
  if (m.type === 'tileAndPiece') return [hexKey(m.tile), hexKey(m.piece.at)]
  return [hexKey(m.piece.at)]
}

function fmtMove(m: Move): string {
  return touchedKeys(m).join(' + ')
}

/** 국면에서 전문가를 돌려 "위협 창을 끊었는지" 판정. */
function probeTurn(
  s: GameState,
  attacker: Player,
  seed: number,
  opts: { mctsSims?: number; mctsRolloutDepth?: number } = {},
): { cut: boolean; move: string; threats: number; cuts: string } {
  const threats = corridorWindows(s.board, attacker)
  const lockAll = new Set(threats.flatMap((t) => [...t.lockCells]))
  const cutAll = new Set(threats.flatMap((t) => [...t.cutCells]))
  const ai = createAi({ difficulty: 'expert', seed, ...opts })
  const mv = ai.chooseMove(s)
  const cut = touchedKeys(mv).some((k) => lockAll.has(k))
  return { cut, move: fmtMove(mv), threats: threats.length, cuts: [...cutAll].join(' ') }
}

describe('회랑 끊기 시딩 프로브 (게임3 + 게임1 회귀)', () => {
  it('게임3 결정적 갈색 차례에서 끊는지 + 게임1 4수 예방 유지', () => {
    if (RUN <= 0) return
    const g3 = decode(GAME3)
    console.log(`게임3 ${g3.length}수 재구성`)
    // 갈색 차례(k 홀수 → k+1수째가 갈색)를 훑어 corridorLockThreats(노랑) 가 발화하는 지점을 찾고,
    // 발화한 차례마다 전문가를 돌린다(시딩이 행동을 바꾸는지 그 자리에서 측정).
    for (let k = 17; k <= 37; k += 2) {
      const s = stateAfter(g3, k)
      if (s.phase !== 'playing' || s.turn !== 'brown') continue
      const threats = corridorWindows(s.board, 'yellow')
      if (threats.length === 0) {
        console.log(`${k + 1}수(갈색): 위협 0`)
        continue
      }
      const r = probeTurn(s, 'yellow', 0xb17)
      console.log(`${k + 1}수(갈색): 위협 ${r.threats} · cut후보 [${r.cuts}] · AI ${r.move} → ${r.cut ? '✂️ 끊음' : '✗ 회랑 밖'}`)
    }
    // 시딩+파라미터 조합(06-30 그리드는 "후보에 없는" 상태에서 잰 것): 28·30수(예방 가능한 마지막
    // 두 차례)에서 sims/depth 를 올려 UCT 가 이제는 끊는 수의 가치를 보는지 확인.
    for (const k of [27, 29]) {
      const s = stateAfter(g3, k)
      for (const o of [{ mctsSims: 4000 }, { mctsSims: 4000, mctsRolloutDepth: 5 }]) {
        const r = probeTurn(s, 'yellow', 0xb17, o)
        console.log(`${k + 1}수 sims${o.mctsSims}/d${o.mctsRolloutDepth ?? 2}: AI ${r.move} → ${r.cut ? '✂️ 끊음' : '✗ 회랑 밖'}`)
      }
    }
    // 게임1 회귀: 4수째(갈색)의 (-1,1) 예방이 유지되는가(06-30: 모든 설정 유지).
    const g1 = decode(GAME1)
    const s1 = stateAfter(g1, 3)
    const r1 = probeTurn(s1, 'yellow', 0xb17)
    console.log(`게임1 4수(갈색): 위협 ${r1.threats} · cut후보 [${r1.cuts}] · AI ${r1.move} → ${r1.cut ? '✂️ 끊음(유지)' : '✗ 회랑 밖(회귀!)'}`)
  }, 900_000)
})
