// 온라인 대전 "방" 로직 — Supabase rooms 테이블을 다루는 얇은 층.
// 게임 상태는 BTB1 스냅샷 "문자열"로만 주고받는다(이 모듈은 스냅샷 내용을 해석하지 않음).
// 엔진/규칙은 호출 측(game-ui)이 로컬과 동일하게 처리하고, 여기는 전달만 담당한다.
//
// 방 = rooms 의 한 행. 흐름: 방장 createRoom → 초대 코드 공유 → 상대 joinRoom →
// 각자 자기 차례에 pushState(새 스냅샷) → 상대는 subscribeRoom 으로 받아 적용.
import { supabase } from './supabase'

export type Side = 'yellow' | 'brown'
export type RoomStatus = 'waiting' | 'playing' | 'finished'

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

/** 초대 코드로 입장 — 빈 상대 슬롯을 차지하고 status 를 playing 으로. */
export async function joinRoom(id: string): Promise<Room | null> {
  if (!supabase) return null
  const me = clientId()
  const room = await getRoom(id)
  if (!room) return null
  if (room.host_id === me) return room // 내가 방장이면 그대로(재접속)
  if (room.guest_id && room.guest_id !== me) return room // 이미 다른 사람이 들어옴 — 그대로 반환(관전 처리는 추후)
  const { data, error } = await supabase
    .from('rooms')
    .update({ guest_id: me, status: 'playing', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Room
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

/** 방 행의 변경(UPDATE)을 실시간 구독. 반환값을 호출하면 구독 해제. */
export function subscribeRoom(id: string, cb: (room: Room) => void): () => void {
  const sb = supabase
  if (!sb) return () => {}
  const ch = sb
    .channel(`room:${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${id}` },
      (payload) => cb(payload.new as Room),
    )
    .subscribe()
  return () => {
    void sb.removeChannel(ch)
  }
}
