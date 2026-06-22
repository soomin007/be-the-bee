// 컬러 테마, 진영 타일(밀랍 셀)·말(벌)·벌집 강조 색. UI 전용(엔진과 무관).
// 노랑/갈색 진영의 정체성(hue)은 유지하되 명도·채도·테두리로 대비를 조절해
// 가시성을 높인다. 라벨('노랑'/'갈색')과 어긋나지 않게 hue 범위를 지킨다.
import type { Player } from '../engine/index'

export interface TileColors {
  light: string // 그라데이션 하이라이트(돔 위쪽)
  mid: string // 본색(프론티어/잠정 타일 단색에도 사용)
  dark: string // 그라데이션 그늘(아래쪽)
  stroke: string // 셀 테두리(진영별 차별 → 구분 ↑)
}
export interface PieceColors {
  body: string
  stripe: string
}
export interface ColorTheme {
  id: string
  label: string
  desc: string // 설정 요약/툴팁용 한 줄
  tile: Record<Player, TileColors>
  piece: Record<Player, PieceColors>
  hiveFill: string // 벌집(5목 타일) 강조 채움
  hiveGlow: string // 벌집 글로우/테두리, 타일과 대비되게 주황빛
}

// 기본 테마는 'honey', 노랑은 더 또렷하게(배경과 분리), 갈색은 더 깊게(명도 대비),
// 테두리는 진영별로 달리해 구분을 높였다. 'contrast' 는 명도차 극대화(색약/저시력).
export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'honey',
    label: '꿀',
    desc: '따뜻한 벌집, 기본',
    tile: {
      yellow: { light: '#fcdf6e', mid: '#f0c531', dark: '#d3a013', stroke: '#6e5114' },
      brown: { light: '#c4843a', mid: '#97581d', dark: '#744213', stroke: '#43280a' },
    },
    piece: {
      yellow: { body: '#e0a106', stripe: '#3a2600' },
      brown: { body: '#8a5418', stripe: '#241200' },
    },
    hiveFill: '#ffe07a',
    hiveGlow: '#f97316',
  },
  {
    id: 'contrast',
    label: '고대비',
    desc: '명도차 큼, 색약·저시력 친화',
    tile: {
      yellow: { light: '#ffe87a', mid: '#ffce00', dark: '#e6b400', stroke: '#5c4000' },
      brown: { light: '#6a4824', mid: '#412a12', dark: '#2a1a0a', stroke: '#140c04' },
    },
    piece: {
      yellow: { body: '#a67400', stripe: '#241800' },
      brown: { body: '#dba85c', stripe: '#2a1808' },
    },
    hiveFill: '#fff3b0',
    hiveGlow: '#ea580c',
  },
  {
    id: 'terracotta',
    label: '벽돌',
    desc: '황금 vs 적갈, 색조 대비',
    tile: {
      yellow: { light: '#f7d96a', mid: '#ecbb2e', dark: '#cf9415', stroke: '#6b4f14' },
      brown: { light: '#c8693a', mid: '#a23c1e', dark: '#7c2b13', stroke: '#491809' },
    },
    piece: {
      yellow: { body: '#d99405', stripe: '#3a2600' },
      brown: { body: '#b54a28', stripe: '#2a0f06' },
    },
    hiveFill: '#ffd98a',
    hiveGlow: '#e2570c',
  },
]
export const DEFAULT_THEME_ID = 'honey'

export function themeById(id: string): ColorTheme {
  return COLOR_THEMES.find((t) => t.id === id) ?? COLOR_THEMES[0]!
}
