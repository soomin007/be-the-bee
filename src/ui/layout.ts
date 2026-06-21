// 헥스 좌표 → 화면 픽셀 변환(pointy-top). 렌더링 전용이라 ui 계층에 둔다.
// 클릭 판정은 각 SVG 헥스 요소에 좌표를 실어 처리하므로 역변환(pixel→hex)은 필요 없다.

import type { Hex } from '../engine/hex'

/** 헥스 외접원 반지름(px). */
export const HEX_SIZE = 30

export interface Point {
  readonly x: number
  readonly y: number
}

/** pointy-top 레이아웃에서 헥스 중심의 픽셀 좌표(Red Blob Games). */
export function hexToPixel(h: Hex, size = HEX_SIZE): Point {
  const x = size * (Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r)
  const y = size * (1.5 * h.r)
  return { x, y }
}

/** pointy-top 헥스의 6개 꼭짓점을 SVG polygon points 문자열로. */
export function hexPolygonPoints(center: Point, size = HEX_SIZE): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30) // pointy-top: -30° 오프셋
    const x = center.x + size * Math.cos(angle)
    const y = center.y + size * Math.sin(angle)
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return pts.join(' ')
}
