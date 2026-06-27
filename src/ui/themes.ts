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
  players: Record<Player, string> // 진영 이름(테마 색에 맞게 — 차례/승패/안내 문구에 쓰임)
  tile: Record<Player, TileColors>
  piece: Record<Player, PieceColors>
  // 벌집(5목 타일) 강조: 진영별로 채움·테두리를 달리해 노랑 벌집과 갈색 벌집이 섞이지 않게 한다.
  // 노랑 벌집은 밝은 꿀빛, 갈색 벌집은 어둡고 붉은 호박빛(밝아져서 노랑처럼 보이던 문제 해결).
  hiveFill: Record<Player, string> // 벌집 채움(진영별)
  hiveStroke: Record<Player, string> // 벌집 테두리(진영별, 채움보다 진하게)
  hiveGlow: string // 벌집 글로우(빛 번짐) 색 — 필터 공통, 따뜻한 주황빛
}

// 기본 테마는 'honey', 노랑은 더 또렷하게(배경과 분리), 갈색은 더 깊게(명도 대비),
// 테두리는 진영별로 달리해 구분을 높였다. 'contrast' 는 명도차 극대화(색약/저시력).
export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'honey',
    label: '꿀',
    desc: '따뜻한 벌집, 기본',
    players: { yellow: '노랑', brown: '갈색' },
    tile: {
      yellow: { light: '#ffe63a', mid: '#ffd400', dark: '#f0b400', stroke: '#7a5a10' }, // 더 밝고 쨍한 금빛
      brown: { light: '#c4843a', mid: '#97581d', dark: '#744213', stroke: '#43280a' },
    },
    piece: {
      yellow: { body: '#ffd000', stripe: '#3a2600' }, // 쨍한 골드(갈색과 확실히 구분)
      brown: { body: '#8a5418', stripe: '#241200' },
    },
    hiveFill: { yellow: '#ffe55c', brown: '#c47d28' },
    hiveStroke: { yellow: '#c27a10', brown: '#2e1808' }, // 갈색 테두리는 아주 어둡게(갈색 셀과 구분↑)
    hiveGlow: '#f97316',
  },
  {
    id: 'contrast',
    label: '고대비',
    desc: '명도차 큼, 색약·저시력 친화',
    players: { yellow: '노랑', brown: '갈색' },
    tile: {
      yellow: { light: '#ffe87a', mid: '#ffce00', dark: '#e6b400', stroke: '#5c4000' },
      brown: { light: '#6a4824', mid: '#412a12', dark: '#2a1a0a', stroke: '#140c04' },
    },
    piece: {
      yellow: { body: '#ffcc00', stripe: '#241800' }, // 노랑 말은 밝은 노랑으로(어두워 보이던 문제 해결)
      brown: { body: '#dba85c', stripe: '#2a1808' },
    },
    hiveFill: { yellow: '#fff3b0', brown: '#9c6228' },
    hiveStroke: { yellow: '#b58200', brown: '#1f0f04' },
    hiveGlow: '#ea580c',
  },
  {
    id: 'terracotta',
    label: '벽돌',
    desc: '황금 vs 적갈, 색조 대비',
    players: { yellow: '노랑', brown: '갈색' },
    tile: {
      yellow: { light: '#f7d96a', mid: '#ecbb2e', dark: '#cf9415', stroke: '#6b4f14' },
      brown: { light: '#c8693a', mid: '#a23c1e', dark: '#7c2b13', stroke: '#491809' },
    },
    piece: {
      yellow: { body: '#d99405', stripe: '#3a2600' },
      brown: { body: '#b54a28', stripe: '#2a0f06' },
    },
    hiveFill: { yellow: '#ffd98a', brown: '#c2532a' },
    hiveStroke: { yellow: '#c2840f', brown: '#3f1407' },
    hiveGlow: '#e2570c',
  },
  {
    // 보색 대비: 노랑 ↔ 남색. 두 색의 색상·명도 차가 커서 색약·저시력에도 가장 구분이 쉽다.
    // 진영 이름도 색에 맞춰 '노랑'/'남색'으로 바꾼다(players).
    id: 'cobalt',
    label: '노랑·남색',
    desc: '보색 대비, 색 구분 가장 쉬움',
    players: { yellow: '노랑', brown: '남색' },
    tile: {
      yellow: { light: '#ffe63a', mid: '#ffd400', dark: '#f0b400', stroke: '#7a5a10' },
      brown: { light: '#4664c9', mid: '#1e40af', dark: '#142a7a', stroke: '#0a1640' },
    },
    piece: {
      yellow: { body: '#ffd000', stripe: '#3a2600' },
      brown: { body: '#2a4fc0', stripe: '#0a1430' },
    },
    hiveFill: { yellow: '#ffe55c', brown: '#5276d8' },
    hiveStroke: { yellow: '#c27a10', brown: '#0c1c4a' }, // 남색 셀과 구분되게 더 짙은 남색
    hiveGlow: '#facc15',
  },
]
export const DEFAULT_THEME_ID = 'honey'

export function themeById(id: string): ColorTheme {
  return COLOR_THEMES.find((t) => t.id === id) ?? COLOR_THEMES[0]!
}
