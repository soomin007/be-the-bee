// 큐브 좌표계 (q + r + s = 0). Red Blob Games 헥스 가이드 관례를 따른다.
//
// 보드는 희소(sparse)하므로 좌표 자체는 여기서 다루고, 보드 저장은 state.ts 에서
// 좌표 문자열 키(`hexKey`)로 한다. 이 파일은 순수 수학이며 DOM/렌더링과 무관하다.

export interface Hex {
  readonly q: number
  readonly r: number
  readonly s: number
}

/** q, r 로부터 Hex 생성. s 는 q + r + s = 0 불변식으로 유도한다. */
export function hex(q: number, r: number): Hex {
  return { q, r, s: -q - r }
}

/** 보드 Map/Record 의 키. s 는 q,r 에서 유도되므로 q,r 만으로 충분하다. */
export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`
}

/** `hexKey` 의 역변환. "q,r" 문자열을 Hex 로 되돌린다. */
export function hexFromKey(key: string): Hex {
  const comma = key.indexOf(',')
  const q = Number(key.slice(0, comma))
  const r = Number(key.slice(comma + 1))
  return hex(q, r)
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s
}

export function hexAdd(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s }
}

export function hexSubtract(a: Hex, b: Hex): Hex {
  return { q: a.q - b.q, r: a.r - b.r, s: a.s - b.s }
}

/** 두 칸 사이의 헥스 거리. */
export function hexDistance(a: Hex, b: Hex): number {
  const d = hexSubtract(a, b)
  return (Math.abs(d.q) + Math.abs(d.r) + Math.abs(d.s)) / 2
}

/**
 * 6방향 이웃 단위 벡터. 인접(한 변 맞닿음) 판정·이웃 순회에 쓴다.
 * 마주보는 방향끼리 쌍을 이룬다: 0↔3, 1↔4, 2↔5.
 */
export const HEX_DIRECTIONS: readonly Hex[] = [
  hex(1, 0),
  hex(1, -1),
  hex(0, -1),
  hex(-1, 0),
  hex(-1, 1),
  hex(0, 1),
]

/**
 * 직선 스캔용 3개 축 벡터. 6방향에서 마주보는 쌍 하나씩만 고른 것.
 * (한 축을 따라 정·역방향을 모두 보면 전체 직선을 덮는다.)
 */
export const HEX_AXES: readonly Hex[] = [
  hex(1, 0), // q 축
  hex(1, -1), // r 축
  hex(0, -1), // s 축
]

/** 특정 방향(0..5)의 이웃 한 칸. */
export function hexNeighbor(h: Hex, direction: number): Hex {
  const d = HEX_DIRECTIONS[direction]
  if (d === undefined) throw new RangeError(`방향 인덱스 범위 밖: ${direction}`)
  return hexAdd(h, d)
}

/** 6방향 이웃 전부. */
export function hexNeighbors(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => hexAdd(h, d))
}
