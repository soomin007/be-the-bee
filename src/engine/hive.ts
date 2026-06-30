// 벌집(hive): 같은 색 타일 5개 이상이 일렬(docs/design/rules.md §5, §7, §8.4).
// findLines 를 타일 색으로 호출해 탐지한다.

import { LINE_LENGTH, cellAt, pieceAt } from './state'
import { findLines } from './lines'
import { HEX_AXES, hexAdd, hexFromKey, hexKey, hexNeighbors, hexSubtract } from './hex'
import type { Hex } from './hex'
import type { Board, Hive, Player } from './types'

/** 보드의 모든 벌집. 각 축의 5+ 연속 직선 1개당 별개 벌집(중복 허용, §8.4). */
export function detectHives(board: Board): Hive[] {
  const tileColors = new Map<string, Player>()
  for (const key of Object.keys(board)) {
    tileColors.set(key, board[key]!.tile.owner)
  }
  return findLines(tileColors, LINE_LENGTH).map((line) => ({
    owner: line.value,
    cells: line.cells,
  }))
}

/** 한 벌집의 점수 = (타일 수 − 4). 5개=1, 6개=2, … (§7, §8.4). */
export function hiveScore(hive: Hive): number {
  return hive.cells.length - (LINE_LENGTH - 1)
}

/** 진영별 벌집 점수 합계. */
export function totalHiveScores(board: Board): Record<Player, number> {
  const scores: Record<Player, number> = { yellow: 0, brown: 0 }
  for (const hive of detectHives(board)) {
    scores[hive.owner] += hiveScore(hive)
  }
  return scores
}

/**
 * 잠긴 타일 → 벌집 주인. 벌집을 이루는 타일에는 주인만 새 말을 놓을 수 있다(§5).
 * 벌집에 포함되지 않은 인접 타일은 잠그지 않는다(§8.5).
 * 한 타일이 여러 벌집에 속해도 모두 같은 색이므로 주인은 유일하다.
 */
export function lockedTiles(board: Board): Map<string, Player> {
  const locks = new Map<string, Player>()
  for (const hive of detectHives(board)) {
    for (const key of hive.cells) locks.set(key, hive.owner)
  }
  return locks
}

/** 벌집 안에서 안전한 말 5목까지 남은 "초읽기" 위협. */
export interface HiveCountdown {
  /** 그 벌집/줄의 주인(= 곧 승리할 쪽). */
  readonly owner: Player
  /** 안전한 5목까지 더 놓아야 할 owner 의 말 수(1 = 다음 한 수면 승리). */
  readonly movesLeft: number
  /** 그 5칸(hexKey, 축 정렬). 화면 강조용. */
  readonly cells: readonly string[]
}

/**
 * 잠긴 벌집 위에서 "막을 수 없는 말 5목"이 얼마나 임박했는지(엔드게임 초읽기).
 * 벌집(같은 색 타일 5+ 연속, 이미 잠김)의 모든 5칸 창을 보고:
 *  - 창 안에 상대 말이 있으면 그 줄은 5목이 막혀 제외(잠기기 전 선점당한 경우),
 *  - 아니면 movesLeft = 5 − (창 안 owner 말 수). owner 말이 1개 이상인 창만 위협으로 본다.
 * 진영별로 가장 임박한(movesLeft 최소) 위협 하나씩 반환한다. 표준 모드에선 상대가 그 빈칸에
 * 보통 말을 못 놓으므로(§5), 이 카운트다운은 사실상 "확정 패배까지 남은 owner 턴 수"다.
 * (여왕벌 모드면 상대가 여왕벌로 딱 한 칸 막을 수 있어 절대적 확정은 아니다 — 표시 측에서 안내.)
 * 순수 함수, DOM 무관. UI 의 위험 카운트다운 표시·AI 평가 양쪽에서 재사용 가능.
 */
export function hiveCountdowns(board: Board): HiveCountdown[] {
  const byOwner = new Map<Player, HiveCountdown>()
  for (const hive of detectHives(board)) {
    const owner = hive.owner
    for (let i = 0; i + LINE_LENGTH <= hive.cells.length; i++) {
      const window = hive.cells.slice(i, i + LINE_LENGTH)
      let mine = 0
      let blocked = false
      for (const key of window) {
        const piece = board[key]!.piece
        if (piece === undefined) continue
        if (piece.owner === owner) mine++
        else {
          blocked = true // 상대 말이 끼어 그 줄은 5목 불가
          break
        }
      }
      if (blocked || mine < 1) continue
      const movesLeft = LINE_LENGTH - mine
      const prev = byOwner.get(owner)
      if (prev === undefined || movesLeft < prev.movesLeft) {
        byOwner.set(owner, { owner, movesLeft, cells: window })
      }
    }
  }
  return Array.from(byOwner.values())
}

/** "곧 잠길 벌집 줄" 위협(예방 코칭용). attacker 가 5목 타일 벌집을 거의 완성해 잠그면(§5) 그 안을
 *  자기 말로 채워 막을 수 없는 5목을 만든다(잠긴 벌집 정석). hiveCountdowns 는 *이미 잠긴* 줄만 보지만,
 *  이건 *잠기기 전*(아직 끊을 수 있을 때)을 잡아 방어 측에 "여기 막아라"를 안내한다. */
export interface CorridorThreat {
  /** 줄을 만드는 쪽(곧 잠글 쪽). */
  readonly attacker: Player
  /** 잠기면 5목이 될 5칸 창(hexKey, 축 정렬). 화면에서 위험한 줄 강조. */
  readonly lockCells: readonly string[]
  /** 방어 측이 말을 놓아 그 줄을 끊을 수 있는 칸(빈 칸=타일+말, attacker 타일 위=말만). */
  readonly cutCells: readonly string[]
  /** attacker 가 잠그기까지 더 깔아야 할 타일 수(1=다음 한 수, 2=twoTiles 한 수). */
  readonly tilesToLock: number
}

/**
 * attacker 의 "곧 잠길 벌집 줄"을 찾는다(방어 코칭용, 순수 함수). 조건(보수적 — 오발 최소화):
 *  - attacker 타일이 한 축으로 3~4칸 연속(5칸이면 이미 잠김 → hiveCountdowns 영역, 제외),
 *  - 그 줄을 품는 5칸 창에 방어 측 타일·말이 0(아직 끊기지 않았고, 전부 attacker 벌집이 될 수 있음),
 *  - 창의 빈 칸이 attacker 한 수로 메워질 만큼 적음(tilesToLock ≤ 2: 1타일 또는 twoTiles),
 *  - 끊을 수 있는 칸(cutCells: 빈 칸 또는 attacker 타일 위, 잠긴 칸 제외)이 ≥1.
 * 반환: 그런 창들. "창 안 attacker 말 ≥1"(채울 의도) 필터는 오발을 못 줄이면서 게임2 류(타일 먼저
 * 깔고 나중에 채움)의 예방 창을 놓쳐 쓰지 않는다(측정: minPieces 0/1/2 모두 오발 10% 동일, 0만 게임2
 * 7·9수 예방 창 포착 — session_logs/2026-06-30 코칭 폴백).
 */
export function corridorLockThreats(board: Board, attacker: Player): CorridorThreat[] {
  const defender: Player = attacker === 'yellow' ? 'brown' : 'yellow'
  const locked = lockedTiles(board) // 잠긴 칸엔 주인만 말을 놓을 수 있어(§5) 방어가 못 끊는다.
  const tiles = new Map<string, Player>()
  for (const key of Object.keys(board)) {
    if (board[key]!.tile.owner === attacker) tiles.set(key, attacker)
  }
  // 빈 칸에 타일을 놓을 수 있나(가벼운 검사: 타일 이웃이 있으면 OK — threatLines 와 동일 기준).
  const tilePlaceable = (c: Hex): boolean => hexNeighbors(c).some((n) => cellAt(board, n) !== undefined)
  const out: CorridorThreat[] = []
  const seen = new Set<string>()
  for (const run of findLines(tiles, 3)) {
    if (run.cells.length >= LINE_LENGTH) continue // 이미 잠김
    const dir = HEX_AXES[run.axis]!
    const need = LINE_LENGTH - run.cells.length // 1 또는 2
    // 줄 전체를 품는 5칸 창들: 줄 앞쪽으로 s칸(0..need) 확장.
    for (let s = 0; s <= need; s++) {
      let c = hexFromKey(run.cells[0]!)
      for (let i = 0; i < s; i++) c = hexSubtract(c, dir)
      const windowCells: string[] = []
      for (let i = 0; i < LINE_LENGTH; i++) {
        windowCells.push(hexKey(c))
        c = hexAdd(c, dir)
      }
      let ok = true
      const cut: string[] = []
      for (const k of windowCells) {
        const hexC = hexFromKey(k)
        const cell = cellAt(board, hexC)
        const piece = pieceAt(board, hexC)
        if (piece && piece.owner === defender) { ok = false; break } // 이미 끊김
        if (cell && cell.tile.owner === defender) { ok = false; break } // 방어 타일이 막음
        if (locked.has(k)) continue // 잠긴 칸은 방어가 못 둠 → cut 후보 아님(끊을 수 없음)
        if (cell && cell.tile.owner === attacker) {
          if (!piece) cut.push(k) // attacker 타일 + 말 없음 → 방어가 말만 놓아 끊기
        } else if (!cell && tilePlaceable(hexC)) {
          cut.push(k) // 빈 칸(확장 자리) → 방어가 타일+말로 끊기
        }
      }
      if (!ok || cut.length === 0) continue
      const wkey = windowCells.join('|')
      if (seen.has(wkey)) continue
      seen.add(wkey)
      out.push({ attacker, lockCells: windowCells, cutCells: cut, tilesToLock: need })
    }
  }
  return out
}
