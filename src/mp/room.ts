// 온라인 대전 "방" 로직 — Supabase rooms 테이블을 다루는 얇은 층.
// 게임 상태는 BTB1 스냅샷 "문자열"로만 주고받는다(이 모듈은 스냅샷 내용을 해석하지 않음).
// 엔진/규칙은 호출 측(game-ui)이 로컬과 동일하게 처리하고, 여기는 전달만 담당한다.
//
// 방 = rooms 의 한 행. 흐름: 방장 createRoom → 초대 코드 공유 → 상대 joinRoom →
// 각자 자기 차례에 pushState(새 스냅샷) → 상대는 subscribeRoom 으로 받아 적용.
import { supabase } from './supabase'

export type Side = 'yellow' | 'brown'
// waiting(방장 혼자) → negotiating(매칭, 선공/후공 합의 중) → playing(대국) → finished/left.
export type RoomStatus = 'waiting' | 'negotiating' | 'playing' | 'finished' | 'left'

export interface Room {
  id: string
  snapshot: string
  status: RoomStatus
  host_id: string
  guest_id: string | null
  host_side: Side
  updated_at: string
}

// 이 브라우저의 익명 id(방장/상대 구분용). localStorage 에 한 번 만들어 재사용.
const CID_KEY = 'be-the-bee/client-id'
export function clientId(): string {
  let id = localStorage.getItem(CID_KEY)
  if (!id) {
    id = randomHex(16)
    localStorage.setItem(CID_KEY, id)
  }
  return id
}

function randomHex(n: number): string {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

// 헷갈리는 글자(0/O, 1/I) 제외한 6자리 방 코드.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function roomCode(): string {
  const a = new Uint8Array(6)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export function opposite(side: Side): Side {
  return side === 'yellow' ? 'brown' : 'yellow'
}

/** 내가 이 방에서 잡은 진영(방장이면 host_side, 아니면 그 반대). */
export function mySide(room: Room): Side {
  return room.host_id === clientId() ? room.host_side : opposite(room.host_side)
}

/** 방장이 방을 만든다. 초기 스냅샷과 잡을 진영을 넣는다. */
export async function createRoom(snapshot: string, hostSide: Side): Promise<Room> {
  if (!supabase) throw new Error('온라인 기능이 설정되지 않았어요(Supabase 키 없음).')
  const row = {
    id: roomCode(),
    snapshot,
    status: 'waiting' as RoomStatus,
    host_id: clientId(),
    guest_id: null,
    host_side: hostSide,
  }
  const { data, error } = await supabase.from('rooms').insert(row).select().single()
  if (error) throw error
  return data as Room
}

export async function getRoom(id: string): Promise<Room | null> {
  if (!supabase) return null
  const { data } = await supabase.from('rooms').select('*').eq('id', id).maybeSingle()
  return (data as Room | null) ?? null
}

/** 초대 코드로 입장. 신규면 상대 슬롯 차지+협상 단계로, 이미 참가자면 재접속이라 그대로 반환. */
export async function joinRoom(id: string): Promise<Room | null> {
  if (!supabase) return null
  const me = clientId()
  const room = await getRoom(id)
  if (!room) return null
  // 이미 참가자(방장/상대)면 재접속 — 상태를 안 건드리고 현재 방을 그대로 반환(진행 중이면 재개됨).
  if (room.host_id === me || room.guest_id === me) return room
  // 다른 사람이 이미 상대 슬롯을 차지 → 만석(관전 미지원).
  if (room.guest_id) return room
  const { data, error } = await supabase
    .from('rooms')
    .update({ guest_id: me, status: 'negotiating', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Room
}

/** 방에서 나갈 때: status 만 'left' 로 바꿔 상대에게 알린다(스냅샷은 안 건드림 → 상대 화면 안 바뀜). */
export async function leaveRoom(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('rooms').update({ status: 'left', updated_at: new Date().toISOString() }).eq('id', id)
}

/** 내 수를 둔 뒤 새 스냅샷을 방에 반영(상대가 구독으로 받음). */
export async function pushState(id: string, snapshot: string, status: RoomStatus): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('rooms')
    .update({ snapshot, status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** 선공/후공 합의 완료: host_side 확정 + status=playing(재접속 시 협상 건너뛰고 바로 재개). */
export async function agreeStart(id: string, hostSide: Side): Promise<void> {
  if (!supabase) return
  await supabase
    .from('rooms')
    .update({ host_side: hostSide, status: 'playing', updated_at: new Date().toISOString() })
    .eq('id', id)
}

/** 방 삭제(정리용). delete 정책이 있어야 동작(multiplayer_schema.sql). */
export async function deleteRoom(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('rooms').delete().eq('id', id)
}

/** 오래된 방 정리: updated_at 이 cutoffIso 이전인 방 삭제(방 생성 시 호출해 테이블을 가볍게). */
export async function cleanupOldRooms(cutoffIso: string): Promise<void> {
  if (!supabase) return
  await supabase.from('rooms').delete().lt('updated_at', cutoffIso)
}

export interface RoomConn {
  close: () => void
  /** 상대에게 즉석 신호를 보낸다(선공/후공 협상 등 게임 상태가 아닌 일시적 메시지). */
  signal: (event: string, payload?: Record<string, unknown>) => void
}

/**
 * 방에 연결: ① 행 변경(UPDATE) 구독으로 스냅샷 동기화, ② broadcast 로 즉석 신호(협상) 송수신,
 * ③ presence 로 상대 접속/끊김 감지(탭 닫힘·네트워크 끊김을 자동 감지 — beforeunload 불필요).
 */
export function connectRoom(
  id: string,
  onRow: (room: Room) => void,
  onSignal: (event: string, payload: Record<string, unknown>) => void,
  onPeer?: (present: boolean) => void, // 상대가 접속 중인지(presence 변화 시 호출)
): RoomConn {
  const sb = supabase
  if (!sb) return { close: () => {}, signal: () => {} }
  const me = clientId()
  const peerPresent = (): boolean => {
    const state = ch.presenceState() as Record<string, Array<{ id?: string }>>
    return Object.values(state)
      .flat()
      .some((p) => p.id !== undefined && p.id !== me)
  }
  const ch = sb
    .channel(`room:${id}`, { config: { broadcast: { self: false }, presence: { key: me } } })
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${id}` },
      (payload) => onRow(payload.new as Room),
    )
    .on('broadcast', { event: 'sig' }, (payload) => {
      const p = (payload.payload ?? {}) as Record<string, unknown>
      onSignal(String(p.event ?? ''), p)
    })
    .on('presence', { event: 'sync' }, () => onPeer?.(peerPresent()))
    .on('presence', { event: 'join' }, () => onPeer?.(peerPresent()))
    .on('presence', { event: 'leave' }, () => onPeer?.(peerPresent()))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ id: me })
    })
  return {
    close: () => {
      void sb.removeChannel(ch)
    },
    signal: (event, payload = {}) => {
      void ch.send({ type: 'broadcast', event: 'sig', payload: { event, ...payload } })
    },
  }
}
