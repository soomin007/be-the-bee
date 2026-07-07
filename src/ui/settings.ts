// 방(매치) 설정 — 타입·기본값·라벨·localStorage 저장/불러오기.
// game-ui.ts 에서 분리(2026-07-07, 모놀리스 점진 분해 1단계). 클로저 의존이 없는 모듈 레벨
// 상수/함수만 모았다. 멀티플레이에서는 방장이 정해 양쪽에 공통 적용되는 "방 설정"이 되도록
// 직렬화 가능한 한 객체(RoomSettings)로 유지한다.

import type { Difficulty, Persona, Player } from '../engine/index'
import { BGM_TRACKS } from './sound'
import { COLOR_THEMES, DEFAULT_THEME_ID } from './themes'
import type { PieceStyle } from './board3d'

// 플레이 모드: 사람 둘 / 갈색만 AI / 양쪽 AI 관전
export type Mode = 'hotseat' | 'vsAi' | 'watch'
export const MODE_LABEL: Record<Mode, string> = {
  hotseat: '사람 vs 사람',
  vsAi: 'vs AI',
  watch: 'AI 관전',
}
// 설정 버튼에 현재 선택값을 짧게 보여줄 라벨(드롭다운 버튼용, 그리드 폭 고려).
export const MODE_SHORT: Record<Mode, string> = {
  hotseat: '사람끼리',
  vsAi: 'vs AI',
  watch: 'AI 관전',
}
export const DIFF_LABEL: Record<Difficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움', expert: '전문가' }

// 코칭(훈수) 강도 단계.
export type CoachLevel = 'off' | 'basic' | 'strong'
export const COACH_LABEL: Record<CoachLevel, string> = { off: '끄기', basic: '기본', strong: '강하게' }
export const COACH_NEXT: Record<CoachLevel, CoachLevel> = { off: 'basic', basic: 'strong', strong: 'off' }

// 방(매치) 설정. 지금은 로컬에서 패널로 바꾸지만, 멀티플레이에서는 게임 시작 전 로비에서
// 방장이 정해 양쪽에 공통 적용되는 "방 설정"이 되도록 한 곳에 모아 둔다(직렬화 가능).
export interface RoomSettings {
  mode: Mode
  aiDifficulty: Difficulty
  aiSide: Player // vsAi 에서 AI 가 두는 색. 기본 'brown'(사람=노랑 선공). 'yellow' 면 사람이 후공(갈색) 연습.
  // 코칭(훈수) 강도: off=도움 없음 / basic=상대 즉시 5목·막을 수 없는 벌집 경고(기본) /
  // strong=거기에 더해 상대의 "자라는 위협"(연결 3목 등) 강조 + 내 승리 자리·벌집 초읽기 힌트.
  coachLevel: CoachLevel
  queen: boolean // 여왕벌 모드(확장, 숙련자용). 기본 꺼짐. AI 는 사용 안 함
  infiniteTiles: boolean // 무한 모드(디지털 변형): 타일 제한 없음. 기본 꺼짐
  bgmTrack: number // BGM_TRACKS 인덱스
  bgmVolume: number // 0~1
  sfxVolume: number // 0~1 (0 = 효과음 끔)
  watchDelay: number // 관전 모드 수 간격(ms)
  actionBarPos: ActionBarPos // 인게임 행동 바(턴 안내+①②) 위치
  board3d: boolean // 보드를 3D(three.js)로 표시. 기본 꺼짐 → 2D SVG.
  darkMode: boolean // 페이지 전체 다크 모드(배경·패널·보드 배경 어둡게). 기본 꺼짐.
  board3dStyle: PieceStyle // 3D 말 스타일: 일반(스타일 토큰) / 실사(사실적 벌, 숨은 이스터에그)
  themeId: string // 컬러 테마(themes.ts COLOR_THEMES 의 id)
  personaYellow: Persona // 관전 시 노랑 AI 성향
  personaBrown: Persona // 갈색 AI 성향(vsAi 상대 + 관전 갈색)
  difficultyYellow: Difficulty // 관전 시 노랑 AI 난이도(색깔별)
  difficultyBrown: Difficulty // 관전 시 갈색 AI 난이도(색깔별)
  sectionsOpen: Record<string, boolean> // 설정 패널 섹션(아코디언) 펼침 상태
}
export type SectionKey = 'game' | 'view' | 'ai' | 'sound' | 'help'
export const SECTION_KEYS: SectionKey[] = ['game', 'view', 'ai', 'sound', 'help']
function defaultSectionsOpen(): Record<string, boolean> {
  // 첫 접속(기본 설정)에는 모든 섹션을 펼친 상태로 보여준다. (사용자가 접으면 그 선택을 저장)
  return { game: true, view: true, ai: true, sound: true, help: true }
}
// 저장된 섹션 펼침 상태를 기본값과 병합(알려진 키의 boolean 만 채택).
function mergeSectionsOpen(raw: unknown, d: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = { ...d }
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    for (const k of SECTION_KEYS) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean
  }
  return out
}
export function defaultSettings(): RoomSettings {
  return {
    mode: 'hotseat',
    aiDifficulty: 'medium',
    aiSide: 'brown',
    coachLevel: 'basic', // 기본=상대 즉시 5목 경고 켜짐(초보가 지는 걸 놓치지 않게). 끄기/강하게로 조절.
    queen: false,
    infiniteTiles: false,
    bgmTrack: 0,
    bgmVolume: 0.4,
    sfxVolume: 0.6,
    watchDelay: 700,
    actionBarPos: 'top',
    board3d: false,
    darkMode: false,
    board3dStyle: 'stylized',
    themeId: DEFAULT_THEME_ID,
    personaYellow: 'aggressive', // 관전 기본 대진을 대비되게(공격 vs 균형)
    personaBrown: 'balanced',
    difficultyYellow: 'medium',
    difficultyBrown: 'medium',
    sectionsOpen: defaultSectionsOpen(),
  }
}

const SETTINGS_KEY = 'be-the-bee/settings'
const MODES: Mode[] = ['hotseat', 'vsAi', 'watch']
export const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'expert']
export const PERSONAS: Persona[] = ['balanced', 'aggressive', 'defensive', 'hive']
export const PERSONA_LABEL: Record<Persona, string> = {
  balanced: '균형',
  aggressive: '공격형',
  defensive: '수비형',
  hive: '벌집형',
}
export const PERSONA_DESC: Record<Persona, string> = {
  balanced: '공격과 수비를 고르게',
  aggressive: '내 말 공격·두 곳을 동시에 노리기 우선',
  defensive: '상대 위협 차단·허리 끊기 우선',
  hive: '벌집·타일선 발전을 더 챙김',
}
export type ActionBarPos = 'top' | 'bottom'
const ACTION_BAR_POSITIONS: ActionBarPos[] = ['top', 'bottom']

function clampVol(v: unknown, fallback: number): number {
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback
}

// 저장된 설정을 기본값과 병합해 불러온다(누락/이상값은 기본값). 손상돼도 안전.
export function loadSettings(): RoomSettings {
  const d = defaultSettings()
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return d
    const s = JSON.parse(raw) as Partial<RoomSettings>
    return {
      mode: MODES.includes(s.mode as Mode) ? (s.mode as Mode) : d.mode,
      aiDifficulty: DIFFS.includes(s.aiDifficulty as Difficulty) ? (s.aiDifficulty as Difficulty) : d.aiDifficulty,
      coachLevel: ((): CoachLevel => {
        const cl = (s as { coachLevel?: unknown }).coachLevel
        if (cl === 'off' || cl === 'basic' || cl === 'strong') return cl
        // 구버전(hints/dangerAlerts 불리언) 이전: hints→강하게, dangerAlerts 끔→끄기, 그 외→기본.
        const old = s as { hints?: unknown; dangerAlerts?: unknown }
        if (old.hints === true) return 'strong'
        if (old.dangerAlerts === false) return 'off'
        return d.coachLevel
      })(),
      queen: typeof s.queen === 'boolean' ? s.queen : d.queen,
      infiniteTiles: typeof s.infiniteTiles === 'boolean' ? s.infiniteTiles : d.infiniteTiles,
      bgmTrack:
        Number.isInteger(s.bgmTrack) && (s.bgmTrack as number) >= 0 && (s.bgmTrack as number) < BGM_TRACKS.length
          ? (s.bgmTrack as number)
          : d.bgmTrack,
      bgmVolume: clampVol(s.bgmVolume, d.bgmVolume),
      sfxVolume: clampVol(s.sfxVolume, d.sfxVolume),
      watchDelay:
        typeof s.watchDelay === 'number' && s.watchDelay >= 100 && s.watchDelay <= 3000
          ? Math.round(s.watchDelay)
          : d.watchDelay,
      actionBarPos: ACTION_BAR_POSITIONS.includes(s.actionBarPos as ActionBarPos)
        ? (s.actionBarPos as ActionBarPos)
        : d.actionBarPos,
      board3d: typeof s.board3d === 'boolean' ? s.board3d : d.board3d,
      darkMode: typeof s.darkMode === 'boolean' ? s.darkMode : d.darkMode,
      board3dStyle: s.board3dStyle === 'realistic' ? 'realistic' : d.board3dStyle,
      themeId: COLOR_THEMES.some((t) => t.id === s.themeId) ? (s.themeId as string) : d.themeId,
      personaYellow: PERSONAS.includes(s.personaYellow as Persona) ? (s.personaYellow as Persona) : d.personaYellow,
      personaBrown: PERSONAS.includes(s.personaBrown as Persona) ? (s.personaBrown as Persona) : d.personaBrown,
      difficultyYellow: DIFFS.includes(s.difficultyYellow as Difficulty) ? (s.difficultyYellow as Difficulty) : d.difficultyYellow,
      difficultyBrown: DIFFS.includes(s.difficultyBrown as Difficulty) ? (s.difficultyBrown as Difficulty) : d.difficultyBrown,
      aiSide: s.aiSide === 'yellow' || s.aiSide === 'brown' ? (s.aiSide as Player) : d.aiSide,
      sectionsOpen: mergeSectionsOpen(s.sectionsOpen, d.sectionsOpen),
    }
  } catch {
    return d
  }
}

export function saveSettings(s: RoomSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* 사생활 모드 등, 무시 */
  }
}
