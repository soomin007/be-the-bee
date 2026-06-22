// 게임 저장/불러오기 — localStorage 기보 보관. ui 계층(엔진과 무관).
//
// 두 슬롯:
//   - autosave: 매 수마다 갱신 → 새로고침/재방문 시 "이어하기"로 자동 복원.
//   - save: 사용자가 "저장" 버튼으로 남긴 한 판(북마크). "불러오기"로 되돌린다.
// GameState/Move 는 모두 JSON 직렬화 가능(types.ts 보장)하므로 그대로 직렬화한다.

import type { GameState, Move } from '../engine/index'

export interface GameSnapshot {
  v: 1
  state: GameState
  history: GameState[]
  moveLog: Move[]
  mode: string // 저장 당시 플레이 모드(표시용)
  savedAt: number // epoch ms (표시용)
}

const AUTOSAVE_KEY = 'be-the-bee/autosave'
const SLOT_KEY = 'be-the-bee/save'

// 손상/구버전 데이터에 안전: 최소 형태만 확인하고, 어긋나면 null.
function read(key: string): GameSnapshot | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<GameSnapshot>
    if (
      s.v !== 1 ||
      typeof s.state !== 'object' ||
      s.state === null ||
      typeof (s.state as GameState).board !== 'object' ||
      !Array.isArray(s.history) ||
      !Array.isArray(s.moveLog)
    ) {
      return null
    }
    return s as GameSnapshot
  } catch {
    return null
  }
}

function write(key: string, snap: GameSnapshot): void {
  try {
    localStorage.setItem(key, JSON.stringify(snap))
  } catch {
    /* 용량 초과/사생활 모드 — 무시 */
  }
}

export function autoSave(snap: GameSnapshot): void {
  write(AUTOSAVE_KEY, snap)
}
export function loadAutoSave(): GameSnapshot | null {
  return read(AUTOSAVE_KEY)
}
export function clearAutoSave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    /* 무시 */
  }
}

export function saveSlot(snap: GameSnapshot): void {
  write(SLOT_KEY, snap)
}
export function loadSlot(): GameSnapshot | null {
  return read(SLOT_KEY)
}
export function hasSlot(): boolean {
  return loadSlot() !== null
}
