// 핫시트 게임 UI: SVG 보드 렌더 + 클릭 입력 + 줌/팬 카메라 + 턴/액션 상태머신.
// 엔진(순수)에만 의존한다. 엔진은 이 파일을 절대 import 하지 않는다.

import {
  allowedMoveTypes,
  analyzeMove,
  applyMove,
  createAi,
  createInitialState,
  detectHives,
  frontierCells,
  hex,
  hexEquals,
  hexFromKey,
  analyzeGame,
  hexKey,
  hiveCountdowns,
  isTilePlaceable,
  notePolarity,
  opponent,
  reviewMove,
  totalHiveScores,
  validateMove,
  validatePiecePlacement,
  winningCells,
  winningLine,
  withTile,
} from '../engine/index'
import type { Ai, Difficulty, GameState, Hex, HiveCountdown, Move, MoveNote, Persona, PieceKind, Player } from '../engine/index'
import { HEX_SIZE, hexPolygonPoints, hexToPixel, type Point } from './layout'
import { createSound, BGM_TRACKS } from './sound'
import { COLOR_THEMES, DEFAULT_THEME_ID, themeById, type ColorTheme } from './themes'
import {
  addSlot,
  autoSave,
  decodeSnapshot,
  deleteSlot,
  encodeSnapshot,
  getSlot,
  listSlots,
  loadAutoSave,
  type GameSnapshot,
} from './game-save'
import { openTutorial } from './tutorial'
import { maybeShowOnboarding, openOnboarding, type OnboardCtx } from './onboarding'
import { ICON } from './icons'
import type { Board3D, BoardHints, PieceStyle } from './board3d' // 런타임 createBoard3D 는 3D 켤 때 동적 import
import { mpEnabled } from '../mp/supabase'
import { initMobileShell } from './mobile-shell'
import { makeDraggable } from './draggable'
import {
  createRoom,
  joinRoom,
  getRoom,
  leaveRoom,
  deleteRoom,
  cleanupOldRooms,
  pushState,
  connectRoom,
  agreeStart,
  opposite,
  clientId,
  type Room,
  type RoomConn,
  type RoomStatus,
  type Side,
} from '../mp/room'

const SVGNS = 'http://www.w3.org/2000/svg'

// 진영 색(타일·말·벌집)은 컬러 테마에서 가져온다, themes.ts.
// 말 = 벌: 몸통 + 줄무늬(진영 구분 + 벌 느낌), 흰 테두리로 타일과 대비.
// 진영 이름. 테마에 따라 바뀐다(예: 보색 테마는 '노랑'/'남색'). applyThemeColors 가 현재 테마의
// players 로 갱신한다 → 모든 PLAYER_LABEL[p] 참조가 자동으로 테마 라벨을 쓴다.
let PLAYER_LABEL: Record<Player, string> = { yellow: '노랑', brown: '갈색' }

// 결과 모달 벌 마스코트(인라인 SVG, 외부 에셋 없음). .wing 은 CSS 로 펄럭.
const BEE_SVG = `
  <svg class="modal-bee" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><clipPath id="beeBody"><ellipse cx="50" cy="62" rx="30" ry="26"/></clipPath></defs>
    <path d="M44 36 Q39 20 32 15" stroke="#5a3a14" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M56 36 Q61 20 68 15" stroke="#5a3a14" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="14" r="3.2" fill="#5a3a14"/>
    <circle cx="68" cy="14" r="3.2" fill="#5a3a14"/>
    <ellipse class="wing" cx="28" cy="44" rx="19" ry="13" fill="#ffffff" opacity="0.85" stroke="#d9c89a" stroke-width="1.5"/>
    <ellipse class="wing" cx="72" cy="44" rx="19" ry="13" fill="#ffffff" opacity="0.85" stroke="#d9c89a" stroke-width="1.5"/>
    <ellipse cx="50" cy="62" rx="30" ry="26" fill="#f4c430" stroke="#5a3a14" stroke-width="2.6"/>
    <g clip-path="url(#beeBody)">
      <rect x="18" y="64" width="64" height="8" fill="#3a2600"/>
      <rect x="18" y="78" width="64" height="8" fill="#3a2600"/>
    </g>
    <circle cx="42" cy="55" r="3.4" fill="#3a2600"/>
    <circle cx="58" cy="55" r="3.4" fill="#3a2600"/>
    <path d="M43 62 Q50 68 57 62" stroke="#3a2600" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </svg>`

// 여왕벌 설명 팝업용 마스코트, 왕관 쓴 벌(인라인 SVG). .wing 펄럭은 BEE_SVG 와 공유.
const QUEEN_SVG = `
  <svg class="modal-bee queen" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><clipPath id="qBody"><ellipse cx="50" cy="64" rx="30" ry="26"/></clipPath></defs>
    <path d="M44 38 Q39 22 32 17" stroke="#5a3a14" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M56 38 Q61 22 68 17" stroke="#5a3a14" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="16" r="3.2" fill="#5a3a14"/>
    <circle cx="68" cy="16" r="3.2" fill="#5a3a14"/>
    <ellipse class="wing" cx="27" cy="46" rx="19" ry="13" fill="#ffffff" opacity="0.85" stroke="#d9c89a" stroke-width="1.5"/>
    <ellipse class="wing" cx="73" cy="46" rx="19" ry="13" fill="#ffffff" opacity="0.85" stroke="#d9c89a" stroke-width="1.5"/>
    <ellipse cx="50" cy="64" rx="30" ry="26" fill="#f4c430" stroke="#5a3a14" stroke-width="2.6"/>
    <g clip-path="url(#qBody)">
      <rect x="18" y="66" width="64" height="8" fill="#3a2600"/>
      <rect x="18" y="80" width="64" height="8" fill="#3a2600"/>
    </g>
    <circle cx="42" cy="57" r="3.4" fill="#3a2600"/>
    <circle cx="58" cy="57" r="3.4" fill="#3a2600"/>
    <path d="M43 64 Q50 70 57 64" stroke="#3a2600" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M35 30 L40 38 L50 31 L60 38 L65 30 L62 41 L38 41 Z" fill="#ffd54a" stroke="#b8860b" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="35" cy="29" r="2.4" fill="#ef4444"/>
    <circle cx="50" cy="30" r="2.4" fill="#ef4444"/>
    <circle cx="65" cy="29" r="2.4" fill="#ef4444"/>
  </svg>`

const BG_RADIUS = 12 // 옅은 배경 그리드 반경(헥스)
const MIN_W = HEX_SIZE * 5 // 줌 인 한계(viewBox 폭)
const MAX_W = HEX_SIZE * 130 // 줌 아웃 한계

interface Camera {
  cx: number
  cy: number
  w: number
}

type Draft =
  | { readonly stage: 'chooseAction' }
  | { readonly stage: 'tile'; readonly action: 'twoTiles' | 'tileAndPiece'; readonly first?: Hex }
  | { readonly stage: 'piece'; readonly action: 'tileAndPiece' | 'pieceOnly'; readonly tile?: Hex }

// 플레이 모드: 사람 둘 / 갈색만 AI / 양쪽 AI 관전
type Mode = 'hotseat' | 'vsAi' | 'watch'
const MODE_LABEL: Record<Mode, string> = {
  hotseat: '사람 vs 사람',
  vsAi: 'vs AI',
  watch: 'AI 관전',
}
// 설정 버튼에 현재 선택값을 짧게 보여줄 라벨(드롭다운 버튼용, 그리드 폭 고려).
const MODE_SHORT: Record<Mode, string> = {
  hotseat: '사람끼리',
  vsAi: 'vs AI',
  watch: 'AI 관전',
}
const DIFF_LABEL: Record<Difficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움', expert: '전문가' }

// 수 해설 코드(engine reviewMove) → 한국어. 복기 해설·전문가 라이브 코칭 공용.
// 문구 규칙(CLAUDE.md): 쉬운 말(오목 용어 "리치"·자작어 "회랑"·체스 용어 "포크" 금지, "5목"·"벌집"만
// 게임 기본 용어). 한글 사이 em dash(—) 금지. "이겨요" 대신 "승리".
const NOTE_TEXT: Record<MoveNote, string> = {
  win: '5목을 완성해 승리했어요.',
  fork: '두 곳을 동시에 노렸어요. 상대가 다 막을 수 없어요(5목 자리 2개).',
  threat: '다음 한 수로 5목을 노릴 수 있어요. 상대가 막아야 합니다.',
  block: '상대가 다음 한 수로 두려던 5목을 막았어요.',
  corridor: '상대가 벌집을 만들려던 줄을 끊었어요.',
  hive: '벌집을 완성해 점수를 얻었어요.',
  missWin: '여기서 바로 5목으로 승리할 수 있었어요. 그 자리를 놓쳤어요.',
  missBlock: '상대가 다음 한 수로 5목을 둘 수 있어요. 막았어야 했어요.',
}
// 코드를 ✓(칭찬)/✗(지적) 아이콘과 함께 한 줄로. 색은 notePolarity 로 CSS 클래스(good/bad).
function noteLine(note: MoveNote): string {
  return `${notePolarity(note) === 'bad' ? '✗' : '✓'} ${NOTE_TEXT[note]}`
}
const AI_DELAY_MS = 350
// 사용자 피드백 설문(구글폼). 크레딧 밑 '피드백 보내기' 버튼이 새 창으로 연다.
const FEEDBACK_URL = 'https://forms.gle/qf5VA1xytdLojHtp9'


// 방(매치) 설정. 지금은 로컬에서 패널로 바꾸지만, 멀티플레이에서는 게임 시작 전 로비에서
// 방장이 정해 양쪽에 공통 적용되는 "방 설정"이 되도록 한 곳에 모아 둔다(직렬화 가능).
interface RoomSettings {
  mode: Mode
  aiDifficulty: Difficulty
  aiSide: Player // vsAi 에서 AI 가 두는 색. 기본 'brown'(사람=노랑 선공). 'yellow' 면 사람이 후공(갈색) 연습.
  hints: boolean // 훈수(승리 힌트): 내가 5목 둘 칸·내 벌집 초읽기 등 "유리" 정보. 기본 꺼짐.
  dangerAlerts: boolean // 위험 경고: 상대가 다음 한 수로 5목·막을 수 없는 벌집(사이렌). 기본 켜짐.
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
type SectionKey = 'game' | 'view' | 'ai' | 'sound' | 'help'
const SECTION_KEYS: SectionKey[] = ['game', 'view', 'ai', 'sound', 'help']
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
function defaultSettings(): RoomSettings {
  return {
    mode: 'hotseat',
    aiDifficulty: 'medium',
    aiSide: 'brown',
    hints: false,
    dangerAlerts: true, // 위험 경고는 기본 켜짐(초보가 지는 걸 놓치지 않게). 설정에서 끌 수 있음.
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
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'expert']
const PERSONAS: Persona[] = ['balanced', 'aggressive', 'defensive', 'hive']
const PERSONA_LABEL: Record<Persona, string> = {
  balanced: '균형',
  aggressive: '공격형',
  defensive: '수비형',
  hive: '벌집형',
}
const PERSONA_DESC: Record<Persona, string> = {
  balanced: '공격과 수비를 고르게',
  aggressive: '내 말 공격·두 곳을 동시에 노리기 우선',
  defensive: '상대 위협 차단·허리 끊기 우선',
  hive: '벌집·타일선 발전을 더 챙김',
}
type ActionBarPos = 'top' | 'bottom'
const ACTION_BAR_POSITIONS: ActionBarPos[] = ['top', 'bottom']

function clampVol(v: unknown, fallback: number): number {
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback
}

// 저장된 설정을 기본값과 병합해 불러온다(누락/이상값은 기본값). 손상돼도 안전.
function loadSettings(): RoomSettings {
  const d = defaultSettings()
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return d
    const s = JSON.parse(raw) as Partial<RoomSettings>
    return {
      mode: MODES.includes(s.mode as Mode) ? (s.mode as Mode) : d.mode,
      aiDifficulty: DIFFS.includes(s.aiDifficulty as Difficulty) ? (s.aiDifficulty as Difficulty) : d.aiDifficulty,
      hints: typeof s.hints === 'boolean' ? s.hints : d.hints,
      dangerAlerts: typeof s.dangerAlerts === 'boolean' ? s.dangerAlerts : d.dangerAlerts,
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

function saveSettings(s: RoomSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* 사생활 모드 등, 무시 */
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// 색을 흰색(amt>0)/검정(amt<0) 쪽으로 amt 비율만큼 섞는다. 벌 몸통의 입체 음영용.
function shade(hexColor: string, amt: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hexColor.trim())
  if (!m) return hexColor
  const n = parseInt(m[1]!, 16)
  const target = amt < 0 ? 0 : 255
  const p = Math.min(1, Math.abs(amt))
  const mix = (c: number): number => Math.round((target - c) * p + c)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// 큐브 반경 R 안의 모든 헥스(배경 그리드용). 한 번만 계산.
function backgroundHexes(radius: number): Hex[] {
  const out: Hex[] = []
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius)
    const r2 = Math.min(radius, -q + radius)
    for (let r = r1; r <= r2; r++) out.push(hex(q, r))
  }
  return out
}
const BG_HEXES = backgroundHexes(BG_RADIUS)

// 한 수가 건드린 칸들(등장 애니메이션용).
function moveCells(move: Move): Hex[] {
  switch (move.type) {
    case 'twoTiles':
      return [move.first, move.second]
    case 'tileAndPiece':
      return hexEquals(move.tile, move.piece.at) ? [move.tile] : [move.tile, move.piece.at]
    case 'pieceOnly':
      return [move.piece.at]
  }
}

// 직전 수에서 타일이 놓인 칸들(칸 테두리로 표시).
function lastTileCells(move: Move): Hex[] {
  switch (move.type) {
    case 'twoTiles':
      return [move.first, move.second]
    case 'tileAndPiece':
      return [move.tile]
    case 'pieceOnly':
      return []
  }
}

// 직전 수에서 말이 놓인 칸(말 둘레 링으로 표시). 없으면 null.
function lastPieceCell(move: Move): Hex | null {
  return move.type === 'twoTiles' ? null : move.piece.at
}

export function mountGame(root: HTMLElement): void {
  let state: GameState = createInitialState() // 임시(마운트 끝에서 freshState/복원으로 교체)
  let history: GameState[] = []
  let moveLog: Move[] = [] // 둔 수의 순서(history 와 보조를 맞춤), 복기용
  let replayIndex: number | null = null // null = 실시간, 그 외 = timeline 의 그 국면을 본다
  let replayTimer: number | null = null // 복기 자동 재생 타이머
  let draft: Draft | null = null
  let pieceKind: PieceKind = 'normal'
  let message = '' // 경고(잘못된 수 등), ⚠️ 빨강
  let notice = '' // 긍정 피드백(저장/불러오기 등), ✓ 초록, 다음 수에 사라짐
  let aiComment = '' // 전문가 AI 의 결정적 수 해설, 다음 수에 사라짐
  let coachNote: MoveNote | null = null // 전문가 vs AI: 직전 "내(사람) 수" 코칭(다음 내 수까지 유지)
  let lastBoardNotesHtml = '' // 보드 옆 멘트의 직전 HTML — 같으면 재렌더 생략(등장 애니메이션 재발 방지)
  let lastModalKey = '' // 모달 상태 서명 — 같으면 재렌더 생략(온라인 안내 등 모달 깜빡임 방지)
  let beeTapCount = 0 // 제목 벌 탭 횟수 — 7번이면 실사 벌(이스터에그) 토글
  // 온라인 대전 세션(방에 참가 중이면, 아니면 null).
  //  - phase: 'waiting'(상대 대기) → 'negotiating'(선공/후공 합의 중) → 'playing'(대국).
  //  - mySide: 합의로 정해진 내 진영(playing 부터 유효). 그 외 차례/협상 중엔 입력 잠금.
  //  - proposal: 진행 중인 선공/후공 제안(mine=내가 제안 / false=상대 제안받음).
  let online:
    | {
        roomId: string
        isHost: boolean
        phase: 'waiting' | 'negotiating' | 'playing'
        mySide: Side
        proposal: { hostSide: Side; mine: boolean; toss?: boolean } | null
        undoReq: boolean // 내가 무르기를 요청해 상대 동의를 기다리는 중(true 면 대기 모달).
        peerConnected: boolean // 상대가 지금 접속 중인지(presence). false 면 끊김 표시.
        status: RoomStatus
        conn: RoomConn
      }
    | null = null
  let lastSyncedSnapshot = '' // 방과 마지막으로 주고받은 스냅샷 코드 — 내 push 의 에코·중복 적용 방지
  let waitPollTimer: number | null = null // 방장 대기 중 상대 입장 폴링(실시간을 놓쳐도 잡는 안전망)
  let lastMove: Move | null = null
  let modalDismissed = false // 결과 모달 닫음 여부
  // 팝업(결과 모달보다 우선): 여왕벌 설명/보관함 + 온라인 다이얼로그(진영 선택·나가기 확인) + 무르기 동의.
  let infoModal: 'queen' | 'saves' | 'leaveConfirm' | 'rematchAsk' | 'undoAsk' | 'newOnlineWarn' | null = null
  // 데스크탑 설정창 접기(모바일은 톱니 시트라 무관).
  let panelCollapsed = false
  // 음악 미니 플레이어 상태(세션 한정 — 영속 불필요). expanded=펼침 카드/접힘 알약, shuffle/repeat 토글.
  let musicExpanded = false
  let musicShuffle = false
  let musicRepeat = true // 기본 한 곡 반복(배경음악이 끊기지 않게)
  let miniSeeking = false // 진행바 드래그 중에는 timeupdate 가 핸들을 되돌리지 않게(드롭 때만 seek)
  // 새 게임 설정 마법사(상대 선택 → 분기). null=닫힘. 임시 설정을 들고 있다가 "시작" 때 settings 에 반영
  // (취소하면 settings 는 안 바뀐다). 온라인 경기를 마친 뒤면 '상대와 재대결' 버튼을 추가로 보여준다.
  let newGameWiz:
    | {
        step: 'opponent' | 'humanWhere' | 'online' | 'ai' | 'watch'
        diff: Difficulty // vs AI 난이도
        persona: Persona // vs AI 성향
        aiSide: Player // vs AI: AI 색(brown=내가 선공/노랑, yellow=내가 후공/갈색)
        diffY: Difficulty // 관전: 노랑
        personaY: Persona
        diffB: Difficulty // 관전: 갈색
        personaB: Persona
      }
    | null = null
  // 사람끼리: 각자 무르기 1회 + 상대 동의. undoUsed=진영별 사용 여부, undoAsk=되돌릴(요청한) 진영.
  let undoUsed: Record<Player, boolean> = { yellow: false, brown: false }
  let undoAsk: Player | null = null
  let onlineMsg: string | null = null // 온라인 알림 팝업(매칭 성공·상대 모드 변경·상대 나감). 확인 누르면 사라짐
  // 리치(한 수로 5목) 칸, render 가 채우고 renderPanel 이 읽는다.
  let dangerCells: Hex[] = []
  let winNowCells: Hex[] = []
  // 벌집 초읽기(잠긴 벌집 위 안전한 5목까지 N수). render 가 채우고 boardNotes 가 읽는다.
  let oppCountdown: HiveCountdown | null = null // 상대 벌집 초읽기 = 나에게 위험
  let myCountdown: HiveCountdown | null = null // 내 벌집 초읽기 = 나에게 유리

  let cam: Camera = { cx: 0, cy: 0, w: HEX_SIZE * 26 }
  // 포인터(마우스/터치) 추적, 1개=팬, 2개=핀치 줌
  const pointers = new Map<number, { x: number; y: number }>()
  let dragMoved = false
  let lastX = 0
  let lastY = 0
  let pinchDist = 0

  // 방 설정 + AI 상태 (settings 자체는 유지, 필드만 바뀜, 새 게임에도 방 설정은 유지)
  const settings = loadSettings()
  let theme: ColorTheme = themeById(settings.themeId)
  const persist = (): void => saveSettings(settings)
  const sound = createSound()
  sound.setSfxVolume(settings.sfxVolume)
  sound.setBgmVolume(settings.bgmVolume)
  sound.setBgmTrack(BGM_TRACKS[settings.bgmTrack]!.file)
  let lastBgmVolume = settings.bgmVolume || 0.35 // 뮤트 복원용
  let lastSfxVolume = settings.sfxVolume || 0.6
  // 새 게임의 초기 상태(현재 설정의 무한 모드 반영).
  const freshState = (): GameState =>
    createInitialState({ infiniteTiles: settings.infiniteTiles, queenEnabled: settings.queen })
  // 진영별 AI 인스턴스(관전은 양쪽 다른 성향·시드 → 같은 모양으로만 끝나지 않게). vsAi 는 갈색만.
  let aiYellow: Ai | null = null
  let aiBrown: Ai | null = null
  let aiThinking = false // 재진입 가드 + 입력 잠금
  let aiTimer: number | null = null
  let watchRunning = false // 관전 재생 중인지(런타임, 저장 안 함, 새로고침 시 자동 시작 방지)
  const aiControls = (turn: Player): boolean =>
    settings.mode === 'watch' || (settings.mode === 'vsAi' && turn === settings.aiSide)
  // 온라인 대전 중 지금이 "내 차례"인가(방 밖이면 항상 true). 대국 중 + 내 진영 차례여야 둘 수 있다.
  const myOnlineTurn = (): boolean =>
    online === null || (online.phase === 'playing' && state.turn === online.mySide)
  // 입력(보드 클릭·행동 버튼)을 잠가야 하는가: AI 가 두는 중/AI 차례, 또는 온라인 상대 차례/협상 중.
  const inputLocked = (): boolean => aiThinking || aiControls(state.turn) || !myOnlineTurn()
  // 무르기 버튼/단축키를 쓸 수 있는가. 온라인은 "내가 방금 둠(=상대 차례) + 각자 1회 + 요청 중 아님",
  // 사람끼리는 "상대가 무르기를 안 썼을 때"(요청자=직전에 둔 사람).
  const undoEnabled = (): boolean => {
    if (history.length === 0 || aiThinking) return false
    if (online)
      return online.phase === 'playing' && state.turn !== online.mySide && !undoUsed[online.mySide] && !online.undoReq
    return !(settings.mode === 'hotseat' && undoUsed[opponent(state.turn)])
  }
  const aiForTurn = (turn: Player): Ai | null => (turn === 'yellow' ? aiYellow : aiBrown)
  // 그 진영을 두는 AI 의 난이도(해설은 전문가일 때만). 관전은 색깔별, vsAi 는 단일.
  const aiDifficultyFor = (turn: Player): Difficulty =>
    settings.mode === 'watch' ? (turn === 'yellow' ? settings.difficultyYellow : settings.difficultyBrown) : settings.aiDifficulty
  const rebuildAi = (): void => {
    // 같은 시드면 두 AI 가 결정론적으로 같은 대국을 반복 → 시드를 진영별로 다르게.
    // 관전은 양색 모두 AI(색깔별 난이도·성향), vsAi 는 settings.aiSide 한 쪽만 AI(단일 난이도·성향).
    aiYellow = null
    aiBrown = null
    if (settings.mode === 'watch') {
      aiYellow = createAi({ difficulty: settings.difficultyYellow, persona: settings.personaYellow, seed: 0x1111 })
      aiBrown = createAi({ difficulty: settings.difficultyBrown, persona: settings.personaBrown, seed: 0x2222 })
    } else if (settings.mode === 'vsAi') {
      const ai = createAi({ difficulty: settings.aiDifficulty, persona: settings.personaBrown, seed: 0x2222 })
      if (settings.aiSide === 'yellow') aiYellow = ai
      else aiBrown = ai
    }
    // hotseat: 둘 다 null
  }
  rebuildAi() // 불러온 모드가 vs AI/관전이면 AI 준비

  // ---- 저장/불러오기(localStorage 기보) -------------------------------------
  function snapshot(): GameSnapshot {
    return { v: 1, state, history, moveLog, mode: settings.mode, savedAt: Date.now() }
  }
  function autoSaveNow(): void {
    autoSave(snapshot())
  }
  // 보관함 슬롯 기본 이름: "12수 · 06/22 15:30" (모드 표시 포함).
  function slotName(): string {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    const when = `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    return `${state.moveNumber}수 · ${MODE_SHORT[settings.mode]} · ${when}`
  }
  // 공유 코드를 클립보드에 복사(실패 시 프롬프트로 보여줘 직접 복사). 기보 공유·분석용.
  function shareCode(code: string): void {
    const done = (): void => {
      notice = '공유 코드를 복사했어요. 붙여넣어 전달/분석하세요.'
      render()
    }
    try {
      void navigator.clipboard.writeText(code).then(done, () => window.prompt('아래 코드를 복사하세요', code))
    } catch {
      window.prompt('아래 코드를 복사하세요', code)
    }
  }
  // 스냅샷으로 현재 판을 통째로 교체(복기/연출 정리 포함). 모드는 settings 가 단일 소스.
  function applySnapshot(s: GameSnapshot): void {
    state = s.state
    history = s.history
    moveLog = s.moveLog
    lastMove = moveLog.length > 0 ? moveLog[moveLog.length - 1]! : null
    replayIndex = null
    draft = null
    message = ''
    coachNote = null
    modalDismissed = false
    clearFx()
    startTurn()
  }

  root.innerHTML = `
    <div class="game">
      <aside class="panel"></aside>
      <div class="board-wrap">
        <svg class="board" xmlns="${SVGNS}" tabindex="0">
          <defs>
            <filter id="hiveGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="4.5" flood-color="#f59e0b" flood-opacity="1" />
            </filter>
            <radialGradient id="wax-yellow" cx="38%" cy="32%" r="75%"></radialGradient>
            <radialGradient id="wax-brown" cx="38%" cy="32%" r="75%"></radialGradient>
            <!-- 벌집(꿀) 광택 — applyThemeColors 가 진영 hiveFill 기준으로 위 밝음→아래 진함으로 채운다. -->
            <radialGradient id="honey-yellow" cx="42%" cy="26%" r="82%"></radialGradient>
            <radialGradient id="honey-brown" cx="42%" cy="26%" r="82%"></radialGradient>
            <radialGradient id="bee-yellow" cx="35%" cy="28%" r="72%"></radialGradient>
            <radialGradient id="bee-brown" cx="35%" cy="28%" r="72%"></radialGradient>
            <!-- 말 입체감(테마 무관): 광원(왼쪽 위)에서 멀수록 어두워져 그림자가 오른쪽 아래에 맺힘 -->
            <radialGradient id="bee-shade" cx="32%" cy="27%" r="88%">
              <stop offset="0%" stop-color="#2a1c00" stop-opacity="0" />
              <stop offset="48%" stop-color="#2a1c00" stop-opacity="0" />
              <stop offset="100%" stop-color="#2a1c00" stop-opacity="0.3" />
            </radialGradient>
            <!-- 말(벌+원판) 에셋: handoffs/bee_pieces 스펙. 진영=원판색(테마 piece 색으로 채움), 벌 공통. -->
            <radialGradient id="disc-gold" cx="36%" cy="30%" r="80%"></radialGradient>
            <radialGradient id="disc-brown" cx="36%" cy="30%" r="80%"></radialGradient>
            <radialGradient id="bee-body" cx="38%" cy="26%" r="78%">
              <stop offset="0%" stop-color="#ffd456" />
              <stop offset="52%" stop-color="#f4b70e" />
              <stop offset="100%" stop-color="#c8870a" />
            </radialGradient>
            <clipPath id="beeBodyClip" clipPathUnits="userSpaceOnUse">
              <ellipse cx="100" cy="111" rx="32" ry="46" />
            </clipPath>
          </defs>
          <g class="content"></g>
          <g class="fx" pointer-events="none"></g>
        </svg>
        <div class="board-status"></div>
        <div class="hud-float"></div>
        <div class="mini-player-host"></div>
        <div class="action-bar"></div>
        <div class="board-notes"></div>
      </div>
      <button class="panel-reopen" data-act="togglePanel" title="설정 펼치기" aria-label="설정 펼치기">☰</button>
    </div>
    <div class="modal-layer"></div>
  `
  const svg = root.querySelector('svg.board') as SVGSVGElement
  const content = svg.querySelector('g.content') as SVGGElement
  const fx = svg.querySelector('g.fx') as SVGGElement
  const panel = root.querySelector('.panel') as HTMLElement
  const boardWrap = root.querySelector('.board-wrap') as HTMLElement
  const actionBar = root.querySelector('.action-bar') as HTMLElement
  const boardNotes = root.querySelector('.board-notes') as HTMLElement
  const boardStatus = root.querySelector('.board-status') as HTMLElement
  const hudFloat = root.querySelector('.hud-float') as HTMLElement
  const miniHost = root.querySelector('.mini-player-host') as HTMLElement
  // 음악 미니 플레이어(데스크탑): 꾹 눌러 옮기고 더블탭으로 원위치. 재생·이전·다음·슬라이더는 그대로.
  // 펼침/접힘(알약·헤더)은 onTap 으로 통합 — 더블탭 첫 탭이 펼쳐버리지 않게(단일 탭은 약간 지연 후 펼침).
  makeDraggable(miniHost, {
    storageKey: 'be-the-bee/miniplayer-pos',
    tapThroughSelector: '.mp-pill, .mp-collapse, .mp-head',
    onTap: () => onPanelAction(miniHost.querySelector('.mp-card') ? 'musicCollapse' : 'musicExpand'),
  })
  const modalLayer = root.querySelector('.modal-layer') as HTMLElement
  const gameEl = root.querySelector('.game') as HTMLElement // 데스크탑 설정창 접기 클래스 토글용
  // 설정창 펼치기 버튼(셸 정적 요소라 직접 배선; onPanelAction 은 함수선언 hoist).
  root.querySelector('.panel-reopen')?.addEventListener('click', () => onPanelAction('togglePanel'))

  // 3D 보드: board-wrap 안에 three.js 캔버스 호스트. settings.board3d 면 SVG 대신 표시한다.
  // 렌더러는 처음 3D 로 그릴 때 지연 생성(three.js 비용 회피). 클릭은 SVG 와 동일한 onHexClick 으로.
  const board3dHost = document.createElement('div')
  board3dHost.className = 'board3d-host'
  boardWrap.appendChild(board3dHost)
  let board3dApi: Board3D | null = null
  let board3dLoading = false
  // three.js(약 600KB)는 3D 를 처음 켤 때만 동적 import(코드 스플릿) → 2D 기본 번들은 가볍게 유지.
  function ensureBoard3D(): void {
    if (board3dApi || board3dLoading) return
    board3dLoading = true
    import('./board3d')
      .then(({ createBoard3D }) => {
        board3dApi = createBoard3D(board3dHost, { onCellClick: onHexClick, style: settings.board3dStyle })
        board3dLoading = false
        render() // 로드 완료 후 3D 로 다시 그린다
      })
      .catch(() => {
        board3dLoading = false
      })
  }
  function applyBoard3D(): void {
    boardWrap.classList.toggle('mode-3d', settings.board3d)
  }
  applyBoard3D()

  // 행동 바(턴 안내+①②)를 보드 위/아래로, CSS order 로만 전환(DOM 순서는 유지).
  function applyActionBarPos(): void {
    boardWrap.classList.toggle('ab-top', settings.actionBarPos === 'top')
  }
  applyActionBarPos()

  // 모바일 전용 화면 크롬(설정 시트·드릴다운·FAB·하단 안내)은 별도 모듈로 분리(mobile-shell.ts).
  // 데스크탑(>720px)에선 mobile-shell 이 만든 요소가 mobile.css 로 숨겨지고 훅은 무동작.
  const mobileShell = initMobileShell({ root, onAction: (a) => onPanelAction(a) })

  // 누구 차례인지 직관적으로 — 플레이 영역 테두리에 그 진영색 비네트(데스크탑·모바일 공통).
  function applyTurnTint(): void {
    const playing = state.phase === 'playing'
    boardWrap.classList.toggle('turn-yellow', playing && state.turn === 'yellow')
    boardWrap.classList.toggle('turn-brown', playing && state.turn === 'brown')
  }

  // 데스크탑 설정창 접기(모바일은 톱니 시트라 무관 — mobile.css 가 가림).
  function applyPanelCollapsed(): void {
    gameEl.classList.toggle('panel-collapsed', panelCollapsed)
  }
  // 페이지 다크 모드 — .game 과 .modal-layer(.game 밖) 둘 다 .dark. CSS 가 배경·패널·보드·모달을 덮는다.
  function applyDark(): void {
    gameEl.classList.toggle('dark', settings.darkMode)
    modalLayer.classList.toggle('dark', settings.darkMode)
  }

  // 앱 사용법 온보딩(스포트라이트 투어)에 넘길 환경 훅. 레이아웃 제어만 노출(게임 상태는 모름).
  function onboardCtx(): OnboardCtx {
    return {
      root,
      isMobile: () => mobileShell.active(),
      mpEnabled,
      setMobileSettings: (open) => mobileShell.setSettings(open),
      setDesktopPanel: (open) => {
        panelCollapsed = !open
        applyPanelCollapsed()
      },
      // 온보딩의 '게임 규칙 보기' → 튜토리얼, 그게 끝나면 첫 사용 마무리(테마 팁 + 새 게임 설정).
      openRules: () => openTutorial(root, firstRunFinish),
    }
  }

  // 색 구분이 어려운 사용자를 위해 "테마(색)를 바꿀 수 있다"고 한 번만 안내(튜토리얼 직후).
  function maybeThemeTip(): void {
    try {
      if (localStorage.getItem('be-the-bee/theme-told') === '1') return
      localStorage.setItem('be-the-bee/theme-told', '1')
    } catch {
      return
    }
    notice = '색 구분이 어렵다면 설정 → 화면·설정에서 테마(색)를 바꿀 수 있어요.'
    render()
  }
  // 첫 사용(온보딩/튜토리얼) 마무리: 테마 팁 + 진행 중인 판이 없으면 새 게임 설정 마법사를 띄운다.
  function firstRunFinish(): void {
    maybeThemeTip()
    if (!resumed) openNewGameWizard()
  }

  // 무르기 실제 수행(사람 차례까지 되돌림 — vs AI 는 AI 수+내 수 함께). 동의/직접 호출 공용.
  function doUndo(): void {
    if (history.length === 0) return
    clearAiTimer()
    stopReplayTimer()
    clearFx()
    replayIndex = null
    do {
      state = history[history.length - 1]!
      history = history.slice(0, -1)
      moveLog = moveLog.slice(0, -1)
    } while (history.length > 0 && aiControls(state.turn))
    message = ''
    notice = ''
    coachNote = null
    lastMove = null
    modalDismissed = false
    startTurn()
    autoSaveNow()
  }

  // 컬러 테마 적용: 밀랍 그라데이션 stop 과 벌집 글로우 색을 현재 테마로 채운다.
  // (테마 변경 시 다시 호출 → render() 가 나머지 인라인 색을 다시 그린다.)
  function fillGradient(id: string, stops: readonly (readonly [string, string])[]): void {
    const grad = svg.querySelector(id)
    if (!grad) return
    while (grad.firstChild) grad.removeChild(grad.firstChild)
    for (const [off, col] of stops) {
      const s = document.createElementNS(SVGNS, 'stop')
      s.setAttribute('offset', off)
      s.setAttribute('stop-color', col)
      grad.appendChild(s)
    }
  }
  function applyThemeColors(): void {
    PLAYER_LABEL = theme.players // 진영 이름을 현재 테마에 맞춤(보색 테마면 '남색' 등)
    for (const owner of ['yellow', 'brown'] as Player[]) {
      const tc = theme.tile[owner]
      fillGradient(`#wax-${owner}`, [
        ['0%', tc.light],
        ['55%', tc.mid],
        ['100%', tc.dark],
      ])
      // 벌 몸통, 위쪽 밝게, 아래쪽 어둡게(구형 음영 = 2.5D)
      const body = theme.piece[owner].body
      fillGradient(`#bee-${owner}`, [
        ['0%', shade(body, 0.5)],
        ['55%', body],
        ['100%', shade(body, -0.32)],
      ])
      // 말 원판(진영색) — 테마 piece 색 기반(위 밝게→아래 어둡게). 테마 바꾸면 말 색도 따라간다.
      fillGradient(`#${owner === 'yellow' ? 'disc-gold' : 'disc-brown'}`, [
        ['0%', shade(body, 0.42)],
        ['60%', body],
        ['100%', shade(body, -0.4)],
      ])
      // 벌집 셀(밀랍 우물): 중심은 밝은 꿀 광택(반사) → 안쪽 진한 꿀(깊이) → 가장자리 밝은 밀랍 벽(능선).
      // radial 이라 각 칸이 "가장자리 벽 + 안에 고인 꿀"의 입체 셀처럼 보인다. 진영색이라 노랑/갈색 구분 유지.
      const honey = theme.hiveFill[owner]
      fillGradient(`#honey-${owner}`, [
        ['0%', shade(honey, 0.72)], // 중심 광택 반사
        ['30%', shade(honey, -0.16)], // 진한 꿀(셀 깊이)
        ['74%', honey],
        ['100%', shade(honey, 0.42)], // 가장자리 밝은 밀랍 벽
      ])
    }
    const glow = svg.querySelector('#hiveGlow feDropShadow')
    if (glow) glow.setAttribute('flood-color', theme.hiveGlow)
  }
  applyThemeColors()

  // ---- 카메라 ---------------------------------------------------------------

  function svgAspect(): { cw: number; ch: number; aspect: number } {
    const rect = svg.getBoundingClientRect()
    const cw = rect.width > 0 ? rect.width : 800
    const ch = rect.height > 0 ? rect.height : 600
    return { cw, ch, aspect: ch / cw }
  }

  function applyCamera(): void {
    const { aspect } = svgAspect()
    const h = cam.w * aspect
    svg.setAttribute(
      'viewBox',
      `${(cam.cx - cam.w / 2).toFixed(2)} ${(cam.cy - h / 2).toFixed(2)} ${cam.w.toFixed(2)} ${h.toFixed(2)}`,
    )
  }

  function setInitialCamera(): void {
    const a = hexToPixel(hex(0, 0))
    const b = hexToPixel(hex(1, 0))
    // 헥스가 화면에서 ~36px 로 보이도록 보이는 폭을 화면 폭에 맞춘다. 좁은 모바일은 헥스 수를 줄여
    // (=더 가까이) 보드가 또렷·탭하기 좋게, 넓은 데스크탑은 상한 26헥스로 기존과 동일. (이후 사용자
    // 핀치/휠 줌으로 자유 조절.)
    const { cw } = svgAspect()
    const hexCount = Math.min(26, Math.max(8, cw / 36))
    cam = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, w: HEX_SIZE * hexCount }
    applyCamera()
  }

  function zoomAt(px: number, py: number, factor: number): void {
    const { cw, ch, aspect } = svgAspect()
    const w = cam.w
    const h = w * aspect
    const worldX = cam.cx - w / 2 + (px / cw) * w
    const worldY = cam.cy - h / 2 + (py / ch) * h
    const w2 = clamp(w * factor, MIN_W, MAX_W)
    const h2 = w2 * aspect
    cam.w = w2
    cam.cx = worldX + w2 / 2 - (px / cw) * w2
    cam.cy = worldY + h2 / 2 - (py / ch) * h2
    applyCamera()
  }

  function panByClient(dx: number, dy: number): void {
    const { cw, ch, aspect } = svgAspect()
    cam.cx -= (dx / cw) * cam.w
    cam.cy -= (dy / ch) * (cam.w * aspect)
    applyCamera()
  }

  svg.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor)
    },
    { passive: false },
  )

  function pinchInfo(): { dist: number; mx: number; my: number } | null {
    const v = [...pointers.values()]
    if (v.length < 2) return null
    const a = v[0]!
    const b = v[1]!
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
  }

  const capturePointer = (id: number): void => {
    try {
      svg.setPointerCapture(id)
    } catch {
      /* happy-dom 등 미지원 환경 무시 */
    }
  }

  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragMoved = false
    if (pointers.size === 1) {
      lastX = e.clientX
      lastY = e.clientY
    } else if (pointers.size === 2) {
      pinchDist = pinchInfo()?.dist ?? 0
    }
    // 주의: 여기서 setPointerCapture 하면 click 이 캡처 대상(svg)으로 리타깃되어
    // 헥스(polygon) 클릭이 안 먹는다. 실제 드래그/핀치가 시작될 때만 캡처한다.
  })
  svg.addEventListener('pointermove', (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size >= 2) {
      // 두 손가락 핀치 줌(가운데 기준)
      if (!dragMoved) {
        dragMoved = true
        capturePointer(e.pointerId)
      }
      const info = pinchInfo()
      if (info && pinchDist > 0 && info.dist > 0) {
        const rect = svg.getBoundingClientRect()
        zoomAt(info.mx - rect.left, info.my - rect.top, pinchDist / info.dist)
      }
      if (info) pinchDist = info.dist
    } else {
      // 한 손가락/마우스 드래그 팬
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      if (!dragMoved && Math.hypot(dx, dy) > 4) {
        dragMoved = true
        svg.classList.add('panning')
        capturePointer(e.pointerId)
      }
      if (dragMoved) {
        panByClient(dx, dy)
        lastX = e.clientX
        lastY = e.clientY
      }
    }
  })
  const endPointer = (e: PointerEvent): void => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinchDist = 0
    if (pointers.size === 1) {
      const v = [...pointers.values()][0]!
      lastX = v.x
      lastY = v.y
    }
    if (pointers.size === 0) svg.classList.remove('panning')
  }
  svg.addEventListener('pointerup', endPointer)
  svg.addEventListener('pointercancel', endPointer)

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    // 입력창 포커스/팝업 중에는 단축키 무시(오발동 방지).
    const ae = document.activeElement
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return
    if (infoModal !== null) return

    // 무르기(U) 단축키 — 온라인 포함(gating 은 onPanelAction 'undo' 가 처리).
    if (e.key === 'u' || e.key === 'U') {
      if (!aiThinking) {
        e.preventDefault()
        onPanelAction('undo')
      }
      return
    }
    // 새 게임(N) — 온라인은 방을 깨므로 제외(자체 나가기/재대국 UI 사용).
    if (!online && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault()
      onPanelAction('new')
      return
    }
    // 배경음악 재생/정지(M)
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault()
      onPanelAction('toggleMusic')
      return
    }

    // 인게임 행동 단축키 (사람 차례에만 — 온라인 상대 차례엔 잠금)
    if (state.phase === 'playing' && !inputLocked() && draft !== null) {
      if (draft.stage === 'chooseAction' && e.key === '1') {
        e.preventDefault()
        onPanelAction('twoTiles')
        return
      }
      if (draft.stage === 'chooseAction' && e.key === '2') {
        e.preventDefault()
        onPanelAction('tileAndPiece')
        return
      }
      if (e.key === 'Escape' && draftHasSelection()) {
        e.preventDefault()
        onPanelAction('cancel')
        return
      }
      if (
        (e.key === 'q' || e.key === 'Q') &&
        draft.stage === 'piece' &&
        settings.queen &&
        !state.supplies[state.turn].queenUsed
      ) {
        e.preventDefault()
        onPanelAction('queen')
        return
      }
    }

    const { aspect, cw, ch } = svgAspect()
    const camH = cam.w * aspect
    switch (e.key) {
      case 'ArrowLeft':
        cam.cx -= 0.12 * cam.w
        break
      case 'ArrowRight':
        cam.cx += 0.12 * cam.w
        break
      case 'ArrowUp':
        cam.cy -= 0.12 * camH
        break
      case 'ArrowDown':
        cam.cy += 0.12 * camH
        break
      case '+':
      case '=':
        zoomAt(cw / 2, ch / 2, 1 / 1.15)
        return
      case '-':
      case '_':
        zoomAt(cw / 2, ch / 2, 1.15)
        return
      case '0':
        setInitialCamera()
        return
      default:
        return
    }
    e.preventDefault()
    applyCamera()
  })

  window.addEventListener('resize', applyCamera)

  // ---- 턴/액션 상태머신 -----------------------------------------------------

  function startTurn(): void {
    pieceKind = 'normal'
    // 게임이 끝났거나 내가 둘 차례가 아니면(AI·온라인 상대·관전) 행동 안내(draft)를 만들지 않는다.
    // 안 그러면 상대 차례인데도 "이번 턴 행동을 고르세요" 가 내 화면에 뜬다.
    if (state.phase === 'finished' || inputLocked()) {
      draft = null
      return
    }
    const allowed = allowedMoveTypes(state)
    // 타일을 놓을 수 있는 턴이면 항상 행동 선택지를 보여준다(불가한 건 renderActionBar 가 비활성화).
    // 첫 턴(②만 가능)·타일 1개 남음(②만)도 버튼이 보여 행동 구조를 일관되게 배운다.
    // 타일이 아예 없어 '말만' 두는 턴은 선택지가 없으니 곧장 말 놓기로 간다.
    if (allowed.includes('twoTiles') || allowed.includes('tileAndPiece')) draft = { stage: 'chooseAction' }
    else if (allowed.length === 1 && allowed[0] === 'pieceOnly') draft = { stage: 'piece', action: 'pieceOnly' }
    else draft = { stage: 'chooseAction' }
  }

  // 처음부터 현재까지의 모든 국면. timeline[k] = k수째 둔 뒤의 국면(moveLog[k-1] 이 만든 국면).
  function timeline(): GameState[] {
    return [...history, state]
  }

  function stopReplayTimer(): void {
    if (replayTimer !== null) {
      clearTimeout(replayTimer)
      replayTimer = null
    }
  }

  // 복기 자동 재생, watchDelay 간격으로 한 수씩 앞으로.
  function replayTick(): void {
    if (replayIndex === null) return
    if (replayIndex >= moveLog.length) {
      stopReplayTimer()
      render()
      return
    }
    replayIndex += 1
    render()
    if (replayIndex >= moveLog.length) {
      stopReplayTimer()
      render()
      return
    }
    replayTimer = window.setTimeout(replayTick, settings.watchDelay)
  }

  // idx 번째 수(1-based)를 사람이 읽을 수 있게 기술. idx=0 은 시작 국면.
  function describeMove(idx: number): string {
    if (idx <= 0) return '시작 국면'
    const before = timeline()[idx - 1]!
    const mv = moveLog[idx - 1]!
    const mover = before.turn
    const pc = lastPieceCell(mv)
    const tiles = lastTileCells(mv)
    const what = pc ? (tiles.length > 0 ? '타일+말' : '말') : '타일'
    const where = pc
      ? `(${pc.q}, ${pc.r})`
      : tiles.map((c) => `(${c.q}, ${c.r})`).join(' · ')
    return `${idx}수 · ${PLAYER_LABEL[mover]} ${what} → ${where}`
  }

  // 복기 컨트롤(보기 전용, state/history/moveLog 를 건드리지 않는다).
  function handleReplay(act: string): void {
    const n = moveLog.length
    switch (act) {
      case 'replayEnter':
        if (n === 0) return
        clearAiTimer()
        stopReplayTimer()
        clearFx()
        draft = null
        message = ''
        modalDismissed = true
        replayIndex = 0
        break
      case 'replayExit':
        stopReplayTimer()
        replayIndex = null
        startTurn()
        render()
        maybeScheduleAi()
        return
      case 'replayFirst':
        stopReplayTimer()
        replayIndex = 0
        break
      case 'replayPrev':
        stopReplayTimer()
        replayIndex = Math.max(0, (replayIndex ?? 0) - 1)
        break
      case 'replayNext':
        stopReplayTimer()
        replayIndex = Math.min(n, (replayIndex ?? 0) + 1)
        break
      case 'replayLast':
        stopReplayTimer()
        replayIndex = n
        break
      case 'replayPlay':
        if (replayTimer !== null) {
          stopReplayTimer()
        } else {
          if ((replayIndex ?? 0) >= n) replayIndex = 0
          replayTimer = window.setTimeout(replayTick, settings.watchDelay)
        }
        break
      default:
        return
    }
    render()
  }

  // ---- 연출(fx 레이어, render 가 지우지 않는 일회성 효과) -------------------
  function clearFx(): void {
    while (fx.firstChild) fx.removeChild(fx.firstChild)
  }

  // 착지 꽃가루 반짝, 6방향으로 튀었다 사라지는 점.
  function spawnSparkle(center: { x: number; y: number }, color: string): void {
    const g = document.createElementNS(SVGNS, 'g')
    const R = HEX_SIZE * 0.85
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i - Math.PI / 2
      const dot = document.createElementNS(SVGNS, 'circle')
      dot.setAttribute('cx', String(center.x))
      dot.setAttribute('cy', String(center.y))
      dot.setAttribute('r', String(HEX_SIZE * 0.11))
      dot.setAttribute('fill', color)
      dot.style.setProperty('--dx', `${(Math.cos(ang) * R).toFixed(1)}px`)
      dot.style.setProperty('--dy', `${(Math.sin(ang) * R).toFixed(1)}px`)
      dot.style.animation = 'pollen 600ms ease-out forwards'
      g.appendChild(dot)
    }
    fx.appendChild(g)
    window.setTimeout(() => g.remove(), 650)
  }

  // 직전 수의 말 위치에 착지 반짝(말을 놓은 수에만).
  function sparkleLastPiece(move: Move, owner: Player): void {
    const pc = lastPieceCell(move)
    if (!pc) return
    spawnSparkle(hexToPixel(pc), theme.piece[owner].body)
  }

  // 승리, 5목 라인을 따라 꿀이 터지는 연출(칸마다 시차).
  function spawnWinBurst(board: GameState['board']): void {
    const line = winningLine(board)
    if (!line) return
    line.cells.forEach((k, i) => {
      window.setTimeout(() => spawnSparkle(hexToPixel(hexFromKey(k)), '#f59e0b'), i * 90)
    })
  }

  // 벌집 완성, 새로 잠긴 칸마다 꿀이 바닥부터 차오르는 연출(칸마다 시차). 색은 벌집 주인 진영.
  function spawnHoneyRise(cells: Hex[], owner: Player): void {
    cells.forEach((h, i) => {
      const poly = document.createElementNS(SVGNS, 'polygon')
      poly.setAttribute('points', hexPolygonPoints(hexToPixel(h)))
      poly.setAttribute('fill', theme.hiveFill[owner])
      poly.setAttribute('opacity', '0')
      poly.setAttribute('class', 'honey-rise')
      poly.style.animationDelay = `${i * 70}ms`
      fx.appendChild(poly)
      window.setTimeout(() => poly.remove(), 900 + i * 70)
    })
  }

  // 직전 수로 새로 벌집(연속 타일선)에 편입된 칸들, 꿀 차오름 대상.
  function newlyHivedCells(before: GameState['board'], after: GameState['board']): Hex[] {
    const had = new Set<string>()
    for (const hv of detectHives(before)) for (const k of hv.cells) had.add(k)
    const fresh: Hex[] = []
    for (const hv of detectHives(after)) for (const k of hv.cells) if (!had.has(k)) fresh.push(hexFromKey(k))
    return fresh
  }

  function applyAndAdvance(move: Move): void {
    replayIndex = null // 실시간 수가 들어오면 복기 종료
    history = [...history, state]
    moveLog = [...moveLog, move]
    lastMove = move
    const mover = state.turn
    const before = state
    const prevBoard = state.board
    state = applyMove(state, move)
    // 전문가 vs AI: 내(사람) 수면 코칭 코드를 갱신(평범한 수는 null → 코멘트 사라짐). AI 수일 땐
    // 건드리지 않아, 내 코칭이 AI 즉답(짧은 딜레이)에 지워지지 않고 다음 내 수까지 남는다.
    if (settings.mode === 'vsAi' && settings.aiDifficulty === 'expert' && !aiControls(mover)) {
      coachNote = reviewMove(before, move)
    }
    message = ''
    notice = ''
    aiComment = '' // 새 수가 들어오면 이전 해설 지움(전문가 AI 수면 적용 후 다시 채운다)
    modalDismissed = false
    if (state.phase === 'finished' && state.result?.kind === 'win') {
      sound.win()
      spawnWinBurst(state.board)
    } else {
      sound.place(mover)
      sparkleLastPiece(move, mover)
      // 이 수로 벌집이 새로 완성/확장됐으면 꿀 차오름 + 완성음
      const hived = newlyHivedCells(prevBoard, state.board)
      if (hived.length > 0) {
        spawnHoneyRise(hived, mover) // 새로 벌집된 칸은 직전에 둔 사람(mover) 색
        sound.hive()
      }
    }
    // 위험 경고가 켜져 있으면 새 차례가 위협받을 때(상대가 다음 한 수로 5목 가능) 경고음
    if (settings.dangerAlerts && state.phase === 'playing') {
      const opp = opponent(state.turn)
      if (winningCells(state.board, opp, state.supplies[opp], settings.queen).length > 0) sound.alert()
    }
    // 관전 대결이 끝나면 자동으로 멈춤, 새 게임이 저절로 또 돌지 않게.
    if (state.phase === 'finished' && settings.mode === 'watch') watchRunning = false
    startTurn()
    autoSaveNow() // 매 수 자동 저장 → 새로고침해도 이어하기
    render()
    maybeScheduleAi()
    if (online) pushOnline() // 온라인: 내가 둔 수를 방에 반영(상대가 구독으로 받음). 상대 수는 applySnapshot 경로라 여기 안 옴
  }

  // ---- 온라인 대전(Supabase 방) -------------------------------------------
  // 초대 링크: 같은 주소 + #room=코드. 상대가 열면 자동 입장(아래 mountGame 끝 해시 처리).
  function inviteUrl(roomId: string): string {
    if (typeof location === 'undefined') return roomId
    return `${location.origin}${location.pathname}#room=${roomId}`
  }
  // 진영 라벨(노랑=선공, 갈색=후공). 노랑이 항상 먼저 둔다.
  function sideLabel(side: Side): string {
    return side === 'yellow' ? '노랑(선공)' : '갈색(후공)'
  }
  function dayAgoIso(): string {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }

  // 방장이 상대를 기다리는 동안, 실시간 입장 이벤트를 놓쳐도 잡도록 주기적으로 방을 확인한다.
  function startWaitPoll(roomId: string): void {
    stopWaitPoll()
    waitPollTimer = window.setInterval(() => {
      if (!online || online.phase !== 'waiting') {
        stopWaitPoll()
        return
      }
      void getRoom(roomId).then((room) => {
        if (room && room.status === 'negotiating' && online && online.phase === 'waiting') {
          stopWaitPoll()
          onRoomUpdate(room) // 매칭 처리(waiting→negotiating) 재사용
        }
      })
    }, 2500)
  }
  function stopWaitPoll(): void {
    if (waitPollTimer !== null) {
      clearInterval(waitPollTimer)
      waitPollTimer = null
    }
  }

  // 내가 둔 뒤 새 스냅샷을 방에 올린다. lastSyncedSnapshot 으로 내 push 의 에코를 무시한다.
  function pushOnline(): void {
    if (!online) return
    const code = encodeSnapshot(snapshot())
    lastSyncedSnapshot = code
    const status: RoomStatus = state.phase === 'finished' ? 'finished' : 'playing'
    online.status = status
    void pushState(online.roomId, code, status)
  }

  // 방 행이 바뀌면(상대 입장·수·모드 변경·나감) 호출.
  function onRoomUpdate(room: Room): void {
    if (!online) return
    // 상대가 나감: 알림 + 내 온라인 세션 종료(보드는 그대로 둬 마지막 국면을 본다). 방은 정리(삭제).
    if (room.status === 'left') {
      stopWaitPoll()
      void deleteRoom(online.roomId) // 둘 다 떠난 방이니 정리
      online.conn.close()
      online = null
      if (typeof location !== 'undefined' && location.hash) location.hash = ''
      onlineMsg = '상대가 방에서 나갔어요. 온라인 대전을 종료합니다.'
      render()
      return
    }
    // 매칭 성공: 대기 중이던 방에 상대가 들어옴(waiting → negotiating) → 선공/후공 협상 시작.
    if (online.status === 'waiting' && room.status === 'negotiating') {
      stopWaitPoll()
      online.phase = 'negotiating'
      onlineMsg = '상대가 들어왔어요! 이제 선공·후공을 정해요.'
    }
    // 합의가 DB 에 반영됨(상대가 수락) → 협상 신호를 놓쳤어도 여기서 안전하게 시작(동기화 복구).
    if (room.status === 'playing' && online.phase !== 'playing') {
      finalizeAgreement(room.host_side)
      return
    }
    online.status = room.status
    // 상대 수/모드 변경: 스냅샷이 내가 올린 것과 다르면 적용. 모드가 바뀌었으면 팝업으로 알림.
    if (room.snapshot && room.snapshot !== lastSyncedSnapshot) {
      lastSyncedSnapshot = room.snapshot
      const s = decodeSnapshot(room.snapshot)
      if (s) {
        if (s.state.queenEnabled !== state.queenEnabled) {
          onlineMsg = `상대가 여왕벌 모드를 ${s.state.queenEnabled ? '켰어요' : '껐어요'}.`
        } else if (s.state.infiniteTiles !== state.infiniteTiles) {
          onlineMsg = `상대가 무한 모드를 ${s.state.infiniteTiles ? '켰어요' : '껐어요'}.`
        }
        applySnapshot(s)
        settings.queen = s.state.queenEnabled === true // 토글 버튼 상태도 상대 변경에 맞춤
        settings.infiniteTiles = s.state.infiniteTiles === true
      }
    }
    render()
  }

  // 선공/후공 협상 신호(broadcast). DB 가 아니라 즉석 메시지로 주고받는다.
  function onSignal(event: string, payload: Record<string, unknown>): void {
    if (!online) return
    if (event === 'propose') {
      online.proposal = { hostSide: payload.hostSide as Side, mine: false, toss: payload.toss === true }
      render() // 협상 모달이 예/아니오 표시
    } else if (event === 'accept') {
      finalizeAgreement(payload.hostSide as Side)
    } else if (event === 'reject') {
      if (online.phase === 'playing') return // 이미 합의·시작됨 → 늦게 도착한 거절은 무시(동기화 깨짐 방지)
      online.proposal = null
      onlineMsg = '상대가 거절했어요. 다시 정해 주세요.'
      render()
    } else if (event === 'cancel') {
      if (online.phase === 'playing') return // 이미 합의·시작됨 → 늦은 취소 무시
      online.proposal = null // 상대가 자기 제안을 취소함
      render()
    } else if (event === 'rematchReq') {
      infoModal = 'rematchAsk' // 상대가 한 판 더 요청 → 예/아니오
      render()
    } else if (event === 'rematchOk') {
      startRematch()
    } else if (event === 'rematchNo') {
      onlineMsg = '상대가 한 판 더를 거절했어요.'
      render()
    } else if (event === 'undoReq') {
      // 상대가 무르기를 요청 → 동의/거절 모달(되돌릴 진영 = payload.side).
      if (online.phase !== 'playing') return
      undoAsk = payload.side as Player
      infoModal = 'undoAsk'
      render()
    } else if (event === 'undoOk') {
      // 내 무르기 요청을 상대가 동의 → 내가 한 수 되돌리고 스냅샷을 방에 반영(상대는 구독으로 동기화).
      if (!online.undoReq) return // 요청 중이 아니면 무시(지연/중복)
      online.undoReq = false
      undoUsed[online.mySide] = true
      doUndo()
      pushOnline()
      notice = '상대가 동의했어요. 한 수 물렀습니다.'
      render()
    } else if (event === 'undoNo') {
      if (!online.undoReq) return
      online.undoReq = false
      onlineMsg = '상대가 무르기를 거절했어요.'
      render()
    } else if (event === 'undoCancel') {
      // 요청자가 취소 → 내 동의 모달을 닫는다.
      if (infoModal === 'undoAsk') {
        infoModal = null
        undoAsk = null
        notice = '상대가 무르기 요청을 취소했어요.'
        render()
      }
    }
  }

  function enterOnline(roomId: string, isHost: boolean, phase: 'waiting' | 'negotiating' | 'playing', mySide: Side): void {
    settings.mode = 'hotseat' // 온라인은 로컬 AI 없이 사람 둘. aiControls=false 가 되게.
    rebuildAi()
    online = {
      roomId,
      isHost,
      phase,
      mySide,
      proposal: null,
      undoReq: false,
      peerConnected: phase !== 'waiting', // 협상/대국 단계면 상대가 방금 있었음(presence 가 곧 갱신)
      status: phase === 'waiting' ? 'waiting' : phase === 'negotiating' ? 'negotiating' : 'playing',
      conn: connectRoom(roomId, onRoomUpdate, onSignal, onPeer),
    }
    if (online.phase === 'waiting') startWaitPoll(roomId) // 상대 입장 폴링 안전망
    if (typeof location !== 'undefined') location.hash = `room=${roomId}`
  }

  // 상대 presence 변화(접속/끊김). 탭 닫힘·네트워크 끊김을 자동 감지한다.
  // 팝업은 새로고침 등으로 깜빡일 수 있어 안 띄우고, 보드 HUD 의 '상대 연결 끊김' 표시로만 반영한다.
  function onPeer(present: boolean): void {
    if (!online) return
    online.peerConnected = present
    render()
  }

  // 방장: 새 판으로 방을 만든다. 진영은 상대 입장 후 협상으로 정한다(host_side 는 임시 yellow).
  async function createOnlineRoom(): Promise<void> {
    resetToFreshGame()
    const code0 = encodeSnapshot(snapshot())
    lastSyncedSnapshot = code0
    try {
      void cleanupOldRooms(dayAgoIso()) // 오래된 방 정리(테이블 가볍게)
      const room = await createRoom(code0, 'yellow')
      enterOnline(room.id, true, 'waiting', 'yellow')
      const url = inviteUrl(room.id)
      try {
        void navigator.clipboard.writeText(url) // 자동 복사 — 따로 복사 버튼 찾을 필요 없이 바로 붙여넣기
      } catch {
        /* 클립보드 불가 환경: 아래 팝업의 링크를 직접 복사 */
      }
      onlineMsg = `방을 만들고 초대 링크를 복사했어요!\n${url}\n상대에게 붙여넣어 보내세요. 들어오면 선공·후공을 정해요.`
      render()
    } catch (e) {
      onlineMsg = '방 만들기 실패: ' + (e as Error).message
      render()
    }
  }

  // 상대: 코드로 입장 → 방장의 현재 판으로 맞추고 협상 단계로.
  async function joinOnline(code: string): Promise<void> {
    if (!mpEnabled) {
      onlineMsg = '온라인 기능이 아직 설정되지 않았어요(서버 키 없음).'
      render()
      return
    }
    try {
      const room = await joinRoom(code.trim().toUpperCase())
      if (!room) {
        onlineMsg = '그 방을 찾지 못했어요. 코드를 다시 확인하세요.'
        if (typeof location !== 'undefined' && location.hash) location.hash = ''
        render()
        return
      }
      // 만석: 이미 두 명(방장+상대)이 들어찼고 내가 그중 하나가 아니면 입장 거절(관전 미지원).
      // 코드를 여러 곳에 뿌려 3명+가 들어와도 두 사람만 두고 desync 안 나게.
      const me = clientId()
      if (room.host_id !== me && room.guest_id !== me && room.guest_id != null) {
        onlineMsg = '이 방은 이미 두 명이 들어차 있어요.\n두 명까지만 둘 수 있어요(관전은 아직 없어요).'
        if (typeof location !== 'undefined' && location.hash) location.hash = '' // 새로고침 재시도 방지
        render()
        return
      }
      lastSyncedSnapshot = room.snapshot
      const s = decodeSnapshot(room.snapshot)
      if (s) {
        applySnapshot(s)
        settings.queen = s.state.queenEnabled === true
        settings.infiniteTiles = s.state.infiniteTiles === true
      }
      const isHost = room.host_id === clientId() // 보통 false(게스트), 방장 재접속이면 true
      if (room.status === 'playing' || room.status === 'finished') {
        // 이미 합의된 방에 재접속 → 협상 건너뛰고 저장된 진영으로 바로 재개.
        const side: Side = isHost ? room.host_side : opposite(room.host_side)
        enterOnline(room.id, isHost, 'playing', side)
        onlineMsg = `다시 연결됐어요. 당신은 ${sideLabel(side)}. 이어서 둬요.`
      } else {
        // 신규 매칭(또는 협상 중 재접속) → 선공·후공부터.
        enterOnline(room.id, isHost, 'negotiating', 'yellow')
        onlineMsg = '방에 입장했어요! 매칭 성공. 이제 선공·후공을 정해요.'
      }
      render()
    } catch (e) {
      onlineMsg = '입장 실패: ' + (e as Error).message
      render()
    }
  }

  // 선공/후공 제안: choice = first(내가 선공)/second(내가 후공)/toss(코인토스).
  function proposeSide(choice: 'first' | 'second' | 'toss'): void {
    if (!online) return
    const iAmFirst = choice === 'toss' ? Math.random() < 0.5 : choice === 'first'
    const myColor: Side = iAmFirst ? 'yellow' : 'brown' // 노랑=선공
    const hostSide: Side = online.isHost ? myColor : opposite(myColor)
    const toss = choice === 'toss'
    online.proposal = { hostSide, mine: true, toss }
    online.conn.signal('propose', { hostSide, toss }) // 상대도 코인토스였음을 알도록 플래그 동기화
    render()
  }

  function acceptProposal(): void {
    if (!online || !online.proposal) return
    const hostSide = online.proposal.hostSide
    online.conn.signal('accept', { hostSide })
    finalizeAgreement(hostSide)
  }

  function rejectProposal(): void {
    if (!online || !online.proposal) return
    const wasMine = online.proposal.mine
    online.proposal = null
    online.conn.signal(wasMine ? 'cancel' : 'reject') // 내 제안 취소 vs 상대 제안 거절
    render()
  }

  // 합의 완료: 내 진영 확정 + 대국 시작. 방장은 host_side+status=playing 을 방에 저장(재접속 대비).
  function finalizeAgreement(hostSide: Side): void {
    if (!online) return
    const wasToss = online.proposal?.toss === true // 동의 시점에 결과 공개(코인토스였으면)
    online.mySide = online.isHost ? hostSide : opposite(hostSide)
    online.proposal = null
    online.phase = 'playing'
    online.status = 'playing'
    // 양쪽 다 DB 에 합의를 기록 → DB(room.status=playing+host_side)가 합의의 단일 진실.
    // 신호(broadcast)가 유실돼도 상대는 onRoomUpdate 에서 이걸 보고 안전하게 시작한다.
    void agreeStart(online.roomId, hostSide)
    onlineMsg = wasToss
      ? `🪙 코인토스 결과 — 당신은 ${sideLabel(online.mySide)}! 시작합니다!`
      : `선공·후공이 정해졌어요. 당신은 ${sideLabel(online.mySide)}. 시작합니다!`
    render()
  }

  // 재대국 요청("한 판 더"): 상대에게 신호 + 대기.
  function requestRematch(): void {
    if (!online) return
    online.conn.signal('rematchReq')
    modalDismissed = true // 결과 모달은 닫고
    onlineMsg = '한 판 더를 요청했어요. 상대 수락을 기다려요.'
    render()
  }
  // 재대국 시작: 새 판 + 진영 스왑. 방장이 방에 새 스냅샷·host_side 반영.
  function startRematch(): void {
    if (!online) return
    const curHostSide: Side = online.isHost ? online.mySide : opposite(online.mySide)
    const newHostSide = opposite(curHostSide) // 진영 교대
    resetToFreshGame()
    online.mySide = online.isHost ? newHostSide : opposite(newHostSide)
    online.phase = 'playing'
    online.status = 'playing'
    online.proposal = null
    online.undoReq = false
    infoModal = null
    modalDismissed = false
    lastSyncedSnapshot = encodeSnapshot(snapshot())
    if (online.isHost) {
      void agreeStart(online.roomId, newHostSide)
      pushOnline()
    }
    onlineMsg = `한 판 더! 진영을 바꿔서 당신은 ${sideLabel(online.mySide)}. 시작합니다!`
    render()
  }

  // 나가기 확정: 상대에게 알리고(방 status=left) 내 화면은 완전히 새 판으로 리셋.
  function doLeaveOnline(): void {
    stopWaitPoll()
    if (online) {
      void leaveRoom(online.roomId)
      online.conn.close()
    }
    online = null
    infoModal = null
    if (typeof location !== 'undefined' && location.hash) location.hash = ''
    resetToFreshGame()
    notice = '온라인 방에서 나왔어요.'
    render()
  }

  // 새 판으로 초기화(온라인 시작 시 기존 vs AI 판이 섞이지 않게). 'new' 액션과 같은 리셋.
  function resetToFreshGame(): void {
    clearAiTimer()
    stopReplayTimer()
    clearFx()
    replayIndex = null
    state = freshState()
    history = []
    moveLog = []
    message = ''
    coachNote = null
    lastMove = null
    modalDismissed = false
    undoUsed = { yellow: false, brown: false } // 재대국 → 무르기 사용권 초기화
    startTurn()
  }

  // ---- 새 게임 마법사 시작 동작 -------------------------------------------
  // 로컬/AI/관전 새 판으로 가기 전, 온라인 방에 있으면 떠난다(상대에게 알리고 세션 종료).
  function leaveOnlineForNew(): void {
    if (!online) return
    stopWaitPoll()
    void leaveRoom(online.roomId)
    online.conn.close()
    online = null
    if (typeof location !== 'undefined' && location.hash) location.hash = ''
  }
  // 새 게임 설정 마법사를 연다(상대 선택 → 로컬/온라인 또는 AI 난이도·성향). 'new' 와 온라인 경고의 "계속"이 재사용.
  function openNewGameWizard(): void {
    newGameWiz = {
      step: 'opponent',
      diff: settings.aiDifficulty,
      persona: settings.personaBrown,
      aiSide: settings.aiSide,
      diffY: settings.difficultyYellow,
      personaY: settings.personaYellow,
      diffB: settings.difficultyBrown,
      personaB: settings.personaBrown,
    }
  }
  // 새 판 공통 마무리(리셋 + 자동저장). 'new' 의 리셋과 동일한 결.
  function finishNew(): void {
    notice = ''
    resetToFreshGame()
    autoSaveNow()
    newGameWiz = null
    persist()
    render()
  }
  function startLocalNew(): void {
    leaveOnlineForNew()
    settings.mode = 'hotseat'
    watchRunning = false
    rebuildAi()
    finishNew()
  }
  function startAiNew(): void {
    if (!newGameWiz) return
    leaveOnlineForNew()
    settings.mode = 'vsAi'
    settings.aiDifficulty = newGameWiz.diff
    settings.personaBrown = newGameWiz.persona
    settings.aiSide = newGameWiz.aiSide
    watchRunning = false
    rebuildAi()
    finishNew()
    maybeScheduleAi() // 사람 후공(aiSide='yellow')이면 AI 가 선공으로 첫 수를 둔다. 사람 선공이면 가드만.
  }
  function startWatchNew(): void {
    if (!newGameWiz) return
    leaveOnlineForNew()
    settings.mode = 'watch'
    settings.difficultyYellow = newGameWiz.diffY
    settings.personaYellow = newGameWiz.personaY
    settings.difficultyBrown = newGameWiz.diffB
    settings.personaBrown = newGameWiz.personaB
    watchRunning = true // 관전은 바로 시작(두 AI 자동 진행)
    rebuildAi()
    finishNew()
    maybeScheduleAi()
  }

  function clearAiTimer(): void {
    if (aiTimer !== null) {
      clearTimeout(aiTimer)
      aiTimer = null
    }
    aiThinking = false
  }

  // AI 차례면 잠시 뒤 한 수를 둔다. 단일 타이머 + aiThinking 가드로 중복 예약 방지.
  // 패스 규칙으로 같은 AI가 연속으로 둘 수 있어, applyAndAdvance 끝에서 재호출된다.
  function maybeScheduleAi(): void {
    if (state.phase !== 'playing') return
    if (!aiControls(state.turn) || aiThinking) return
    // 관전 모드는 ▶(시작)을 눌러야 진행, 모드 선택만으로 바로 시작하지 않는다.
    if (settings.mode === 'watch' && !watchRunning) return
    const ai = aiForTurn(state.turn)
    if (ai === null) return
    aiThinking = true
    render() // "생각 중" 표시 + 입력 잠금
    // 관전 모드는 사용자가 정한 간격으로 천천히, vs AI 는 짧게.
    const delay = settings.mode === 'watch' ? settings.watchDelay : AI_DELAY_MS
    aiTimer = window.setTimeout(() => {
      aiTimer = null
      aiThinking = false
      try {
        const mv = ai.chooseMove(state)
        // 적용 전 합법성 확인, 불법수면 applyAndAdvance 가 history 를 오염시키며 throw 해
        // "생각 중"에서 영구 정지하던 버그를 막는다(이론상 엔진이 합법수를 보장하지만 방어).
        if (!validateMove(state, mv).ok) throw new Error('AI returned an illegal move')
        // 전문가 난이도면 결정적 수에 해설을 단다(적용 전 상태로 분석).
        const note = aiDifficultyFor(state.turn) === 'expert' ? analyzeMove(state, mv) : null
        applyAndAdvance(mv) // 여기서 aiComment 가 비워지므로
        if (note) {
          aiComment = NOTE_TEXT[note] // 적용 후 다시 채우고 한 번 더 렌더
          render()
        }
      } catch {
        message = 'AI가 둘 곳을 찾지 못했어요. 무르기나 새 게임을 눌러 주세요.'
        render()
      }
    }, delay)
  }

  function onHexClick(h: Hex): void {
    if (inputLocked()) return
    if (draft === null) return
    const player = state.turn
    if (draft.stage === 'chooseAction') return

    if (draft.stage === 'tile') {
      if (draft.action === 'tileAndPiece') {
        if (!isTilePlaceable(state.board, h)) return
        draft = { stage: 'piece', action: 'tileAndPiece', tile: h }
        message = ''
        render()
        return
      }
      if (draft.first === undefined) {
        if (!isTilePlaceable(state.board, h)) return
        draft = { stage: 'tile', action: 'twoTiles', first: h }
        message = ''
        render()
        return
      }
      if (hexEquals(h, draft.first)) return
      if (!isTilePlaceable(withTile(state.board, draft.first, player), h)) return
      applyAndAdvance({ type: 'twoTiles', first: draft.first, second: h })
      return
    }

    const board2 =
      draft.action === 'tileAndPiece' && draft.tile !== undefined
        ? withTile(state.board, draft.tile, player)
        : state.board
    const placement = { at: h, kind: pieceKind }
    const v = validatePiecePlacement(board2, player, state.supplies[player], placement)
    if (!v.ok) {
      message = v.reason
      sound.invalid()
      render()
      return
    }
    if (draft.action === 'tileAndPiece' && draft.tile !== undefined) {
      applyAndAdvance({ type: 'tileAndPiece', tile: draft.tile, piece: placement })
    } else {
      applyAndAdvance({ type: 'pieceOnly', piece: placement })
    }
  }

  // ---- 렌더링 ---------------------------------------------------------------

  function makeHexPolygon(
    center: Point,
    opts: {
      fill: string
      stroke: string
      strokeWidth: number
      opacity?: number
      dash?: boolean
      filter?: string
      cls?: string
      size?: number // 기본 HEX_SIZE. 작게 주면 칸 안쪽에 작은 육각(벌집 셀 윤곽 등).
      interactive?: boolean
      onClick?: () => void
    },
  ): SVGPolygonElement {
    const poly = document.createElementNS(SVGNS, 'polygon')
    poly.setAttribute('points', hexPolygonPoints(center, opts.size ?? HEX_SIZE))
    poly.setAttribute('fill', opts.fill)
    poly.setAttribute('stroke', opts.stroke)
    poly.setAttribute('stroke-width', String(opts.strokeWidth))
    if (opts.opacity !== undefined) poly.setAttribute('opacity', String(opts.opacity))
    if (opts.dash) poly.setAttribute('stroke-dasharray', '4 3')
    if (opts.filter) poly.setAttribute('filter', opts.filter)
    if (opts.cls) poly.setAttribute('class', opts.cls)
    if (opts.interactive === false) poly.style.pointerEvents = 'none'
    if (opts.onClick) {
      poly.style.cursor = 'pointer'
      const cb = opts.onClick
      poly.addEventListener('click', () => {
        if (!dragMoved) cb()
      })
    }
    return poly
  }

  function render(): void {
    // 복기 중이면 과거 국면을 본다(보기 전용 오버레이, 실제 상태는 그대로).
    const replaying = replayIndex !== null
    const viewState: GameState = replaying ? timeline()[replayIndex!]! : state
    const viewLast: Move | null = replaying
      ? replayIndex! >= 1
        ? moveLog[replayIndex! - 1]!
        : null
      : lastMove
    const player = state.turn
    const lastKeys = viewLast ? new Set(moveCells(viewLast).map(hexKey)) : new Set<string>()

    let provisionalFirst: Hex | undefined
    let provisionalTile: Hex | undefined
    let expectingTile = false
    if (draft !== null && draft.stage === 'tile') {
      expectingTile = true
      if (draft.action === 'twoTiles') provisionalFirst = draft.first
    } else if (draft !== null && draft.stage === 'piece' && draft.action === 'tileAndPiece') {
      provisionalTile = draft.tile
    }
    const frontierBoard = provisionalFirst ? withTile(state.board, provisionalFirst, player) : state.board
    const frontier = expectingTile ? frontierCells(frontierBoard) : []
    const pieceStage = draft !== null && draft.stage === 'piece'
    const board2 = provisionalTile ? withTile(state.board, provisionalTile, player) : state.board

    while (content.firstChild) content.removeChild(content.firstChild)

    // 0) 옅은 벌집 무늬 배경(은은한 honeycomb, 비인터랙티브). 솔리드 테두리 + 미세한 꿀빛 채움.
    //    다크 모드면 어두운 톤으로(보드 빈 영역까지 함께 어둡게 — .game.dark 배경과 어울리게).
    const bgDark = settings.darkMode
    for (const h of BG_HEXES) {
      content.appendChild(
        makeHexPolygon(hexToPixel(h), {
          fill: bgDark ? '#221d15' : '#fbf3de',
          stroke: bgDark ? '#39301f' : '#e3cf9c',
          strokeWidth: 1,
          opacity: bgDark ? 0.6 : 0.5,
          interactive: false,
        }),
      )
    }

    // 1) 프론티어(타일 놓을 자리), 더 또렷한 점선
    for (const f of frontier) {
      content.appendChild(
        makeHexPolygon(hexToPixel(f), {
          fill: theme.tile[player].mid,
          stroke: theme.tile[player].stroke,
          strokeWidth: 1.2,
          opacity: 0.22,
          dash: true,
          onClick: () => onHexClick(f),
        }),
      )
    }

    // 2) 타일(평면 — 두께/3D 롤백, 가시성 우선)
    for (const key of Object.keys(viewState.board)) {
      const cell = viewState.board[key]!
      const h = hexFromKey(key)
      content.appendChild(
        makeHexPolygon(hexToPixel(h), {
          fill: `url(#wax-${cell.tile.owner})`, // 밀랍 셀 질감(돔형 음영)
          stroke: theme.tile[cell.tile.owner].stroke,
          strokeWidth: 1.5,
          cls: lastKeys.has(key) ? 'pop' : undefined,
          onClick: () => onHexClick(h),
        }),
      )
    }

    // 3) 벌집 강조 — "꿀이 고인 한 덩어리". 진영색 꿀 광택 그라데이션(위 밝음→아래 진함 = 약간 입체) +
    //    부드러운 글로우로 인접 칸들이 이어져 하나의 덩어리로 보인다(막대 외벽 폐기). 빛 반짝임은 칸마다
    //    위상을 달리해 물결치듯 흐른다. 채움은 진영색이라 노랑/갈색 구분 유지. 말은 위에 그려져 안 가림.
    const hiveOwner = new Map<string, Player>() // 타일 색은 칸마다 하나라 한 칸의 주인은 유일
    for (const hive of detectHives(viewState.board)) for (const k of hive.cells) hiveOwner.set(k, hive.owner)
    // 셀(꿀 + 입체 벽)은 정적으로 채운다. 칸을 살짝 줄여(주변 타일과 안 겹치게) 진영색 두꺼운 테두리로
    // 가시성을 확보한다. 반짝임은 아래 6.5단계에서 말 위에 광택점으로 따로 그린다.
    for (const [key, owner] of hiveOwner) {
      content.appendChild(
        makeHexPolygon(hexToPixel(hexFromKey(key)), {
          fill: `url(#honey-${owner})`,
          stroke: theme.hiveStroke[owner],
          strokeWidth: 5,
          opacity: 0.95,
          filter: 'url(#hiveGlow)',
          size: HEX_SIZE * 0.88, // 주변 타일과 겹치지 않게 살짝 줄임
          interactive: false,
        }),
      )
    }

    // 4) 잠정 타일(미확정), 점선
    for (const prov of [provisionalFirst, provisionalTile]) {
      if (!prov) continue
      content.appendChild(
        makeHexPolygon(hexToPixel(prov), {
          fill: theme.tile[player].mid,
          stroke: '#111',
          strokeWidth: 2,
          opacity: 0.6,
          dash: true,
          onClick: () => onHexClick(prov),
        }),
      )
    }

    // 4.5) 직전 수 강조, 타일은 칸 파란 점선(말 둘레 링은 말 그릴 때). + 리치 힌트
    const lpc = viewLast ? lastPieceCell(viewLast) : null
    const lastPieceKey = lpc ? hexKey(lpc) : null
    if (viewLast) {
      for (const c of lastTileCells(viewLast)) {
        const px = hexToPixel(c)
        // 직전에 놓은 타일: 흰 실선 backing 위에 굵은 파란 점선 → 어떤 타일색 위에서도 또렷하게.
        content.appendChild(
          makeHexPolygon(px, { fill: 'none', stroke: '#ffffff', strokeWidth: 5, opacity: 0.9, interactive: false }),
        )
        content.appendChild(
          makeHexPolygon(px, { fill: 'none', stroke: '#1d4ed8', strokeWidth: 3.4, dash: true, interactive: false }),
        )
      }
    }
    // 보조 표시는 두 갈래로 나뉜다(설명서엔 없는 보조, 방 설정으로 공통 적용):
    //  · 위험 경고(dangerAlerts, 기본 켜짐): 상대가 다음 한 수로 5목·막을 수 없는 벌집(상대 초읽기·사이렌).
    //  · 승리 힌트(hints, 기본 꺼짐): 내가 5목 둘 칸·내 벌집 초읽기 등 "유리" 정보.
    dangerCells = []
    winNowCells = []
    oppCountdown = null
    myCountdown = null
    if (state.phase === 'playing' && !replaying) {
      const opp = opponent(state.turn)
      // 분석은 그 판의 여왕벌 모드를 반영한다(queenEnabled). 표준 모드면 잠긴 상대 벌집 칸은 어느
      // 쪽도 둘 수 없으니 리치가 아니다 — 엔진 winningCells 의 queenAllowed 가 직접 가른다.
      if (settings.dangerAlerts) dangerCells = winningCells(state.board, opp, state.supplies[opp], settings.queen)
      if (settings.hints) winNowCells = winningCells(state.board, state.turn, state.supplies[state.turn], settings.queen)
      // 벌집 초읽기: 잠긴 벌집 위 "막을 수 없는 5목"까지 남은 수. 상대=위험 경고, 나=승리 힌트로 갈라 게이팅.
      if (settings.dangerAlerts || settings.hints) {
        for (const cd of hiveCountdowns(state.board)) {
          if (cd.owner === state.turn) {
            if (settings.hints) myCountdown = cd
          } else if (settings.dangerAlerts) oppCountdown = cd
        }
      }
      // 상대 초읽기 줄을 보드에 점선 윤곽으로 강조 — 어디가 위험한지 한눈에.
      if (oppCountdown) {
        for (const k of oppCountdown.cells) {
          content.appendChild(
            makeHexPolygon(hexToPixel(hexFromKey(k)), {
              fill: 'none',
              stroke: '#b91c1c',
              strokeWidth: 2.5,
              dash: true,
              interactive: false,
            }),
          )
        }
      }
      // 리치 칸은 "붕붕" 모션(buzz = 펄스 + 미세 진동)으로 더 눈에 띄게.
      for (const c of dangerCells) {
        content.appendChild(
          makeHexPolygon(hexToPixel(c), {
            fill: 'none',
            stroke: '#dc2626',
            strokeWidth: 3.5,
            cls: 'buzz',
            interactive: false,
          }),
        )
      }
      for (const c of winNowCells) {
        content.appendChild(
          makeHexPolygon(hexToPixel(c), {
            fill: 'none',
            stroke: '#f59e0b',
            strokeWidth: 3.5,
            cls: 'buzz',
            interactive: false,
          }),
        )
      }
    }

    // 벌집 초읽기(카운트다운)가 떠 있으면 플레이 영역 비네트를 "사이렌"으로(턴색 ↔ 빨강 천천히 번갈아).
    // 데스크탑·모바일 공통(비네트가 board-wrap ::after 라 둘 다 적용).
    boardWrap.classList.toggle('siren', state.phase === 'playing' && !!(oppCountdown || myCountdown))

    // 5) 말 놓을 수 있는 타일 강조(말 단계)
    if (pieceStage) {
      for (const key of Object.keys(board2)) {
        const h = hexFromKey(key)
        if (validatePiecePlacement(board2, player, state.supplies[player], { at: h, kind: pieceKind }).ok) {
          content.appendChild(
            makeHexPolygon(hexToPixel(h), {
              fill: 'none',
              stroke: '#16a34a',
              strokeWidth: 3,
              onClick: () => onHexClick(h),
            }),
          )
        }
      }
    }

    // 6) 말 = 실물 토큰(벌 + 원판). handoffs/bee_pieces 스펙(hifi)을 그대로 이식.
    //    스펙 좌표계: viewBox 0~200, 원판 중심 (100,100)·반지름 80. 각 말을 그룹 transform 으로
    //    게임 좌표(셀 중심 cx,cy · 반지름 DISC_R)에 매핑한다. 진영 = 원판 색(gold/brown), 벌 공통.
    //    원판 윗면 circle 에 .piece(테스트/검증이 세는 요소) + .pop. 줄무늬·꼬리는 몸통 타원에 클립.
    const DISC_R = HEX_SIZE * 0.6 // 게임 px 원판 반지름(스펙 80 → 이 값)
    const mk = (tag: string, attrs: Record<string, string | number>): SVGElement => {
      const e = document.createElementNS(SVGNS, tag)
      for (const k in attrs) e.setAttribute(k, String(attrs[k]))
      return e
    }
    // 셀 좌표 해시 → 결정적 tilt(±18°). 실물처럼 살짝 흩뿌린 느낌(랜덤 아님 → 재렌더 안정).
    const tiltFor = (k: string): number => {
      let h = 0
      for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0
      return (Math.abs(h) % 37) - 18
    }
    for (const key of Object.keys(viewState.board)) {
      const piece = viewState.board[key]!.piece
      if (!piece) continue
      const p = hexToPixel(hexFromKey(key))
      const s = DISC_R / 80 // 스펙(반지름 80) → 게임 px 스케일
      const isGold = piece.owner === 'yellow'
      const discGrad = isGold ? 'disc-gold' : 'disc-brown'
      const discBody = theme.piece[piece.owner].body
      const discSide = shade(discBody, -0.46) // 옆면(두께) 어둡게
      const discRim = shade(discBody, 0.34) // 안쪽 림 밝게
      const isQueen = piece.kind === 'queen'

      // 말 그룹: 스펙 좌표 → 셀 좌표로 매핑. 세로 기준은 원판 윗면(100)이 아니라 **바닥면(109)**을
      // 셀 중심에 둔다 — 원판 두께(기둥)를 감안해 "타일에 실제로 놓인" 느낌(윗면은 살짝 위로 솟음).
      const g = document.createElementNS(SVGNS, 'g')
      g.setAttribute('transform', `translate(${p.x - 100 * s} ${p.y - 109 * s}) scale(${s})`)
      g.style.pointerEvents = 'none'
      content.appendChild(g)
      const add = (tag: string, attrs: Record<string, string | number>, parent: SVGElement = g): SVGElement => {
        const e = mk(tag, attrs)
        parent.appendChild(e)
        return e
      }

      // --- 원판(회전 안 함) ---
      add('ellipse', { cx: 100, cy: 122, rx: 80, ry: 68, fill: '#000000', opacity: 0.16 }) // 바닥 그림자
      add('circle', { cx: 100, cy: 109, r: 80, fill: discSide }) // 옆면(두께)
      const disc = add('circle', { cx: 100, cy: 100, r: 80, fill: `url(#${discGrad})` }) // 윗면 = circle.piece
      disc.classList.add('piece')
      if (lastKeys.has(key)) disc.classList.add('pop')
      add('circle', { cx: 100, cy: 100, r: 79, fill: 'none', stroke: discRim, 'stroke-width': 2.2, opacity: 0.5 }) // 안쪽 림
      add('ellipse', { cx: 74, cy: 72, rx: 44, ry: 31, fill: '#ffffff', opacity: 0.06 }) // 좌상단 광택
      if (isQueen) add('circle', { cx: 100, cy: 100, r: 71, fill: 'none', stroke: '#cf2a1c', 'stroke-width': 2.8 }) // 여왕벌 빨간 링
      if (key === lastPieceKey) {
        // 직전에 놓은 말: 흰 링으로 대비를 주고 그 위에 굵은 파란 링 + 부드러운 점멸 → 한눈에 띄게.
        add('circle', { cx: 100, cy: 100, r: 89, fill: 'none', stroke: '#ffffff', 'stroke-width': 7, opacity: 0.95 })
        const lastRing = add('circle', { cx: 100, cy: 100, r: 89, fill: 'none', stroke: '#1d4ed8', 'stroke-width': 4.5 })
        lastRing.classList.add('last-piece-ring')
      }

      // --- 벌(그룹, tilt 적용) ---
      const bee = document.createElementNS(SVGNS, 'g')
      bee.setAttribute('transform', `rotate(${tiltFor(key)} 100 100)`)
      bee.style.pointerEvents = 'none'
      g.appendChild(bee)
      add('path', { d: 'M94 53 Q88 44 84 41', fill: 'none', stroke: '#15100a', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, bee)
      add('path', { d: 'M106 53 Q112 44 116 41', fill: 'none', stroke: '#15100a', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, bee)
      add('circle', { cx: 83, cy: 40, r: 3.4, fill: '#15100a' }, bee)
      add('circle', { cx: 117, cy: 40, r: 3.4, fill: '#15100a' }, bee)
      add('ellipse', { cx: 100, cy: 111, rx: 32, ry: 46, fill: 'url(#bee-body)', stroke: '#9a6406', 'stroke-width': 1.6 }, bee) // 몸통
      const clip = mk('g', {}) as SVGGElement
      clip.setAttribute('clip-path', 'url(#beeBodyClip)')
      bee.appendChild(clip)
      add('path', { d: 'M26 100 Q100 109 174 100', fill: 'none', stroke: '#1d150b', 'stroke-width': 11 }, clip) // 줄무늬1
      add('path', { d: 'M28 119 Q100 128 172 119', fill: 'none', stroke: '#1d150b', 'stroke-width': 11 }, clip) // 줄무늬2
      add('path', { d: 'M56 162 L56 129 Q100 138 144 129 L144 162 Z', fill: '#1d150b' }, clip) // 꼬리
      add('ellipse', { cx: 86, cy: 92, rx: 10, ry: 15, fill: '#ffffff', opacity: 0.42 }, bee) // 몸통 광택
      add('ellipse', { cx: 73, cy: 105, rx: 29, ry: 12, fill: '#fbfaf6', opacity: 0.82, stroke: '#d8c79a', 'stroke-width': 1.4, transform: 'rotate(-40 73 105)' }, bee) // 왼 날개
      add('ellipse', { cx: 127, cy: 105, rx: 29, ry: 12, fill: '#fbfaf6', opacity: 0.82, stroke: '#d8c79a', 'stroke-width': 1.4, transform: 'rotate(40 127 105)' }, bee) // 오른 날개
      add('path', { d: 'M95 88 Q75 101 53 120', fill: 'none', stroke: '#cdb988', 'stroke-width': 1, opacity: 0.6 }, bee) // 날개맥
      add('path', { d: 'M105 88 Q125 101 147 120', fill: 'none', stroke: '#cdb988', 'stroke-width': 1, opacity: 0.6 }, bee)
      add('ellipse', { cx: 100, cy: 65, rx: 20.5, ry: 17.5, fill: '#15100a' }, bee) // 머리
      add('ellipse', { cx: 93, cy: 58, rx: 7, ry: 5, fill: '#ffffff', opacity: 0.14 }, bee) // 머리 광택
      add('circle', { cx: 91, cy: 59, r: 3.9, fill: '#ffffff' }, bee) // 눈
      add('circle', { cx: 109, cy: 59, r: 3.9, fill: '#ffffff' }, bee)
      if (isQueen) {
        const crown = mk('text', { x: 100, y: 44, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 30, fill: '#ffe07a', stroke: '#7a5410', 'stroke-width': 0.6 })
        crown.textContent = '♛'
        bee.appendChild(crown)
      }
    }

    // 6.5) 벌집 꿀 표면 광택 반짝(말 위) — 작은 빛점이 칸마다 위상을 달리해 나타났다 사라지며
    //      물결치듯 반짝인다(밝아지기만 하는 펄스와 달리 "반짝"으로 읽히게). 셀 위쪽에 둬 벌과 덜 겹침.
    for (const key of hiveOwner.keys()) {
      const hk = hexFromKey(key)
      const c = hexToPixel(hk)
      const spark = document.createElementNS(SVGNS, 'circle')
      spark.setAttribute('cx', c.x.toFixed(2))
      spark.setAttribute('cy', (c.y - HEX_SIZE * 0.34).toFixed(2))
      spark.setAttribute('r', '2.4')
      spark.setAttribute('fill', '#fffdf2')
      spark.setAttribute('class', 'hive-spark')
      spark.style.animationDelay = `${(hk.q + hk.r) * 0.26}s` // 위치별 위상차 → 물결치듯 흐름
      spark.style.pointerEvents = 'none'
      content.appendChild(spark)
    }

    // 7) 승리 이펙트, 이긴 5목 라인 강조(초록 굵은 펄스). 복기에선 마지막 국면에서만.
    if (viewState.phase === 'finished' && viewState.result?.kind === 'win') {
      const line = winningLine(viewState.board)
      if (line) {
        for (const key of line.cells) {
          content.appendChild(
            makeHexPolygon(hexToPixel(hexFromKey(key)), {
              fill: 'none',
              stroke: '#16a34a',
              strokeWidth: 6,
              cls: 'pulse',
              interactive: false,
            }),
          )
        }
      }
    }

    // 3D 보드 모드: 같은 상태 + 힌트를 three.js 렌더러로(SVG 는 CSS 로 숨김). 클릭은 동일한 onHexClick.
    if (settings.board3d) {
      if (!board3dApi) {
        ensureBoard3D() // 첫 3D: three.js 동적 로드(완료 후 render 재호출). 이번 프레임은 건너뜀.
      } else {
        const pieceTargets: Hex[] = []
        if (pieceStage) {
          for (const key of Object.keys(board2)) {
            const ph = hexFromKey(key)
            if (validatePiecePlacement(board2, player, state.supplies[player], { at: ph, kind: pieceKind }).ok) pieceTargets.push(ph)
          }
        }
        const provisional: Hex[] = []
        if (provisionalFirst) provisional.push(provisionalFirst)
        if (provisionalTile) provisional.push(provisionalTile)
        const lastTiles = viewLast ? lastTileCells(viewLast) : []
        const winLine: Hex[] = []
        if (viewState.phase === 'finished' && viewState.result?.kind === 'win') {
          const wl = winningLine(viewState.board)
          if (wl) for (const wk of wl.cells) winLine.push(hexFromKey(wk))
        }
        // dangerCells/winNowCells 는 위 훈수 블록에서 채워짐(훈수 모드 아니면 빈 배열) → 2D 와 동일 조건.
        const hints: BoardHints = {
          frontier,
          pieceTargets,
          provisional,
          lastPiece: lpc,
          lastTiles,
          reachDanger: dangerCells,
          reachWin: winNowCells,
          winLine,
        }
        board3dApi.update(viewState, hints)
      }
    }

    renderChrome()
  }

  // 보드 SVG 가 아닌 "주변 UI"(패널·상태·행동바·메시지·플로팅·미니 플레이어·모달)만 다시 그린다.
  // 보드와 무관한 변경(음악·사운드·섹션 펼침)은 이것만 호출 → 보드 재생성으로 직전 수/반짝임 애니가
  // 리셋되지 않는다. dangerCells 등 보드 분석값은 보드가 안 바뀌면 이전 값이 그대로 유효하다.
  function renderChrome(): void {
    renderPanel()
    renderBoardStatus()
    renderActionBar()
    renderBoardNotes()
    renderHudFloat()
    renderMiniPlayer()
    renderModal()
    // 모달(새 게임 마법사·결과·온라인 등)이 떠 있으면 모바일 FAB·행동 버튼을 숨긴다(모달 위로 떠 글씨 가림 방지).
    gameEl.classList.toggle('modal-open', modalLayer.childElementCount > 0)
    // 복기 중에는 모바일에서 무르기·새 게임 FAB 을 숨긴다(의미 없음). 대신 행동바에 복기 컨트롤을 띄운다.
    gameEl.classList.toggle('replaying', replayIndex !== null)
    applyTurnTint() // 차례 색 비네트(공통)
    mobileShell.afterRender() // 모바일: 아코디언 접힘·하단 안내 배너 재맞춤(데스크탑 무동작)
  }

  // 게임 화면 우상단 플로팅 버튼: 새 게임·무르기(설정창 접힘 시). 미니 플레이어는 renderMiniPlayer(우하단).
  function renderHudFloat(): void {
    const showActions = panelCollapsed && replayIndex === null
    hudFloat.innerHTML = showActions
      ? `<div class="float-actions">
          <button class="cta-new" data-act="new" title="새 게임 (단축키 N)">${ICON.refresh}<span>새 게임</span><kbd>N</kbd></button>
          <button data-act="undo" ${undoEnabled() ? '' : 'disabled'} title="무르기 (단축키 U)">${ICON.undo}<span>무르기</span><kbd>U</kbd></button>
        </div>`
      : ''
    for (const btn of Array.from(hudFloat.querySelectorAll('button'))) {
      if (btn.hasAttribute('disabled')) continue
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
  }

  function fmtTime(s: number): string {
    const v = Math.max(0, Math.round(s))
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
  }
  // 셔플용: 현재와 다른 무작위 트랙 인덱스(곡 1개면 그대로). UI 계층이라 Math.random 허용.
  function randomTrackIdx(): number {
    if (BGM_TRACKS.length <= 1) return settings.bgmTrack
    let n = settings.bgmTrack
    while (n === settings.bgmTrack) n = Math.floor(Math.random() * BGM_TRACKS.length)
    return n
  }

  // 배경음악 미니 플레이어(우하단). handoffs/mini_player 스펙. 펼침=카드, 접힘=알약.
  // 실제 오디오(sound.currentTime/duration/seek)와 BGM 설정(볼륨/음소거/트랙)에 연결.
  function renderMiniPlayer(): void {
    const t = BGM_TRACKS[settings.bgmTrack]!
    const playing = sound.musicOn()
    const muted = settings.bgmVolume <= 0
    const cur = sound.currentTime()
    const dur = sound.duration()
    const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0
    const volPct = Math.round((muted ? 0 : settings.bgmVolume) * 100)
    const spin = playing ? 'mp-spin' : ''
    // SVG 아이콘(핸드오프 path). 색은 currentColor 로 CSS 가 정한다(벌 글리프만 고정 갈색).
    const I = {
      music: `<svg class="mp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 16.5V6l9-2v10.5"/><circle cx="6.6" cy="16.5" r="2.5"/><circle cx="15.6" cy="14.5" r="2.5"/></svg>`,
      chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
      bee: `<svg viewBox="0 0 24 24" fill="none" stroke="#7a560a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="14" rx="3.6" ry="4.8"/><path d="M8.6 12.6h6.8"/><path d="M9 15.8h6"/><path d="M10.1 9.6C8 7.7 6 8.2 6 9.8c0 1.4 1.9 2 3.4 1"/><path d="M13.9 9.6c2.1-1.9 4.1-1.4 4.1.2 0 1.4-1.9 2-3.4 1"/></svg>`,
      beePill: `<svg viewBox="0 0 24 24" fill="none" stroke="#7a560a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="14" rx="3.4" ry="4.6"/><path d="M8.8 12.6h6.4"/><path d="M9.2 15.6h5.6"/></svg>`,
      shuffle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h3.5l3 4"/><path d="M14.5 18H18"/><path d="M3 18h3.5l8-12H18"/><path d="M16 4l2 2-2 2"/><path d="M16 16l2 2-2 2"/></svg>`,
      prev: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 5h2v14H7z"/><path d="M19 5v14l-9-7z"/></svg>`,
      next: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M15 5h2v14h-2z"/><path d="M5 5v14l9-7z"/></svg>`,
      play: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 5v14l12-7z"/></svg>`,
      pause: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>`,
      repeat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V9a3 3 0 0 1 3-3h10"/><path d="M14 3l3 3-3 3"/><path d="M20 13v2a3 3 0 0 1-3 3H7"/><path d="M10 21l-3-3 3-3"/></svg>`,
      spkOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3l4.5 3.5V6L7 9.5Z"/><path d="M15 10a3.5 3.5 0 0 1 0 4"/><path d="M17.5 8a6.5 6.5 0 0 1 0 8"/></svg>`,
      spkX: `<svg viewBox="0 0 24 24" fill="none" stroke="#b89a55" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3l4.5 3.5V6L7 9.5Z"/><path d="M16 10l4 4"/><path d="M20 10l-4 4"/></svg>`,
    }
    const eqBars = (n: number): string => `<span class="mp-eq">${'<i></i>'.repeat(n)}</span>`
    if (musicExpanded) {
      miniHost.innerHTML = `
        <div class="mp-card">
          <div class="mp-head">
            ${I.music}<span class="mp-head-label">지금 재생 중</span>
            <button class="mp-collapse" data-act="musicCollapse" title="접기">${I.chevron}</button>
          </div>
          <div class="mp-body">
            <div class="mp-row">
              <div class="mp-art ${spin}">
                <svg viewBox="0 0 60 66" class="mp-art-hex"><polygon points="30,2 56,17 56,49 30,64 4,49 4,17" fill="url(#mphg)" stroke="#c2982f" stroke-width="2"/><polygon points="30,16 44,24.5 44,41.5 30,50 16,41.5 16,24.5" fill="none" stroke="#fff7df" stroke-width="2" opacity=".7"/><defs><linearGradient id="mphg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9d666"/><stop offset="1" stop-color="#e0a92a"/></linearGradient></defs></svg>
                <span class="mp-art-bee">${I.bee}</span>
              </div>
              <div class="mp-meta">
                <div class="mp-title">${t.title}</div>
                <div class="mp-artist">${t.artist}</div>
                ${playing ? eqBars(4) : ''}
              </div>
            </div>
            <div class="mp-seek" data-seek><div class="mp-seek-fill" style="width:${pct}%"></div><div class="mp-seek-handle" style="left:${pct}%"></div></div>
            <div class="mp-time"><span>${fmtTime(cur)}</span><span>${fmtTime(dur)}</span></div>
            <div class="mp-transport">
              <button class="mp-tbtn mp-toggle ${musicShuffle ? 'on' : ''}" data-act="musicShuffle" title="셔플">${I.shuffle}</button>
              <button class="mp-tbtn mp-side" data-act="bgmPrev" title="이전 곡">${I.prev}</button>
              <button class="mp-tbtn mp-main" data-act="toggleMusic" title="재생/정지 (M)">${playing ? I.pause : I.play}</button>
              <button class="mp-tbtn mp-side" data-act="bgmNext" title="다음 곡">${I.next}</button>
              <button class="mp-tbtn mp-toggle ${musicRepeat ? 'on' : ''}" data-act="musicRepeat" title="한 곡 반복">${I.repeat}</button>
            </div>
            <div class="mp-vol">
              <button class="mp-vbtn" data-act="muteBgm" title="${muted ? '음소거 해제' : '음소거'}">${muted ? I.spkX : I.spkOn}</button>
              <div class="mp-vol-bar" data-vol><div class="mp-vol-fill" style="width:${volPct}%"></div><div class="mp-vol-handle" style="left:${volPct}%"></div></div>
              <span class="mp-vol-label">${muted ? '음소거' : volPct + '%'}</span>
            </div>
          </div>
        </div>`
    } else {
      miniHost.innerHTML = `
        <button class="mp-pill" data-act="musicExpand" title="음악 플레이어 펼치기">
          <span class="mp-pill-disc ${spin}">${I.beePill}</span>
          <span class="mp-pill-meta">
            <span class="mp-pill-title">${t.title}</span>
            ${playing ? eqBars(3) : `<span class="mp-pill-sub">일시정지</span>`}
          </span>
          <span class="mp-pill-play" data-act="toggleMusic" title="재생/정지 (M)">${playing ? I.pause : I.play}</span>
        </button>`
    }
    for (const el of Array.from(miniHost.querySelectorAll('[data-act]'))) {
      el.addEventListener('click', (e) => {
        e.stopPropagation() // 알약 안 재생버튼이 펼침을 트리거하지 않게
        onPanelAction(el.getAttribute('data-act'))
      })
    }
    const seekBar = miniHost.querySelector('[data-seek]') as HTMLElement | null
    if (seekBar)
      dragBar(
        seekBar,
        (f) => {
          // 드래그 중: 재생은 기존 위치 그대로, 핸들만 미리보기로 따라온다(아직 seek 안 함).
          miniSeeking = true
          previewSeekUI(f)
        },
        (f) => {
          // 드롭: 그 위치로 실제 재생 위치 이동.
          miniSeeking = false
          sound.seek(f * sound.duration())
          updateMiniPlayerProgress()
        },
      )
    const volBar = miniHost.querySelector('[data-vol]') as HTMLElement | null
    if (volBar)
      dragBar(
        volBar,
        (f) => {
          // 볼륨은 드래그하는 동안 즉시 반영(소리로 바로 확인).
          settings.bgmVolume = f
          sound.setBgmVolume(f)
          updateMiniPlayerVolume()
        },
        () => persist(),
      )
  }

  // 슬라이더(진행바·볼륨) 드래그. onDrag=움직이는 동안(미리보기/즉시반영), onDrop=놓을 때(확정).
  function dragBar(bar: HTMLElement, onDrag: (f: number) => void, onDrop: (f: number) => void): void {
    const frac = (clientX: number): number => {
      const r = bar.getBoundingClientRect()
      return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    }
    bar.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      bar.setPointerCapture(e.pointerId)
      let f = frac(e.clientX)
      onDrag(f)
      const move = (ev: PointerEvent): void => {
        f = frac(ev.clientX)
        onDrag(f)
      }
      const up = (): void => {
        onDrop(f)
        bar.removeEventListener('pointermove', move)
        bar.removeEventListener('pointerup', up)
        bar.removeEventListener('pointercancel', up)
      }
      bar.addEventListener('pointermove', move)
      bar.addEventListener('pointerup', up)
      bar.addEventListener('pointercancel', up)
    })
  }

  // 진행바/시간 라벨을 비율 f 로 미리보기만(실제 seek 없이). 진행바 드래그 중 호출.
  function previewSeekUI(f: number): void {
    const pct = f * 100
    const fill = miniHost.querySelector('.mp-seek-fill') as HTMLElement | null
    const handle = miniHost.querySelector('.mp-seek-handle') as HTMLElement | null
    if (fill) fill.style.width = pct + '%'
    if (handle) handle.style.left = pct + '%'
    const times = miniHost.querySelectorAll('.mp-time span')
    if (times.length === 2) times[0]!.textContent = fmtTime(f * sound.duration())
  }

  // 진행바/시간만 부분 갱신(timeupdate 마다 — 전체 재렌더는 디스크 회전 애니를 끊는다).
  function updateMiniPlayerProgress(): void {
    if (miniSeeking) return // 드래그 중에는 미리보기 핸들을 실제 위치로 되돌리지 않는다
    const dur = sound.duration()
    const cur = sound.currentTime()
    const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0
    const fill = miniHost.querySelector('.mp-seek-fill') as HTMLElement | null
    const handle = miniHost.querySelector('.mp-seek-handle') as HTMLElement | null
    if (fill) fill.style.width = pct + '%'
    if (handle) handle.style.left = pct + '%'
    const times = miniHost.querySelectorAll('.mp-time span')
    if (times.length === 2) {
      times[0]!.textContent = fmtTime(cur)
      times[1]!.textContent = fmtTime(dur)
    }
  }
  // 볼륨 막대/라벨만 부분 갱신(드래그 중 전체 재렌더 방지).
  function updateMiniPlayerVolume(): void {
    const muted = settings.bgmVolume <= 0
    const volPct = Math.round((muted ? 0 : settings.bgmVolume) * 100)
    const fill = miniHost.querySelector('.mp-vol-fill') as HTMLElement | null
    const handle = miniHost.querySelector('.mp-vol-handle') as HTMLElement | null
    const label = miniHost.querySelector('.mp-vol-label') as HTMLElement | null
    if (fill) fill.style.width = volPct + '%'
    if (handle) handle.style.left = volPct + '%'
    if (label) label.textContent = muted ? '음소거' : volPct + '%'
  }

  // 게임 상태(누구 차례·안내·자원·점수)를 설정 패널이 아니라 보드 화면 좌상단 오버레이에 띄운다.
  // 설정 창에는 진짜 "설정"만 남기기 위함. 복기 중에는 그 수의 진행 상태를 보여준다.
  function renderBoardStatus(): void {
    if (replayIndex !== null) {
      const idx = replayIndex
      const n = moveLog.length
      const vs = timeline()[idx]!
      const sc = totalHiveScores(vs.board)
      boardStatus.innerHTML = `
        <div class="status replay">
          <div class="status-header">복기 ${idx} / ${n} 수</div>
          <div class="instruction">${describeMove(idx)}</div>
        </div>
        <div class="scores">벌집 점수 노랑 ${sc.yellow} : ${sc.brown} 갈색</div>`
      return
    }
    const sc = totalHiveScores(state.board)
    const supplyLine = (p: Player): string => {
      const s = state.supplies[p]
      const inf = state.infiniteTiles === true
      const tiles = inf ? '∞' : String(s.tiles)
      const pieces = inf ? '∞' : String(s.pieces) // 완전 무한 모드: 말도 무제한 표시
      return `${PLAYER_LABEL[p]}: 타일 ${tiles} · 말 ${pieces}${s.queenUsed ? ' · 여왕벌✓' : ''}`
    }
    let header: string
    let instruction: string
    if (state.phase === 'finished' && state.result !== undefined) {
      if (state.result.kind === 'win') {
        header = `🏆 ${PLAYER_LABEL[state.result.winner]} 승리!`
        instruction = '말 5개를 일렬로 연결했습니다.'
      } else {
        const w = state.result.winner
        header = w === 'draw' ? '무승부' : `🏆 ${PLAYER_LABEL[w]} 승리 (점수)`
        instruction = `타일 소진, 벌집 점수 노랑 ${state.result.scores.yellow} : ${state.result.scores.brown} 갈색`
      }
    } else if (aiThinking || aiControls(state.turn)) {
      header = `${PLAYER_LABEL[state.turn]} 차례`
      instruction =
        settings.mode === 'watch'
          ? watchRunning
            ? '🤖 AI끼리 관전 중…'
            : '⏸ 멈춤. ▶ 시작을 누르세요'
          : '🤖 AI가 생각 중…'
    } else {
      header = `${PLAYER_LABEL[state.turn]} 차례`
      instruction = instructionText()
    }
    // 온라인 대전이면 방 상태(대기/내 차례/상대 차례)를 맨 위에 띄운다.
    const onlineLine = online
      ? online.phase !== 'waiting' && !online.peerConnected
        ? `<div class="online-status wait-turn">⚠️ 상대 연결 끊김 · 방 ${online.roomId}</div>`
        : `<div class="online-status ${myOnlineTurn() && online.phase === 'playing' ? 'my-turn' : 'wait-turn'}">${
            online.phase === 'waiting'
              ? `🔗 방 ${online.roomId} · 상대를 기다리는 중…`
              : online.phase === 'negotiating'
                ? `🤝 방 ${online.roomId} · 선공·후공 정하는 중`
                : myOnlineTurn()
                  ? `🟢 내 차례 · 방 ${online.roomId}`
                  : `⏳ 상대 차례 · 방 ${online.roomId}`
          }</div>`
      : ''
    // 상대 표시: 누구와(난이도) 두는지 한눈에. 온라인은 onlineLine 이 이미 보여줘 생략.
    const oppLabel = online
      ? ''
      : settings.mode === 'vsAi'
        ? `vs AI · ${DIFF_LABEL[settings.aiDifficulty]} · 나 ${settings.aiSide === 'yellow' ? '🟤갈색(후공)' : '🟡노랑(선공)'}`
        : settings.mode === 'watch'
          ? `AI 관전 · 노랑 ${DIFF_LABEL[settings.difficultyYellow]} / 갈색 ${DIFF_LABEL[settings.difficultyBrown]}`
          : 'vs 사람 (로컬)'
    boardStatus.innerHTML = `
      ${onlineLine}
      ${oppLabel ? `<div class="opponent">🎮 ${oppLabel}</div>` : ''}
      <div class="status ${state.phase === 'finished' ? 'finished' : state.turn}">
        <div class="status-header">${header}</div>
        <div class="instruction">${instruction}</div>
      </div>
      ${message ? `<div class="message">⚠️ ${message}</div>` : ''}
      ${notice ? `<div class="notice">✓ ${notice}</div>` : ''}
      <div class="supplies">
        <div>${supplyLine('yellow')}</div>
        <div>${supplyLine('brown')}</div>
      </div>
      <div class="scores">벌집 점수 노랑 ${sc.yellow} : ${sc.brown} 갈색</div>`
  }

  // 인게임 메시지(경고/훈수 = 위협, 칭찬/지적 = 해설·코칭)를 보드 옆, 행동 버튼의 반대쪽에 띄운다.
  // 설정 패널이 아니라 시야 안(보드 위/아래)에 둬서 보드만 봐도 읽히게 한다.
  //  - 복기 중: 지금 보는 수의 해설(모든 모드 공통).
  //  - 실시간: 위협(리치) 경고/훈수 + AI 자기 해설 + 내 수 코칭(전문가 vs AI).
  function renderBoardNotes(): void {
    const parts: string[] = []
    if (replayIndex !== null) {
      const idx = replayIndex
      if (idx >= 1) {
        const tl = timeline()
        const note = reviewMove(tl[idx - 1]!, moveLog[idx - 1]!)
        const mover = tl[idx - 1]!.turn
        if (note) {
          parts.push(`<div class="coach-comment ${notePolarity(note)}">${PLAYER_LABEL[mover]}: ${noteLine(note)}</div>`)
        }
      }
    } else {
      if (state.phase === 'playing') {
        const qn = settings.queen
        if (winNowCells.length > 0) {
          parts.push(`<div class="reach win">✨ 여기 두면 5목 완성, 승리!</div>`)
        } else if (oppCountdown && oppCountdown.movesLeft === 1) {
          // 상대 잠긴 벌집 위 1수 = 보통 말로는 못 막는다(리치와 달리 "막으세요"가 거짓이 됨).
          parts.push(
            `<div class="reach danger">⛔ 상대 벌집 5목이 코앞! ${
              qn ? '여왕벌로만 막을 수 있어요.' : '벌집 위라 막을 수 없어요. 더 빨리 5목을 노리세요.'
            }</div>`,
          )
        } else if (dangerCells.length > 0) {
          parts.push(`<div class="reach danger">⚠️ 상대가 다음 한 수로 5목을 둘 수 있어요. 막으세요!</div>`)
        } else if (oppCountdown) {
          // 2~3수 남은 초읽기(리치보다 한발 이른 경고). 잠긴 벌집이라 사후 차단이 사실상 불가.
          parts.push(
            `<div class="reach danger">⏳ 상대 벌집 초읽기: ${oppCountdown.movesLeft}수 뒤 ${
              qn ? '5목(여왕벌로 한 번만 막을 수 있어요)' : '막을 수 없는 5목'
            }. 지금 줄을 끊거나 더 빨리 5목을 노리세요.</div>`,
          )
        }
        // 내 벌집 초읽기는 유리 정보로 별도 표시(상대 위험과 동시에 떠도 됨).
        if (myCountdown) {
          parts.push(`<div class="reach win">🍯 내 벌집 초읽기: ${myCountdown.movesLeft}수 뒤 5목!</div>`)
        }
      }
      if (aiComment) parts.push(`<div class="ai-comment">🐝 전문가: ${aiComment}</div>`)
      if (coachNote !== null && settings.mode === 'vsAi' && settings.aiDifficulty === 'expert') {
        parts.push(`<div class="coach-comment ${notePolarity(coachNote)}">🧑‍🏫 내 수: ${noteLine(coachNote)}</div>`)
      }
    }
    // 내용이 그대로면 innerHTML 을 안 건드린다. 매 render(타일/행동 선택 등)마다 새로 쓰면 같은 멘트의
    // DOM 이 재생성돼 CSS 등장 애니메이션이 다시 터져 "한 턴에 같은 멘트가 계속 새로 뜨는" 것처럼 보였음.
    const html = parts.join('')
    if (html === lastBoardNotesHtml) return
    lastBoardNotesHtml = html
    boardNotes.innerHTML = html
  }

  // 인게임 행동(①/② 선택·여왕벌로 놓기·취소)은 보드 아래 별도 바에, 설정 버튼과 분리.
  function renderActionBar(): void {
    // 모바일 복기: 이 화면에서 제일 필요한 이전/재생·멈춤/다음·종료를 행동 버튼 자리(우하단 플로팅)에 둔다.
    // (설정 시트를 열어야만 나오던 문제 수정. 복기 중엔 무르기·새 게임 FAB 은 .replaying 으로 숨긴다.)
    if (replayIndex !== null && mobileShell.active()) {
      const n = moveLog.length
      const idx = replayIndex
      const playing = replayTimer !== null
      actionBar.innerHTML = `
        <div class="ab-replay">
          <button class="ab-rep" data-act="replayPrev" ${idx <= 0 ? 'disabled' : ''} title="이전 수" aria-label="이전 수">◀</button>
          <button class="ab-rep ab-rep-play ${playing ? 'active' : ''}" data-act="replayPlay">${playing ? '⏸ 멈춤' : '▶ 재생'}</button>
          <button class="ab-rep" data-act="replayNext" ${idx >= n ? 'disabled' : ''} title="다음 수" aria-label="다음 수">▶</button>
          <button class="ab-rep ab-rep-exit" data-act="replayExit" title="복기 종료" aria-label="복기 종료">✕</button>
        </div>`
      for (const btn of Array.from(actionBar.querySelectorAll('button'))) {
        btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
      }
      return
    }
    // 모바일 관전: 행동 버튼이 없는 자리(우하단 플로팅)에 ▶/⏸ 와 속도 슬라이더를 둔다(설정 시트 안 열어도 조작).
    if (settings.mode === 'watch' && mobileShell.active() && state.phase === 'playing' && replayIndex === null) {
      actionBar.innerHTML = `
        <button class="watch-toggle ${watchRunning ? 'active' : ''}" data-act="toggleWatch">${watchRunning ? '⏸ 멈춤' : '▶ 시작'}</button>
        <div class="ab-watch-speed">
          <span class="ab-speed-ico" aria-hidden="true">⏱️</span>
          <input type="range" data-ctl="watchDelay" min="100" max="2000" step="100" value="${settings.watchDelay}" aria-label="관전 수 간격">
          <span class="ab-speed-val">${(settings.watchDelay / 1000).toFixed(1)}초</span>
        </div>`
      const toggle = actionBar.querySelector('button')
      if (toggle) toggle.addEventListener('click', () => onPanelAction('toggleWatch'))
      const slider = actionBar.querySelector('input[data-ctl="watchDelay"]') as HTMLInputElement | null
      if (slider) {
        const val = actionBar.querySelector('.ab-speed-val') as HTMLElement | null
        slider.addEventListener('input', () => {
          settings.watchDelay = Number(slider.value)
          if (val) val.textContent = `${(settings.watchDelay / 1000).toFixed(1)}초`
        })
        slider.addEventListener('change', persist)
      }
      return
    }
    if (state.phase !== 'playing' || inputLocked() || draft === null) {
      actionBar.innerHTML = ''
      return
    }
    const items: string[] = []
    if (draft.stage === 'chooseAction') {
      const allowed = allowedMoveTypes(state)
      const twoOk = allowed.includes('twoTiles')
      // ① 타일 2개를 못 쓰는 이유(첫 턴이거나 타일이 1개뿐) — 비활성 버튼에 안내.
      const twoWhy = state.moveNumber === 0 ? '첫 턴에는 타일과 말을 함께 두는 ②만 둘 수 있어요' : '타일이 1개뿐이라 타일 2개는 둘 수 없어요'
      items.push(`<span class="ab-prompt">${PLAYER_LABEL[state.turn]} 차례 · 행동 선택</span>`)
      items.push(`<button data-act="twoTiles" ${twoOk ? '' : `disabled title="${twoWhy}"`}>① 타일 2개<kbd>1</kbd></button>`)
      items.push(`<button data-act="tileAndPiece">② 타일 + 말<kbd>2</kbd></button>`)
    } else {
      items.push(`<span class="ab-prompt">${instructionText()}</span>`)
      if (draft.stage === 'piece' && settings.queen && !state.supplies[state.turn].queenUsed) {
        items.push(
          `<button data-act="queen" class="${pieceKind === 'queen' ? 'active' : ''}">${ICON.crown} 여왕벌로 놓기 ${pieceKind === 'queen' ? '✓' : ''}<kbd>Q</kbd></button>`,
        )
      }
      if (draftHasSelection()) items.push(`<button data-act="cancel">${ICON.close} 취소<kbd>Esc</kbd></button>`)
    }
    actionBar.innerHTML = items.join('')
    for (const btn of Array.from(actionBar.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
  }

  function renderModal(): void {
    // 모달 상태가 직전과 같으면 다시 그리지 않는다 — render() 가 presence/구독 등으로 자주 불려도
    // 같은 모달(특히 온라인 안내)을 매번 새로 그려 등장 애니메이션이 재시작·깜빡이던 것을 막는다.
    // 보관함(saves)은 슬롯 목록이 동적이라 가드에서 제외(항상 갱신).
    const resK = state.result
    const modalKey = newGameWiz
      ? `wiz:${newGameWiz.step}:${newGameWiz.diff}:${newGameWiz.persona}:${newGameWiz.aiSide}:${newGameWiz.diffY}:${newGameWiz.personaY}:${newGameWiz.diffB}:${newGameWiz.personaB}`
      : infoModal === 'saves'
        ? `saves:${beeTapCount}:${Math.random()}` // 동적(슬롯 목록) → 가드 안 함
        : infoModal === 'undoAsk'
          ? `undoAsk:${undoAsk ?? ''}`
          : infoModal
            ? `info:${infoModal}`
            : online && online.undoReq
              ? 'undoWait'
              : onlineMsg
                ? `msg:${onlineMsg}`
                : online && online.phase === 'negotiating'
                  ? `nego:${online.proposal ? `${online.proposal.hostSide}:${online.proposal.mine}:${online.proposal.toss ?? ''}` : 'none'}`
                  : state.phase === 'finished' && resK !== undefined && !modalDismissed
                    ? `result:${resK.kind}` // 종료 결과는 고정이라 kind 만으로 충분
                    : 'none'
    if (modalKey === lastModalKey) return
    lastModalKey = modalKey

    // 새 게임 마법사가 열려 있으면 무엇보다 우선(사용자가 직접 연 설정 흐름).
    if (newGameWiz) {
      renderNewGameWizard()
      return
    }
    // 설명 팝업(여왕벌 등)이 떠 있으면 결과 모달보다 우선 표시.
    if (infoModal === 'queen') {
      renderQueenInfo()
      return
    }
    if (infoModal === 'saves') {
      renderSavesModal()
      return
    }
    if (infoModal === 'leaveConfirm') {
      renderLeaveConfirm()
      return
    }
    if (infoModal === 'rematchAsk') {
      renderRematchAsk()
      return
    }
    if (infoModal === 'undoAsk') {
      renderUndoAsk()
      return
    }
    if (infoModal === 'newOnlineWarn') {
      renderNewOnlineWarn()
      return
    }
    if (online && online.undoReq) {
      renderUndoWait()
      return
    }
    if (onlineMsg !== null) {
      renderOnlineMsg(onlineMsg)
      return
    }
    // 매칭 후 선공/후공 협상 중이면(알림 팝업 닫은 뒤) 협상 모달을 띄운다.
    if (online && online.phase === 'negotiating') {
      renderSideNegotiate()
      return
    }
    const r = state.result
    if (state.phase !== 'finished' || r === undefined || modalDismissed) {
      modalLayer.innerHTML = ''
      return
    }
    let title: string
    let sub: string
    if (r.kind === 'win') {
      title = `🏆 ${PLAYER_LABEL[r.winner]} 승리!`
      sub = '같은 색 말 5개를 일렬로 연결했습니다.'
    } else if (r.winner === 'draw') {
      title = '🤝 무승부'
      sub = `타일 소진, 벌집 점수 노랑 ${r.scores.yellow} : ${r.scores.brown} 갈색`
    } else {
      title = `🏆 ${PLAYER_LABEL[r.winner]} 승리 (점수)`
      sub = `타일 소진, 벌집 점수 노랑 ${r.scores.yellow} : ${r.scores.brown} 갈색`
    }
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${BEE_SVG}
          <div class="modal-title">${title}</div>
          <div class="modal-sub">${sub}</div>
          <div class="modal-actions">
            ${online ? `<button class="modal-share" data-act="rematchReq">${ICON.refresh} 한 판 더(진영 교대)</button>` : `<button data-act="new">${ICON.refresh} 다시 하기</button>`}
            <button class="modal-share" data-act="shareGame" title="저장 없이 이 판 기보를 바로 공유">${ICON.share} 공유하기</button>
            <button data-act="replayEnter">${ICON.history} 복기 보기</button>
            <button data-act="closeModal">${ICON.close} 닫기</button>
          </div>
        </div>
      </div>
    `
    for (const btn of Array.from(modalLayer.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
  }

  // 여왕벌 모드 켜기 전 설명 팝업, 확인해야 켜진다(확장 규칙 안내). 외부 에셋 0.
  function renderQueenInfo(): void {
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card queen-info">
          ${QUEEN_SVG}
          <div class="modal-title">👑 여왕벌 모드 (확장 규칙)</div>
          <div class="modal-sub">숙련자용 규칙이에요. 켜면 평소보다 한 수가 더 강력해집니다.</div>
          <ul class="info-list">
            <li>게임 중 <b>딱 한 번</b>, 일반 말 대신 여왕벌을 놓을 수 있어요.</li>
            <li>여왕벌은 <b>어떤 타일 위에도</b> 놓을 수 있어요. 상대 벌집 위에도! (벌집 잠금 무시)</li>
            <li>여왕벌도 내 말이라 <b>5목(승리) 판정에 포함</b>돼요.</li>
            <li>놓을 때 행동 바의 <b>“여왕벌로 놓기”</b>(단축키 <kbd>Q</kbd>)를 눌러요.</li>
            <li>AI는 여왕벌을 쓰지 않아요(사람 전용).</li>
          </ul>
          <div class="modal-actions">
            <button data-act="queenConfirm">${ICON.check} 확인하고 켜기</button>
            <button data-act="queenCancel">${ICON.close} 취소</button>
          </div>
        </div>
      </div>
    `
    for (const btn of Array.from(modalLayer.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
  }

  function wireModalButtons(): void {
    for (const btn of Array.from(modalLayer.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
  }

  // 매칭 후 선공·후공 합의. 제안 전이면 버튼, 내가 제안했으면 대기, 상대가 제안했으면 예/아니오.
  function renderSideNegotiate(): void {
    if (!online) return
    const p = online.proposal
    // 코인토스는 "둘이 동의하면 결과 무조건 수용". 그래서 동의 전에는 결과를 양쪽 다 보여주지 않는다
    // (결과를 보고 무르는 것을 원천 차단). 동의하면 finalizeAgreement 가 결과를 알려준다.
    let body: string
    if (p === null) {
      body = `
        <div class="modal-sub">매칭 성공! 선공·후공을 정해요. 누가 먼저 둘까요?</div>
        <div class="modal-actions online-side">
          <button data-act="proposeFirst">🟡 내가 선공 · 노랑</button>
          <button data-act="proposeSecond">🟤 내가 후공 · 갈색</button>
          <button class="modal-share" data-act="proposeToss">🪙 코인토스(무작위)</button>
        </div>
        <div class="nego-hint">또는 상대가 정할 때까지 기다려요.</div>`
    } else if (p.mine) {
      const myColor = online.isHost ? p.hostSide : opposite(p.hostSide)
      body = p.toss
        ? `
        <div class="modal-sub">🪙 코인토스를 제안했어요. 상대가 동의하면 무작위로 정해지고, 그 결과는 그대로 시작돼요.<br>상대의 응답을 기다리는 중…</div>
        <div class="modal-actions">
          <button data-act="rejectSide">${ICON.close} 제안 취소</button>
        </div>`
        : `
        <div class="modal-sub">내 제안: <b>내가 ${sideLabel(myColor)}</b><br>상대의 응답을 기다리는 중…</div>
        <div class="modal-actions">
          <button data-act="rejectSide">${ICON.close} 제안 취소</button>
        </div>`
    } else {
      const myColor = online.isHost ? p.hostSide : opposite(p.hostSide)
      body = p.toss
        ? `
        <div class="modal-sub">🪙 상대가 코인토스를 제안했어요. 동의하면 무작위로 정해지고, <b>그 결과는 그대로 시작</b>돼요.</div>
        <div class="modal-actions">
          <button data-act="acceptSide">${ICON.check} 코인토스 동의</button>
          <button data-act="rejectSide">${ICON.close} 다른 방식</button>
        </div>`
        : `
        <div class="modal-sub">상대가 제안했어요. <b>당신은 ${sideLabel(myColor)}</b>.<br>이대로 시작할까요?</div>
        <div class="modal-actions">
          <button data-act="acceptSide">${ICON.check} 예, 시작</button>
          <button data-act="rejectSide">${ICON.close} 아니오</button>
        </div>`
    }
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${BEE_SVG}
          <div class="modal-title">🐝 선공·후공 정하기</div>
          ${body}
        </div>
      </div>`
    wireModalButtons()
  }

  // 상대가 "한 판 더" 요청 → 진영 바꿔 다시 시작 동의.
  function renderRematchAsk(): void {
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${BEE_SVG}
          <div class="modal-title">🔄 한 판 더?</div>
          <div class="modal-sub">상대가 한 판 더 두고 싶어해요. 진영을 바꿔 다시 시작할까요?</div>
          <div class="modal-actions">
            <button data-act="rematchYes">${ICON.refresh} 예, 한 판 더</button>
            <button data-act="rematchNo">${ICON.close} 아니오</button>
          </div>
        </div>
      </div>`
    wireModalButtons()
  }

  // 무르기 동의: 되돌릴 사람(undoAsk)의 요청을 상대(지금 차례 = 나)가 허락/거절.
  function renderUndoAsk(): void {
    const mover = undoAsk // 방금 둔 사람(되돌릴 수의 주인 = 무르기 1회를 쓰는 쪽)
    const approver = state.turn // 지금 차례 = 동의해 줄 상대
    const sub = online
      ? `상대(<b>${mover ? PLAYER_LABEL[mover] : ''}</b>)가 방금 둔 수를 무르려고 해요.<br>동의할까요? (각자 한 번만)`
      : `방금 <b>${mover ? PLAYER_LABEL[mover] : ''}</b>이 둔 수를 무릅니다.<br>상대(<b>${PLAYER_LABEL[approver]}</b>) 동의가 필요합니다. (사람끼리는 각자 한 번만)`
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${BEE_SVG}
          <div class="modal-title">↩ 무르기</div>
          <div class="modal-sub">${sub}</div>
          <div class="modal-actions">
            <button data-act="undoGrant">${ICON.check} 동의</button>
            <button data-act="undoDeny">${ICON.close} 거절</button>
          </div>
        </div>
      </div>`
    wireModalButtons()
  }

  // 온라인: 내가 무르기를 요청하고 상대 동의를 기다리는 대기 모달(취소 가능).
  function renderUndoWait(): void {
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${BEE_SVG}
          <div class="modal-title">↩ 무르기 요청함</div>
          <div class="modal-sub">상대에게 무르기를 요청했어요.<br>상대가 동의하면 한 수 물러요. 잠시 기다려 주세요.</div>
          <div class="modal-actions">
            <button data-act="undoCancelReq">${ICON.close} 요청 취소</button>
          </div>
        </div>
      </div>`
    wireModalButtons()
  }

  // 나가기 전 확인.
  function renderLeaveConfirm(): void {
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-title">방에서 나갈까요?</div>
          <div class="modal-sub">나가면 진행 중인 온라인 게임이 끝나고 상대에게도 알려져요. 내 화면은 새 게임으로 초기화됩니다.</div>
          <div class="modal-actions">
            <button data-act="leaveYes">${ICON.exit} 나가기</button>
            <button data-act="leaveNo">${ICON.check} 계속하기</button>
          </div>
        </div>
      </div>`
    wireModalButtons()
  }

  // 온라인 대전 중 "새 게임"을 누르면 방에서 나가게 되므로 먼저 경고.
  function renderNewOnlineWarn(): void {
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-title">새 게임을 시작할까요?</div>
          <div class="modal-sub">지금 온라인 대전 중이에요. 새 게임을 시작하면 이 방에서 나가게 되고 상대에게도 알려져요.<br>다시 두려면 같은 초대 링크가 필요해요.</div>
          <div class="modal-actions">
            <button data-act="newWarnYes">${ICON.refresh} 새 게임 시작</button>
            <button data-act="newWarnNo">${ICON.check} 계속 두기</button>
          </div>
        </div>
      </div>`
    wireModalButtons()
  }

  // 온라인 알림 팝업(매칭 성공·상대 모드 변경·상대 나감).
  function renderOnlineMsg(msg: string): void {
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${BEE_SVG}
          <div class="modal-sub">${msg.replace(/\n/g, '<br>')}</div>
          <div class="modal-actions">
            <button data-act="onlineMsgOk">${ICON.check} 확인</button>
          </div>
        </div>
      </div>`
    wireModalButtons()
  }

  // 새 게임 설정 마법사: 상대 선택 → (사람=로컬/온라인) / (AI·관전=난이도·성향). 온라인 경기 종료 후엔 재대결.
  function renderNewGameWizard(): void {
    const w = newGameWiz
    if (!w) return
    const optRow = (prefix: string, items: readonly string[], label: (v: string) => string, sel: string): string =>
      `<div class="ng-opts">${items
        .map((v) => `<button data-act="${prefix}:${v}" class="${v === sel ? 'active' : ''}">${label(v)}</button>`)
        .join('')}</div>`
    const diffRow = (prefix: string, sel: Difficulty): string => optRow(prefix, DIFFS, (v) => DIFF_LABEL[v as Difficulty], sel)
    const personaRow = (prefix: string, sel: Persona): string =>
      `${optRow(prefix, PERSONAS, (v) => PERSONA_LABEL[v as Persona], sel)}<div class="ng-desc">${PERSONA_DESC[sel]}</div>`
    let inner = ''
    if (w.step === 'opponent') {
      const rematch =
        online && state.phase === 'finished'
          ? `<button class="ng-rematch" data-act="ngRematch">🔄 방금 상대와 재대결(한 판 더)</button>`
          : ''
      inner = `
        <div class="modal-title">🐝 새 게임</div>
        <div class="modal-sub">누구와 둘까요?</div>
        ${rematch}
        <div class="ng-choices">
          <button data-act="ngOpp:human">${ICON.people} 사람과</button>
          <button data-act="ngOpp:ai">${ICON.ai} AI와 대결</button>
          <button data-act="ngOpp:watch">${ICON.view} AI 관전</button>
        </div>
        <div class="modal-actions"><button data-act="ngCancel">${ICON.close} 취소</button></div>`
    } else if (w.step === 'humanWhere') {
      inner = `
        <div class="modal-title">👥 사람과</div>
        <div class="modal-sub">어디서 둘까요?</div>
        <div class="ng-choices">
          <button data-act="ngWhere:local">📱 한 기기에서 번갈아</button>
          <button data-act="ngWhere:online" ${mpEnabled ? '' : 'disabled title="온라인 기능이 설정되지 않았어요"'}>🔗 온라인으로</button>
        </div>
        <div class="modal-actions"><button data-act="ngBack">← 뒤로</button></div>`
    } else if (w.step === 'online') {
      inner = `
        <div class="modal-title">🔗 온라인 대전</div>
        <div class="modal-sub">방을 만들어 초대하거나, 받은 코드로 입장해요.</div>
        <div class="ng-choices">
          <button data-act="ngHost">${ICON.plus} 방 만들기 (초대 링크 복사)</button>
          <button data-act="ngJoin">${ICON.enter} 초대 코드 입력</button>
        </div>
        <div class="modal-actions"><button data-act="ngBack">← 뒤로</button></div>`
    } else if (w.step === 'ai') {
      // 내 색 = AI 색의 반대. brown=AI 면 내가 노랑(선공), yellow=AI 면 내가 갈색(후공·연습).
      const myColorRow = `<div class="ng-opts">
        <button data-act="ngSide:brown" class="${w.aiSide === 'brown' ? 'active' : ''}">🟡 노랑 · 선공</button>
        <button data-act="ngSide:yellow" class="${w.aiSide === 'yellow' ? 'active' : ''}">🟤 갈색 · 후공</button>
      </div>`
      // 전문가는 성향을 무시(항상 최선)하므로 성향 선택을 숨기고 안내만 보여준다.
      const personaBlock =
        w.diff === 'expert'
          ? `<div class="ng-desc">전문가는 늘 최선의 수를 둬서 성향(공격형·수비형 등)을 따르지 않아요.</div>`
          : `<div class="ng-label">성향</div>${personaRow('ngPersona', w.persona)}`
      inner = `
        <div class="modal-title">🤖 AI와 대결</div>
        <div class="modal-sub">내 색과 난이도를 골라요. (갈색을 고르면 후공 연습)</div>
        <div class="ng-label">내 색</div>${myColorRow}
        <div class="ng-label">난이도</div>${diffRow('ngDiff', w.diff)}
        ${personaBlock}
        <div class="modal-actions"><button data-act="ngBack">← 뒤로</button><button class="ng-start" data-act="ngStartAi">시작 🐝</button></div>`
    } else {
      inner = `
        <div class="modal-title">👀 AI 관전</div>
        <div class="modal-sub">두 AI의 난이도와 성향을 골라요.</div>
        <div class="ng-side-label">🟡 노랑</div>
        <div class="ng-label">난이도</div>${diffRow('ngDiffY', w.diffY)}
        <div class="ng-label">성향</div>${personaRow('ngPersonaY', w.personaY)}
        <div class="ng-side-label">🟤 갈색</div>
        <div class="ng-label">난이도</div>${diffRow('ngDiffB', w.diffB)}
        <div class="ng-label">성향</div>${personaRow('ngPersonaB', w.personaB)}
        <div class="modal-actions"><button data-act="ngBack">← 뒤로</button><button class="ng-start" data-act="ngStartWatch">시작 🐝</button></div>`
    }
    modalLayer.innerHTML = `<div class="modal-backdrop"><div class="modal-card ng-card">${inner}</div></div>`
    wireModalButtons()
  }

  // 저장 보관함: 여러 슬롯 목록(불러오기·공유코드 복사·삭제) + 현재 판 저장/복사 + 코드 가져오기.
  function renderSavesModal(): void {
    const slots = listSlots()
    const rows =
      slots.length === 0
        ? '<div class="saves-empty">저장된 기보가 없어요. “현재 판 저장”을 눌러 보세요.</div>'
        : slots
            .map(
              (s) => `<div class="save-row">
                <span class="save-name">${s.name}</span>
                <button data-act="loadSlot:${s.id}" title="이 기보 불러오기">${ICON.download} 불러오기</button>
                <button class="save-icon" data-act="exportSlot:${s.id}" title="공유 코드 복사">📋</button>
                <button class="save-icon" data-act="delSlot:${s.id}" title="삭제">🗑</button>
              </div>`,
            )
            .join('')
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card saves-card">
          <button class="tut-skip" data-act="closeSaves" title="닫기">닫기 ✕</button>
          <div class="modal-title">💾 저장 보관함</div>
          <div class="saves-top">
            <button data-act="saveGame">＋ 현재 판 저장</button>
            <button data-act="exportCurrent" title="현재 판 공유 코드 복사">📤 현재 판 복사</button>
            <button data-act="importGame" title="코드를 붙여넣어 불러오기">📥 코드로 가져오기</button>
          </div>
          <div class="saves-list">${rows}</div>
          <p class="saves-hint">📋 = 공유 코드 복사. 그 코드를 붙여넣어 다른 사람과 기보를 주고받거나 분석을 맡길 수 있어요.</p>
        </div>
      </div>
    `
    for (const btn of Array.from(modalLayer.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
  }

  // 복기 "이 판 분석" 요약 HTML. 기보를 analyzeGame 으로 분석해 결정적 순간을 리스트로(클릭=그 수로 점프).
  function replayAnalysisHtml(currentIdx: number): string {
    if (moveLog.length === 0) return ''
    const review = analyzeGame(timeline()[0]!, moveLog)
    const decisive = [...review.blunders, ...review.highlights].sort((a, b) => a.index - b.index)
    const cy = review.counts.yellow
    const cb = review.counts.brown
    const list =
      decisive.length === 0
        ? `<div class="ra-empty">눈에 띄는 결정적 순간은 없었어요.</div>`
        : `<div class="ra-list">${decisive
            .map(
              (r) =>
                `<button class="ra-item ${r.polarity} ${r.index === currentIdx ? 'cur' : ''}" data-jump="${r.index}">` +
                `<span class="ra-idx">${r.index}수</span> ${PLAYER_LABEL[r.player]} ${noteLine(r.note)}</button>`,
            )
            .join('')}</div>`
    return `
      <div class="replay-analysis">
        <div class="ra-title">이 판 분석</div>
        <div class="ra-counts">
          <span>🟡 노랑 <b class="good">좋은 수 ${cy.good}</b> · <b class="bad">실수 ${cy.bad}</b></span>
          <span>🟤 갈색 <b class="good">좋은 수 ${cb.good}</b> · <b class="bad">실수 ${cb.bad}</b></span>
        </div>
        ${list}
      </div>`
  }

  function renderReplayPanel(idx: number): void {
    const n = moveLog.length
    const playing = replayTimer !== null
    const disPrev = idx <= 0 ? 'disabled' : ''
    const disNext = idx >= n ? 'disabled' : ''
    // 이 수의 해설(✓/✗)은 보드 옆 board-notes 에 띄운다(renderBoardNotes). 보드만 봐도 읽히게.
    panel.innerHTML = `
      <h2>🐝 복기</h2>
      <div class="replay-nav">
        <button data-act="replayFirst" ${disPrev} title="처음으로">⏮</button>
        <button data-act="replayPrev" ${disPrev} title="이전 수">◀</button>
        <button data-act="replayPlay" class="${playing ? 'active' : ''}">${playing ? '⏸ 멈춤' : '▶ 재생'}</button>
        <button data-act="replayNext" ${disNext} title="다음 수">▶</button>
        <button data-act="replayLast" ${disNext} title="마지막으로">⏭</button>
      </div>
      <div class="sc-slider">
        <span class="sc-label">진행</span>
        <input type="range" data-ctl="replaySeek" min="0" max="${n}" step="1" value="${idx}">
        <span class="sc-val">${idx}/${n}</span>
      </div>
      <button class="replay-exit" data-act="replayExit">복기 종료 ✕</button>
      <p class="hint">◀ ▶ 한 수씩 · ▶재생 자동 진행(관전 간격 적용) · 파란 강조 = 그 수</p>
      ${replayAnalysisHtml(idx)}
    `
    for (const btn of Array.from(panel.querySelectorAll('button'))) {
      if (btn.hasAttribute('data-jump')) continue // 분석 요약 항목은 아래에서 별도 처리
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
    // 분석 요약 항목 클릭 → 그 수로 점프(보기 전용)
    for (const el of Array.from(panel.querySelectorAll('[data-jump]'))) {
      el.addEventListener('click', () => {
        stopReplayTimer()
        replayIndex = Number(el.getAttribute('data-jump'))
        render()
      })
    }
    const seek = panel.querySelector('input[data-ctl="replaySeek"]') as HTMLInputElement | null
    if (seek) {
      const val = seek.nextElementSibling as HTMLElement | null
      seek.addEventListener('input', () => {
        if (val) val.textContent = `${Number(seek.value)}/${n}` // 끄는 동안 숫자만 갱신
      })
      seek.addEventListener('change', () => {
        stopReplayTimer()
        replayIndex = Number(seek.value)
        render()
      })
    }
  }

  function renderPanel(): void {
    if (replayIndex !== null) {
      renderReplayPanel(replayIndex)
      return
    }
    // 게임 상태(차례·안내·자원·점수)는 보드 좌상단 오버레이(renderBoardStatus)로 옮겼다 — 패널엔 설정만.

    // 게임이 진행 중(첫 수 이후)이면 게임 규칙·AI 설정(모드/난이도/성향/여왕벌/무한)을 바꿀 수 없다.
    // 진행 중 변경은 자원·승패 일관성을 깨므로(무한 모드 토글 시 타일 수가 꼬이던 문제 포함) 새 게임에서만.
    const live = state.phase === 'playing' && state.moveNumber > 0
    const lockTitle = '게임 중에는 바꿀 수 없어요. 새 게임에서 설정하세요'

    // 모드·난이도·AI 성향은 모두 새 게임 마법사에서만 설정한다(설정창에선 메뉴/탭 제거).
    // 온라인 대전 컨트롤: 키가 설정돼 있을 때만(mpEnabled). 방 안이면 초대 링크/나가기, 밖이면 만들기/입장.
    const onlineCtl = !mpEnabled
      ? ''
      : online
        ? `<div class="settings-divider"></div>
        <div class="settings-group-label">온라인 대전 · 방 ${online.roomId}</div>
        <button data-act="onlineCopyLink" title="초대 링크를 복사해 상대에게 보내기">${ICON.share} 초대 링크 복사</button>
        <button data-act="onlineLeave">${ICON.exit} 나가기</button>`
        : `<div class="settings-divider"></div>
        <div class="settings-group-label">온라인 대전</div>
        <button data-act="onlineHost" title="방을 만들어 초대 링크로 친구를 부르기">${ICON.plus} 방 만들기</button>
        <button data-act="onlineJoin" title="받은 방 코드로 입장">${ICON.enter} 코드로 입장</button>`
    const gameGrid = `
      <div class="settings-grid">
        ${live ? `<div class="lock-note">게임 중에는 게임 설정을 바꿀 수 없어요. 새 게임에서 설정하세요.</div>` : ''}
        <button data-act="toggleQueen" class="${settings.queen ? 'active' : ''}" ${live ? 'disabled' : ''} title="${live ? lockTitle : '여왕벌 모드(확장)'}">${ICON.crown} 여왕벌 모드</button>
        <button data-act="toggleInfinite" class="${settings.infiniteTiles ? 'active' : ''}" ${live ? 'disabled' : ''} title="${live ? lockTitle : '타일·말 제한 없이 플레이(말 5목으로만 승부)'}">${ICON.infinity} 무한 모드</button>
        <button data-act="undo" ${undoEnabled() ? '' : 'disabled'}>${ICON.undo} 무르기<kbd>U</kbd></button>
        <button data-act="replayEnter" ${moveLog.length > 0 ? '' : 'disabled'}>${ICON.history} 복기</button>
        <button data-act="new" class="cta-new">${ICON.refresh} 새 게임<kbd>N</kbd></button>
        <button data-act="shareGame" title="저장 없이 지금 판 기보를 바로 공유">${ICON.share} 공유하기</button>
        <button data-act="saveGame" title="지금 판을 보관함에 저장">${ICON.save} 저장</button>
        <button data-act="openSaves" title="저장한 기보 보관함(불러오기·공유·삭제)">${ICON.saves} 보관함</button>
        ${onlineCtl}
      </div>`
    const viewGrid = `
      <div class="settings-grid">
        <button data-act="cycleTheme" ${settings.board3d ? 'disabled' : ''} title="${settings.board3d ? '3D 모드에선 색 테마가 적용되지 않아요' : theme.desc}">${ICON.theme} 테마: ${theme.label}</button>
        <button data-act="toggleDark" class="${settings.darkMode ? 'active' : ''}" title="페이지 전체를 어둡게(눈 편하게)">${ICON.moon} 다크 모드</button>
        <button data-act="toggle3d" class="${settings.board3d ? 'active' : ''}" title="보드를 3D(three.js)로 표시">${ICON.cube3d} 3D 보드</button>
        <button data-act="toggleActionPos" title="행동 버튼을 보드 위/아래 중 어디에 둘지">${ICON.keyboard} 행동 버튼 ${settings.actionBarPos === 'top' ? '⬆ 위' : '⬇ 아래'}</button>
        <button data-act="toggleDanger" class="${settings.dangerAlerts ? 'active' : ''}" title="상대가 이길 위기(다음 한 수로 5목·막을 수 없는 벌집)면 알려줘요">${ICON.warning} 위험 경고</button>
        <button data-act="toggleHints" class="${settings.hints ? 'active' : ''}" title="내가 5목 둘 칸·내 벌집 초읽기 등 유리한 정보를 보여줘요">${ICON.bulb} 승리 힌트</button>
        <button data-act="resetView" title="${settings.board3d ? '3D 카메라(시점·줌)를 처음 위치로' : '보드 확대·이동을 처음 상태로'}">${ICON.recenter} 카메라 리셋</button>
      </div>`
    const settingsSummary =
      settings.mode === 'hotseat'
        ? `<div class="settings-summary">🎮 ${MODE_LABEL.hotseat} (${online ? '온라인' : '로컬'})</div>`
        : settings.mode === 'watch'
          ? `<div class="settings-summary">🎮 ${MODE_LABEL.watch} · 노랑 <b>${DIFF_LABEL[settings.difficultyYellow]}</b> / 갈색 <b>${DIFF_LABEL[settings.difficultyBrown]}</b></div>`
          : `<div class="settings-summary">🎮 ${MODE_LABEL[settings.mode]} · 난이도 <b>${DIFF_LABEL[settings.aiDifficulty]}</b></div>`

    // 관전: ▶시작/⏸멈춤 + 색깔별 난이도·성향(+설명) + 수 간격. vsAi: 상대(갈색) 성향(+설명).
    const personaOpts = (sel: Persona): string =>
      PERSONAS.map((p) => `<option value="${p}" ${p === sel ? 'selected' : ''}>${PERSONA_LABEL[p]}</option>`).join('')
    const diffOpts = (sel: Difficulty): string =>
      DIFFS.map((dd) => `<option value="${dd}" ${dd === sel ? 'selected' : ''}>${DIFF_LABEL[dd]}</option>`).join('')
    const sideRow = (icon: string, diffCtl: string, persona: Persona): string => `
      <div class="persona-row">
        <span class="pr-label">${icon}</span>
        <select data-ctl="difficulty${diffCtl}" aria-label="${icon} 난이도" ${live ? 'disabled' : ''}>${diffOpts(diffCtl === 'Yellow' ? settings.difficultyYellow : settings.difficultyBrown)}</select>
        <select data-ctl="persona${diffCtl}" aria-label="${icon} 성향" ${live ? 'disabled' : ''}>${personaOpts(persona)}</select>
      </div>
      <div class="persona-desc">${PERSONA_LABEL[persona]}: ${PERSONA_DESC[persona]}</div>`
    let aiCtl = ''
    if (settings.mode === 'watch') {
      aiCtl = `
        <div class="ai-ctl">
          <button class="watch-toggle ${watchRunning ? 'active' : ''}" data-act="toggleWatch">${watchRunning ? '⏸ 멈춤' : '▶ 시작'}</button>
          ${sideRow('🟡 노랑', 'Yellow', settings.personaYellow)}
          ${sideRow('🟤 갈색', 'Brown', settings.personaBrown)}
          <div class="sc-slider watch-speed">
            <span class="sc-label">관전 간격</span>
            <input type="range" data-ctl="watchDelay" min="100" max="2000" step="100" value="${settings.watchDelay}">
            <span class="sc-val">${(settings.watchDelay / 1000).toFixed(1)}초</span>
          </div>
        </div>`
    }
    // vs AI 성향은 새 게임 마법사에서만 설정한다(게임 중 변경 불가라 별도 탭 불필요).

    const trackOpts = BGM_TRACKS.map(
      (t, i) => `<option value="${i}" ${i === settings.bgmTrack ? 'selected' : ''}>${t.title}</option>`,
    ).join('')
    const soundCtl = `
      <div class="sound-ctl">
        <div class="sc-row">
          <button data-act="toggleMusic" class="${sound.musicOn() ? 'active' : ''}">${ICON.music} ${sound.musicOn() ? '정지' : '재생'}</button>
          <select data-ctl="bgmTrack" aria-label="배경음악 선택">${trackOpts}</select>
        </div>
        <div class="sc-slider">
          <button class="mute" data-act="muteBgm" title="음소거">${settings.bgmVolume > 0 ? ICON.soundOn : ICON.soundOff}</button>
          <span class="sc-label">BGM</span>
          <input type="range" data-ctl="bgmVol" min="0" max="100" step="10" value="${Math.round(settings.bgmVolume * 100)}">
        </div>
        <div class="sc-slider">
          <button class="mute" data-act="muteSfx" title="음소거">${settings.sfxVolume > 0 ? ICON.soundOn : ICON.soundOff}</button>
          <span class="sc-label">효과음</span>
          <input type="range" data-ctl="sfxVol" min="0" max="100" step="10" value="${Math.round(settings.sfxVolume * 100)}">
        </div>
      </div>`

    // 설정 패널 아코디언: 헤더 클릭으로 섹션 펼치기/접기(상태는 settings.sectionsOpen 에 저장).
    const section = (key: SectionKey, label: string, content: string): string => {
      const isOpen = !!settings.sectionsOpen[key]
      return `<div class="acc ${isOpen ? 'open' : ''}">
        <button class="acc-head" data-act="sec:${key}">${ICON[key] ?? ''}<span class="acc-label">${label}</span><span class="acc-caret">${isOpen ? '▾' : '▸'}</span></button>
        <div class="acc-body">${content}</div>
      </div>`
    }
    const helpRows = `
      <button class="help-tut" data-act="appHelp" title="이 앱 사용법(수 두기·설정·온라인)을 다시 봐요">${ICON.mouse} 앱 사용법 다시 보기</button>
      <button class="help-tut" data-act="tutorial" title="게임 방법을 처음부터 다시 봐요">${ICON.tutorial} 게임 규칙 다시 보기</button>
      <div class="help-row"><span class="help-ico">${ICON.trophy}</span><span>같은 진영 말 <b>5개</b>를 일렬로 연결하면 승리</span></div>
      <div class="help-row"><span class="help-ico">${ICON.honey}</span><span>타일은 기존 타일에 <b>붙여서</b> 놓기</span></div>
      <div class="help-row"><span class="help-ico">${ICON.mouse}</span><span>휠 = 확대 · 드래그 = 이동</span></div>
      <div class="help-row"><span class="help-ico">${ICON.keyboard}</span><span>화살표 = 이동 · ＋－ = 확대 · 0 = 처음 위치</span></div>`

    panel.innerHTML = `
      <button class="panel-collapse-btn" data-act="togglePanel" title="설정창 접기" aria-label="설정창 접기">◀</button>
      <h2 class="app-title" title="Be the Bee">${ICON.bee} Be the Bee</h2>
      ${settingsSummary}
      ${section('game', '게임', gameGrid)}
      ${section('view', '화면 · 설정', viewGrid)}
      ${settings.mode === 'watch' ? section('ai', '관전 설정', aiCtl) : ''}
      ${section('sound', '사운드', soundCtl)}
      ${section('help', '도움말', helpRows)}
      <div class="credit">
        <div class="credit-line">원본 보드게임: 김수민 · 김재현 · 조주현</div>
        <div class="credit-line">프로그램 구현: 김수민</div>
      </div>
      <button class="credit-feedback" data-act="feedback" title="의견·버그를 보내 주세요(설문이 새 창으로 열려요)">${ICON.message} 피드백 보내기</button>
    `

    for (const btn of Array.from(panel.querySelectorAll('button'))) {
      btn.removeAttribute('title') // 설정창 버튼 호버 시 뜨던 툴팁(각주) 제거
      if (btn.hasAttribute('disabled')) continue
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
    // 이스터에그: 제목 벌을 7번 탭하면 3D 실사 벌 ↔ 일반 스타일 토글(숨김 — 평소 메뉴엔 안 보임).
    const title = panel.querySelector('.app-title') as HTMLElement | null
    if (title) {
      title.addEventListener('click', () => {
        beeTapCount += 1
        if (beeTapCount < 7) return
        beeTapCount = 0
        settings.board3dStyle = settings.board3dStyle === 'realistic' ? 'stylized' : 'realistic'
        board3dApi?.setStyle(settings.board3dStyle)
        persist()
        notice =
          settings.board3dStyle === 'realistic'
            ? '🐝 실사 벌 모드를 찾았어요! (3D 보드에서 보여요)'
            : '일반 벌 스타일로 돌아왔어요.'
        render()
      })
    }
    const trackSel = panel.querySelector('select[data-ctl="bgmTrack"]') as HTMLSelectElement | null
    if (trackSel) {
      trackSel.addEventListener('change', () => {
        settings.bgmTrack = Number(trackSel.value)
        sound.setBgmTrack(BGM_TRACKS[settings.bgmTrack]!.file)
        persist()
        renderChrome() // 미니 플레이어 곡명 동기화(보드는 안 건드림)
      })
    }
    const bgmVol = panel.querySelector('input[data-ctl="bgmVol"]') as HTMLInputElement | null
    if (bgmVol) {
      bgmVol.addEventListener('input', () => {
        settings.bgmVolume = Number(bgmVol.value) / 100
        sound.setBgmVolume(settings.bgmVolume)
      })
      bgmVol.addEventListener('change', persist)
    }
    const sfxVol = panel.querySelector('input[data-ctl="sfxVol"]') as HTMLInputElement | null
    if (sfxVol) {
      sfxVol.addEventListener('input', () => {
        settings.sfxVolume = Number(sfxVol.value) / 100
        sound.setSfxVolume(settings.sfxVolume)
      })
      sfxVol.addEventListener('change', () => {
        sound.place('yellow') // 레벨 미리듣기
        persist()
      })
    }
    const watchDelay = panel.querySelector('input[data-ctl="watchDelay"]') as HTMLInputElement | null
    if (watchDelay) {
      const val = watchDelay.nextElementSibling as HTMLElement | null
      watchDelay.addEventListener('input', () => {
        settings.watchDelay = Number(watchDelay.value)
        if (val) val.textContent = `${(settings.watchDelay / 1000).toFixed(1)}초`
      })
      watchDelay.addEventListener('change', persist)
    }
    // AI 성향/난이도 선택, 바꾸면 해당 AI 인스턴스를 다시 만든다(진행 중 관전에도 다음 수부터 반영).
    const wirePersona = (which: 'personaYellow' | 'personaBrown'): void => {
      const sel = panel.querySelector(`select[data-ctl="${which}"]`) as HTMLSelectElement | null
      if (!sel) return
      sel.addEventListener('change', () => {
        settings[which] = sel.value as Persona
        rebuildAi()
        persist()
        renderChrome() // AI 성향은 보드와 무관 — 주변 UI 만 갱신
      })
    }
    const wireDifficulty = (which: 'difficultyYellow' | 'difficultyBrown'): void => {
      const sel = panel.querySelector(`select[data-ctl="${which}"]`) as HTMLSelectElement | null
      if (!sel) return
      sel.addEventListener('change', () => {
        settings[which] = sel.value as Difficulty
        rebuildAi()
        persist()
        renderChrome() // AI 난이도는 보드와 무관 — 주변 UI 만 갱신
      })
    }
    wirePersona('personaYellow')
    wirePersona('personaBrown')
    wireDifficulty('difficultyYellow')
    wireDifficulty('difficultyBrown')
  }

  function instructionText(): string {
    if (draft === null) return ''
    if (draft.stage === 'chooseAction') return '이번 턴 행동을 고르세요.'
    if (draft.stage === 'tile') {
      if (draft.action === 'tileAndPiece') {
        return state.moveNumber === 0
          ? '선플레이어 첫 턴입니다. 타일을 놓을 빈 칸을 클릭하세요. (타일+말)'
          : '타일을 놓을 빈 칸을 클릭하세요.'
      }
      return draft.first === undefined
        ? '첫 번째 타일을 놓을 빈 칸을 클릭하세요.'
        : '두 번째 타일을 놓을 빈 칸을 클릭하세요.'
    }
    if (draft.action === 'pieceOnly') return '더 놓을 타일이 없습니다. 말을 놓을 타일을 클릭하세요.'
    return '말을 놓을 타일을 클릭하세요. (초록 테두리가 가능한 칸)'
  }

  function draftHasSelection(): boolean {
    if (draft === null) return false
    if (draft.stage === 'tile' && draft.action === 'twoTiles' && draft.first !== undefined) return true
    if (draft.stage === 'piece' && draft.action === 'tileAndPiece') return true
    if (draft.stage === 'tile') return allowedMoveTypes(state).length > 1
    return false
  }

  function onPanelAction(act: string | null): void {
    if (act === null) return

    // 복기 컨트롤(보기 전용), 별도 처리 후 종료
    if (act.startsWith('replay')) {
      handleReplay(act)
      return
    }

    // 설정 패널 섹션(아코디언) 펼치기/접기
    if (act.startsWith('sec:')) {
      const k = act.slice('sec:'.length)
      if (mobileShell.handleSectionClick(k)) return // 모바일: 드릴다운(접힘·하나씩)이 처리
      settings.sectionsOpen[k] = !settings.sectionsOpen[k]
      persist()
      renderChrome() // 섹션 펼침/접힘은 패널만 — 보드 재생성 불필요
      return
    }

    // 보관함: 슬롯 불러오기/삭제/공유코드 복사
    if (act.startsWith('loadSlot:')) {
      const s = getSlot(act.slice('loadSlot:'.length))
      if (s) {
        clearAiTimer()
        stopReplayTimer()
        applySnapshot(s.snap)
        autoSaveNow()
        infoModal = null
        notice = '기보를 불러왔어요.'
      }
      render()
      return
    }
    if (act.startsWith('delSlot:')) {
      deleteSlot(act.slice('delSlot:'.length))
      render() // 보관함 모달 갱신
      return
    }
    if (act.startsWith('exportSlot:')) {
      const s = getSlot(act.slice('exportSlot:'.length))
      if (s) shareCode(encodeSnapshot(s.snap))
      return
    }

    // 새 게임 마법사: 상대 선택·난이도/성향 고르기(임시 상태만 바꾸고 다시 그림). 접두사 ng* 로 모음.
    if (newGameWiz && act.startsWith('ng')) {
      if (act === 'ngOpp:human') newGameWiz.step = 'humanWhere'
      else if (act === 'ngOpp:ai') newGameWiz.step = 'ai'
      else if (act === 'ngOpp:watch') newGameWiz.step = 'watch'
      else if (act === 'ngWhere:online') newGameWiz.step = 'online'
      else if (act === 'ngWhere:local') {
        startLocalNew()
        return
      } else if (act.startsWith('ngDiffY:')) newGameWiz.diffY = act.slice('ngDiffY:'.length) as Difficulty
      else if (act.startsWith('ngDiffB:')) newGameWiz.diffB = act.slice('ngDiffB:'.length) as Difficulty
      else if (act.startsWith('ngDiff:')) newGameWiz.diff = act.slice('ngDiff:'.length) as Difficulty
      else if (act.startsWith('ngPersonaY:')) newGameWiz.personaY = act.slice('ngPersonaY:'.length) as Persona
      else if (act.startsWith('ngPersonaB:')) newGameWiz.personaB = act.slice('ngPersonaB:'.length) as Persona
      else if (act.startsWith('ngPersona:')) newGameWiz.persona = act.slice('ngPersona:'.length) as Persona
      else if (act.startsWith('ngSide:')) newGameWiz.aiSide = act.slice('ngSide:'.length) as Player
      else if (act === 'ngBack') newGameWiz.step = newGameWiz.step === 'online' ? 'humanWhere' : 'opponent'
      else if (act === 'ngCancel') newGameWiz = null
      else if (act === 'ngRematch') {
        newGameWiz = null
        requestRematch()
        return
      } else if (act === 'ngHost') {
        newGameWiz = null
        void createOnlineRoom()
        return
      } else if (act === 'ngJoin') {
        const code = window.prompt('받은 방 코드를 입력하세요 (예: ABC234)')
        if (code && code.trim()) {
          newGameWiz = null // 입력했을 때만 마법사 닫고 입장(취소면 온라인 화면 유지)
          void joinOnline(code)
        } else render()
        return
      } else if (act === 'ngStartAi') {
        startAiNew()
        return
      } else if (act === 'ngStartWatch') {
        startWatchNew()
        return
      }
      render()
      return
    }

    switch (act) {
      case 'twoTiles':
        if (!allowedMoveTypes(state).includes('twoTiles')) break // 첫 턴·타일1개면 불가(버튼 비활성)
        draft = { stage: 'tile', action: 'twoTiles' }
        break
      case 'tileAndPiece':
        if (!allowedMoveTypes(state).includes('tileAndPiece')) break
        draft = { stage: 'tile', action: 'tileAndPiece' }
        break
      case 'queen':
        pieceKind = pieceKind === 'queen' ? 'normal' : 'queen'
        break
      case 'cancel':
        message = ''
        startTurn()
        break
      case 'undo':
        if (history.length === 0) break
        if (online) {
          // 온라인: 내가 방금 둔 수(=지금 상대 차례)만 무를 수 있다. 상대 동의 필요, 각자 1회.
          if (online.phase !== 'playing') break
          if (state.turn === online.mySide) {
            notice = '내 차례에는 무를 수 없어요. 내가 둔 직후(상대 차례)에 무르기를 요청하세요.'
            break
          }
          if (undoUsed[online.mySide]) {
            notice = '무르기를 이미 썼어요(각자 한 번만).'
            break
          }
          if (online.undoReq) break // 이미 요청 중
          online.undoReq = true
          online.conn.signal('undoReq', { side: online.mySide }) // 상대 화면에 동의 모달
          break
        }
        if (settings.mode === 'hotseat') {
          // 사람끼리: 직전에 둔 사람(되돌릴 사람)이 요청자, 지금 차례가 동의자. 각자 1회 한정.
          const requester = opponent(state.turn)
          if (undoUsed[requester]) {
            notice = `${PLAYER_LABEL[requester]}는 무르기를 이미 썼어요(사람끼리는 한 사람당 1회).`
            break
          }
          undoAsk = requester
          infoModal = 'undoAsk' // 상대 동의를 받는 모달
          break
        }
        doUndo()
        break
      case 'undoGrant':
        if (online) {
          // 온라인 동의: 되돌리기는 요청자가 수행+스냅샷 push 하고, 나는 구독으로 동기화된다(이중 되돌리기 방지).
          online.conn.signal('undoOk')
          undoAsk = null
          infoModal = null
          break
        }
        if (undoAsk !== null) {
          undoUsed[undoAsk] = true
          undoAsk = null
          infoModal = null
          doUndo()
        }
        break
      case 'undoDeny':
        if (online) {
          online.conn.signal('undoNo')
        }
        undoAsk = null
        infoModal = null
        notice = '무르기를 거절했어요.'
        break
      case 'undoCancelReq':
        // 온라인: 요청자가 대기 중 취소 → 상대 모달도 닫게 신호.
        if (online && online.undoReq) {
          online.undoReq = false
          online.conn.signal('undoCancel')
          notice = '무르기 요청을 취소했어요.'
        }
        break
      case 'closeModal':
        modalDismissed = true
        break
      case 'toggleHints':
        settings.hints = !settings.hints
        break
      case 'toggleDanger':
        settings.dangerAlerts = !settings.dangerAlerts
        notice = settings.dangerAlerts ? '위험 경고 ON' : '위험 경고 OFF'
        break
      case 'toggle3d':
        settings.board3d = !settings.board3d
        applyBoard3D()
        break
      case 'toggleQueen':
        if (settings.queen) {
          // 끄기는 즉시(설명 불필요). 현재 판의 분석(리치/카운트다운)도 모드를 반영하도록 state 갱신.
          settings.queen = false
          if (pieceKind === 'queen') pieceKind = 'normal'
          state = { ...state, queenEnabled: false }
          if (online) pushOnline() // 온라인: 상대에게 모드 변경 반영(상대 화면에 팝업)
        } else {
          // 켜기 전 설명 팝업, 확인해야 켜진다
          infoModal = 'queen'
        }
        break
      case 'queenConfirm':
        settings.queen = true
        state = { ...state, queenEnabled: true } // 현재 판에도 즉시 반영
        infoModal = null
        if (online) pushOnline()
        break
      case 'queenCancel':
        infoModal = null
        break
      case 'toggleInfinite':
        // 게임 진행 중에는 패널에서 버튼이 잠겨(disabled) 여기 도달하지 않는다 → 첫 수 전(설정 단계)에만 반영.
        settings.infiniteTiles = !settings.infiniteTiles
        state = { ...state, infiniteTiles: settings.infiniteTiles }
        notice = settings.infiniteTiles ? '무한 모드 ON, 타일·말 무제한' : '무한 모드 OFF'
        if (online) pushOnline()
        break
      case 'toggleActionPos':
        settings.actionBarPos = settings.actionBarPos === 'top' ? 'bottom' : 'top'
        applyActionBarPos()
        break
      case 'toggleDark':
        settings.darkMode = !settings.darkMode
        applyDark()
        break
      case 'cycleTheme': {
        if (settings.board3d) break // 3D 모드는 색 테마 미적용(버튼도 비활성). 벌 스타일은 숨은 이스터에그.
        const i = COLOR_THEMES.findIndex((t) => t.id === theme.id)
        theme = COLOR_THEMES[(i + 1) % COLOR_THEMES.length]!
        settings.themeId = theme.id
        applyThemeColors()
        break
      }
      case 'toggleWatch':
        // 관전 시작/멈춤. 끌 때는 예약된 다음 수 취소(끝의 maybeScheduleAi 가드가 재시작 막음).
        watchRunning = !watchRunning
        if (!watchRunning) clearAiTimer()
        break
      case 'saveGame':
        addSlot(slotName(), snapshot())
        notice = '보관함에 저장했어요.'
        break
      case 'openSaves':
        infoModal = 'saves'
        break
      case 'closeSaves':
        infoModal = null
        break
      case 'exportCurrent':
        shareCode(encodeSnapshot(snapshot()))
        break
      case 'shareGame':
        // 결과 모달의 "공유하기" — 저장/불러오기 없이 현재 판 기보를 클립보드에 바로 복사.
        shareCode(encodeSnapshot(snapshot()))
        break
      case 'onlineHost':
        if (!mpEnabled) {
          onlineMsg = '온라인 기능이 아직 설정되지 않았어요.'
          break
        }
        void createOnlineRoom() // 진영은 상대 입장 후 협상으로 정함
        break
      case 'proposeFirst':
        proposeSide('first')
        break
      case 'proposeSecond':
        proposeSide('second')
        break
      case 'proposeToss':
        proposeSide('toss')
        break
      case 'acceptSide':
        acceptProposal()
        break
      case 'rejectSide':
        rejectProposal()
        break
      case 'onlineJoin': {
        const code = window.prompt('받은 방 코드를 입력하세요 (예: ABC234)')
        if (code && code.trim()) void joinOnline(code)
        break
      }
      case 'onlineLeave':
        infoModal = 'leaveConfirm' // 나가기 전 확인 창
        break
      case 'leaveYes':
        doLeaveOnline()
        break
      case 'leaveNo':
        infoModal = null
        break
      case 'closeInfo':
        infoModal = null
        break
      case 'onlineCopyLink':
        if (online) shareCode(inviteUrl(online.roomId))
        break
      case 'onlineMsgOk':
        onlineMsg = null
        break
      case 'rematchReq':
        requestRematch()
        break
      case 'rematchYes':
        if (online) online.conn.signal('rematchOk')
        startRematch()
        break
      case 'rematchNo':
        if (online) online.conn.signal('rematchNo')
        infoModal = null
        break
      case 'importGame': {
        const code = window.prompt('기보 코드를 붙여넣으세요 (BTB1:... )')
        const s = code ? decodeSnapshot(code) : null
        if (code && !s) {
          notice = ''
          message = '코드를 알아볼 수 없어요. 전체를 정확히 붙여넣었는지 확인하세요.'
        } else if (s) {
          clearAiTimer()
          stopReplayTimer()
          applySnapshot(s)
          autoSaveNow()
          infoModal = null
          // 받은 기보는 분석이 목적 — 바로 복기(해설)로 진입해 한 수씩 평가를 볼 수 있게.
          // (복기 종료를 누르면 마지막 국면으로 가 이어서 둘 수도 있다.)
          if (s.moveLog.length > 0) {
            handleReplay('replayEnter')
            return
          }
          notice = '기보를 불러왔어요.'
        }
        break
      }
      case 'toggleMusic':
        sound.toggleMusic()
        break
      case 'bgmNext':
      case 'bgmPrev': {
        const dir = act === 'bgmNext' ? 1 : -1
        settings.bgmTrack = (settings.bgmTrack + dir + BGM_TRACKS.length) % BGM_TRACKS.length
        sound.setBgmTrack(BGM_TRACKS[settings.bgmTrack]!.file) // 재생 중이면 새 곡으로 즉시 전환(persist/render 는 아래 공통)
        break
      }
      case 'musicExpand':
        musicExpanded = true
        break
      case 'musicCollapse':
        musicExpanded = false
        break
      case 'musicShuffle':
        musicShuffle = !musicShuffle
        break
      case 'musicRepeat':
        musicRepeat = !musicRepeat
        break
      case 'muteBgm':
        if (settings.bgmVolume > 0) {
          lastBgmVolume = settings.bgmVolume
          settings.bgmVolume = 0
        } else {
          settings.bgmVolume = lastBgmVolume || 0.4
        }
        sound.setBgmVolume(settings.bgmVolume)
        break
      case 'muteSfx':
        if (settings.sfxVolume > 0) {
          lastSfxVolume = settings.sfxVolume
          settings.sfxVolume = 0
        } else {
          settings.sfxVolume = lastSfxVolume || 0.6
        }
        sound.setSfxVolume(settings.sfxVolume)
        break
      case 'feedback':
        window.open(FEEDBACK_URL, '_blank', 'noopener') // 피드백 설문(구글폼)을 새 창으로
        return
      case 'resetView':
        if (settings.board3d) board3dApi?.resetCamera()
        else setInitialCamera()
        return
      case 'tutorial':
        if (mobileShell.active()) mobileShell.setSettings(false) // 모바일: 설정 시트를 닫아 설명이 가려지지 않게
        openTutorial(root, maybeThemeTip) // 규칙을 다시 본 뒤에도 테마 팁(처음 1회)
        return
      case 'appHelp':
        if (mobileShell.active()) mobileShell.setSettings(false)
        openOnboarding(onboardCtx())
        return
      case 'new':
        // 온라인 방에 있는 동안 새 게임을 누르면 방에서 나가게 되므로 먼저 경고한다(데스크탑·모바일 공통).
        if (online) {
          infoModal = 'newOnlineWarn'
          break
        }
        // 바로 리셋하지 않고 설정 마법사를 연다(상대 선택 → 로컬/온라인 또는 AI 난이도·성향).
        openNewGameWizard()
        break
      case 'newWarnYes': // 온라인 경고에서 "계속" → 마법사 열기(실제 이탈은 로컬/AI/관전 선택 시 leaveOnlineForNew)
        infoModal = null
        openNewGameWizard()
        break
      case 'newWarnNo': // 온라인 경고에서 "취소" → 방에 그대로 머무름
        infoModal = null
        break
      case 'togglePanel': // 데스크탑 설정창 접기/펼치기
        panelCollapsed = !panelCollapsed
        applyPanelCollapsed()
        renderHudFloat() // 접힘 상태에 따라 플로팅 새 게임·무르기 표시를 갱신
        return
      default:
        return
    }
    persist()
    // 보드와 무관한 변경(음악·사운드)은 주변 UI 만 갱신 → 보드 재생성으로 직전 수/반짝임 애니가 안 끊김.
    const chromeOnly =
      act === 'toggleMusic' ||
      act === 'muteBgm' ||
      act === 'muteSfx' ||
      act.startsWith('bgm') ||
      act.startsWith('music')
    if (chromeOnly) {
      renderChrome()
    } else {
      render()
      maybeScheduleAi()
    }
  }

  // 진행 중이던 판이 있으면 자동 복원(이어하기). 없으면 현재 설정으로 새 게임 시작.
  const resumed = loadAutoSave()
  if (resumed) applySnapshot(resumed)
  else {
    state = freshState()
    startTurn()
  }
  setInitialCamera()
  applyDark() // 저장된 다크 모드 복원
  // 미니 플레이어: 오디오 진행(timeupdate)·종료(ended)를 UI에 반영. 종료 시 반복/셔플/다음 처리.
  sound.onProgress(() => updateMiniPlayerProgress()) // 진행만 부분 갱신(전체 재렌더는 회전 애니를 끊음)
  sound.onEnded(() => {
    if (musicRepeat) {
      sound.setBgmTrack(BGM_TRACKS[settings.bgmTrack]!.file) // 같은 곡 처음부터(재로드+재생)
    } else {
      settings.bgmTrack = musicShuffle ? randomTrackIdx() : (settings.bgmTrack + 1) % BGM_TRACKS.length
      sound.setBgmTrack(BGM_TRACKS[settings.bgmTrack]!.file)
      persist()
    }
    renderMiniPlayer()
  })
  // 위험 경고가 기본 켜짐을 한 번 알린다(끌 수 있다고). 새/기존 사용자 모두 1회(전용 플래그).
  try {
    if (localStorage.getItem('be-the-bee/danger-told') !== '1') {
      notice = '위험 경고가 켜져 있어요. 상대가 이길 위기면 알려드려요. 설정 → 화면·설정에서 끌 수 있어요.'
      localStorage.setItem('be-the-bee/danger-told', '1')
    }
  } catch {
    /* 무시 */
  }
  render()
  maybeScheduleAi() // 불러온 모드가 관전이거나, 이어한 판이 AI 차례면 바로 둔다
  // 첫 접속: 앱 사용법 투어 → 게임 규칙 → 끝나면 firstRunFinish(테마 팁 + 새 게임 설정).
  // 이미 본 사용자도 저장이 없으면 firstRunFinish 로 새 게임 설정을 띄운다(maybeShowOnboarding 내부 분기).
  maybeShowOnboarding(onboardCtx(), firstRunFinish)
  // 초대 링크(#room=코드)로 들어왔으면 그 방에 자동 입장(상대로 합류, 또는 방장 본인 재접속).
  if (typeof location !== 'undefined') {
    const m = /[#&]room=([A-Za-z0-9]+)/.exec(location.hash)
    if (m) void joinOnline(m[1]!)
  }
}
