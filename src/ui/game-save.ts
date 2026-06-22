// 게임 저장/불러오기 + 기보 공유. localStorage 보관. ui 계층(엔진과 무관).
//
//  - autosave: 매 수마다 갱신 → 새로고침/재방문 시 "이어하기"로 자동 복원.
//  - slots: 사용자가 "저장"으로 남긴 여러 판(보관함). 이름·시간과 함께 목록/삭제.
//  - 공유: 스냅샷을 base64 코드(BTB1:...)로 내보내기/가져오기 → 다른 사람·AI 와 기보 공유·분석.
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

export interface GameSlot {
  id: string
  name: string
  savedAt: number
  snap: GameSnapshot
}

const AUTOSAVE_KEY = 'be-the-bee/autosave'
const SLOTS_KEY = 'be-the-bee/slots'
const LEGACY_SLOT_KEY = 'be-the-bee/save' // 예전 단일 슬롯 — 한 번 마이그레이션
const MAX_SLOTS = 12
const SHARE_PREFIX = 'BTB1:'

// 손상/구버전 데이터에 안전: 최소 형태만 확인하고, 어긋나면 null.
function validSnap(s: unknown): GameSnapshot | null {
  const o = s as Partial<GameSnapshot> | null
  if (
    !o ||
    o.v !== 1 ||
    typeof o.state !== 'object' ||
    o.state === null ||
    typeof (o.state as GameState).board !== 'object' ||
    !Array.isArray(o.history) ||
    !Array.isArray(o.moveLog)
  ) {
    return null
  }
  return o as GameSnapshot
}

function readSnap(key: string): GameSnapshot | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? validSnap(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 용량 초과/사생활 모드 — 무시 */
  }
}

// ---- 자동 저장(이어하기) ----------------------------------------------------
export function autoSave(snap: GameSnapshot): void {
  write(AUTOSAVE_KEY, snap)
}
export function loadAutoSave(): GameSnapshot | null {
  return readSnap(AUTOSAVE_KEY)
}
export function clearAutoSave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    /* 무시 */
  }
}

// ---- 저장 슬롯 보관함 -------------------------------------------------------
export function listSlots(): GameSlot[] {
  let slots: GameSlot[] = []
  try {
    const raw = localStorage.getItem(SLOTS_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as unknown[]
      if (Array.isArray(arr)) {
        slots = arr
          .map((x) => {
            const g = x as Partial<GameSlot>
            const snap = validSnap(g.snap)
            if (!snap || typeof g.id !== 'string') return null
            return { id: g.id, name: String(g.name ?? '저장'), savedAt: Number(g.savedAt ?? 0), snap }
          })
          .filter((x): x is GameSlot => x !== null)
      }
    }
  } catch {
    slots = []
  }
  // 예전 단일 슬롯이 있으면 한 번 보관함으로 옮긴다.
  const legacy = readSnap(LEGACY_SLOT_KEY)
  if (legacy) {
    slots.unshift({ id: `legacy-${legacy.savedAt}`, name: '이전 저장', savedAt: legacy.savedAt, snap: legacy })
    try {
      localStorage.removeItem(LEGACY_SLOT_KEY)
    } catch {
      /* 무시 */
    }
    write(SLOTS_KEY, slots)
  }
  return slots
}

export function addSlot(name: string, snap: GameSnapshot): GameSlot[] {
  const slot: GameSlot = { id: `${snap.savedAt}-${Math.floor(snap.savedAt % 100000)}`, name, savedAt: snap.savedAt, snap }
  const next = [slot, ...listSlots().filter((s) => s.id !== slot.id)].slice(0, MAX_SLOTS)
  write(SLOTS_KEY, next)
  return next
}

export function deleteSlot(id: string): GameSlot[] {
  const next = listSlots().filter((s) => s.id !== id)
  write(SLOTS_KEY, next)
  return next
}

export function getSlot(id: string): GameSlot | undefined {
  return listSlots().find((s) => s.id === id)
}

// ---- 공유: 스냅샷 ↔ 코드 ---------------------------------------------------
function toB64(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}
function fromB64(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** 스냅샷을 공유용 코드 문자열로(BTB1:base64). 클립보드 복사·전달용. */
export function encodeSnapshot(snap: GameSnapshot): string {
  return SHARE_PREFIX + toB64(JSON.stringify(snap))
}

/** 공유 코드(또는 원시 JSON)를 스냅샷으로. 형식이 어긋나면 null. */
export function decodeSnapshot(text: string): GameSnapshot | null {
  const t = text.trim()
  if (!t) return null
  try {
    const body = t.startsWith(SHARE_PREFIX) ? t.slice(SHARE_PREFIX.length) : t
    // base64 우선, 실패하면 원시 JSON 으로 시도.
    try {
      return validSnap(JSON.parse(fromB64(body)))
    } catch {
      return validSnap(JSON.parse(body))
    }
  } catch {
    return null
  }
}
