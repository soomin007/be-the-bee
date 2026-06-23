// 게임 저장/불러오기 + 기보 공유. localStorage 보관. ui 계층(엔진과 무관).
//
//  - autosave: 매 수마다 갱신 → 새로고침/재방문 시 "이어하기"로 자동 복원.
//  - slots: 사용자가 "저장"으로 남긴 여러 판(보관함). 이름·시간과 함께 목록/삭제.
//  - 공유: 스냅샷을 짧은 코드(BTB1:...)로 내보내기/가져오기 → 다른 사람·AI 와 기보 공유·분석.
// 공유 코드는 "수 목록(moveLog)만" 담는다 — 전체 history 를 빼므로 수백 자로 작아져
// 채팅/메신저에 붙여넣기 쉽다. 가져올 때 처음부터 재생(applyMove)해 상태를 복원한다.
// GameState/Move 는 모두 JSON 직렬화 가능(types.ts 보장).

import { applyMove, createInitialState, hex } from '../engine/index'
import type { GameState, Move, PieceKind } from '../engine/index'

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

// 수 하나를 짧은 토큰으로. 좌표는 q,r 만 적는다(s = -q-r 는 hex() 가 계산).
//   ② 타일1+말:  t tq tr aq ar [Q]      (Q = 여왕벌)
//   ① 타일2:     2 q1 r1 q2 r2
//   말만:        p aq ar [Q]
function encMove(m: Move): string {
  if (m.type === 'twoTiles') return `2 ${m.first.q} ${m.first.r} ${m.second.q} ${m.second.r}`
  const q = m.piece.kind === 'queen' ? ' Q' : ''
  if (m.type === 'tileAndPiece') return `t ${m.tile.q} ${m.tile.r} ${m.piece.at.q} ${m.piece.at.r}${q}`
  return `p ${m.piece.at.q} ${m.piece.at.r}${q}`
}
function decMove(tok: string): Move | null {
  const p = tok.trim().split(/\s+/)
  const n = (i: number): number => Number(p[i])
  const k = (i: number): PieceKind => (p[i] === 'Q' ? 'queen' : 'normal')
  if (p[0] === '2' && p.length >= 5) return { type: 'twoTiles', first: hex(n(1), n(2)), second: hex(n(3), n(4)) }
  if (p[0] === 't' && p.length >= 5) return { type: 'tileAndPiece', tile: hex(n(1), n(2)), piece: { at: hex(n(3), n(4)), kind: k(5) } }
  if (p[0] === 'p' && p.length >= 3) return { type: 'pieceOnly', piece: { at: hex(n(1), n(2)), kind: k(3) } }
  return null
}

interface CompactCode {
  v: 1
  mv: string // 세미콜론으로 이은 수 토큰들
  inf?: 0 | 1 // 무한 모드 여부
  mode?: string
  at?: number // savedAt
}

/** 스냅샷을 공유용 코드 문자열로(BTB1:base64). 수 목록만 담아 짧다. 클립보드 복사·전달용. */
export function encodeSnapshot(snap: GameSnapshot): string {
  const payload: CompactCode = {
    v: 1,
    mv: snap.moveLog.map(encMove).join(';'),
    inf: snap.state.infiniteTiles === true ? 1 : 0,
    mode: snap.mode,
    at: snap.savedAt,
  }
  return SHARE_PREFIX + toB64(JSON.stringify(payload))
}

// 수 목록을 처음부터 재생해 전체 스냅샷(state/history/moveLog)을 복원.
function replay(moves: Move[], infinite: boolean, mode: string, savedAt: number): GameSnapshot | null {
  try {
    let state = createInitialState({ infiniteTiles: infinite })
    const history: GameState[] = []
    const moveLog: Move[] = []
    for (const m of moves) {
      history.push(state)
      state = applyMove(state, m)
      moveLog.push(m)
    }
    return { v: 1, state, history, moveLog, mode, savedAt }
  } catch {
    return null // 코드가 손상돼 불법 수가 섞이면 재생 중단
  }
}

/** 공유 코드를 스냅샷으로. compact(신) / 전체 스냅샷(구) / 원시 JSON 모두 허용. 어긋나면 null. */
export function decodeSnapshot(text: string): GameSnapshot | null {
  const t = text.trim()
  if (!t) return null
  // 공유 메시지에 인사말 등 다른 문구가 섞여 와도 BTB1: 코드만 뽑아낸다.
  // (base64 본문에는 공백이 없으므로 접두사 뒤 첫 공백/개행에서 끊는다.)
  const at = t.indexOf(SHARE_PREFIX)
  const body = at >= 0 ? (t.slice(at + SHARE_PREFIX.length).split(/\s/)[0] ?? '') : t
  let obj: unknown
  try {
    obj = JSON.parse(fromB64(body)) // base64 우선
  } catch {
    try {
      obj = JSON.parse(body) // 실패하면 원시 JSON
    } catch {
      return null
    }
  }
  // 신버전: 수 목록만 담긴 compact 코드 → 재생으로 복원
  const c = obj as Partial<CompactCode>
  if (c && typeof c.mv === 'string') {
    const moves = c.mv.length ? c.mv.split(';').map(decMove) : []
    if (moves.some((m) => m === null)) return null
    return replay(moves as Move[], c.inf === 1, typeof c.mode === 'string' ? c.mode : 'vsAi', Number(c.at) || 0)
  }
  // 구버전: 전체 스냅샷이 통째로 들어온 코드
  return validSnap(obj)
}
