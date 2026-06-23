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
  hexKey,
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
import type { Ai, Difficulty, GameState, Hex, Move, MoveNote, Persona, PieceKind, Player } from '../engine/index'
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
import { maybeShowTutorial, openTutorial } from './tutorial'
import type { Board3D, BoardHints, PieceStyle } from './board3d' // 런타임 createBoard3D 는 3D 켤 때 동적 import

const SVGNS = 'http://www.w3.org/2000/svg'

// 진영 색(타일·말·벌집)은 컬러 테마에서 가져온다, themes.ts.
// 말 = 벌: 몸통 + 줄무늬(진영 구분 + 벌 느낌), 흰 테두리로 타일과 대비.
const PLAYER_LABEL: Record<Player, string> = { yellow: '노랑', brown: '갈색' }

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
  vsAi: 'vs AI (갈색)',
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

// 방(매치) 설정. 지금은 로컬에서 패널로 바꾸지만, 멀티플레이에서는 게임 시작 전 로비에서
// 방장이 정해 양쪽에 공통 적용되는 "방 설정"이 되도록 한 곳에 모아 둔다(직렬화 가능).
interface RoomSettings {
  mode: Mode
  aiDifficulty: Difficulty
  hints: boolean // 훈수 모드: 위험/승리 칸 힌트 표시
  queen: boolean // 여왕벌 모드(확장, 숙련자용). 기본 꺼짐. AI 는 사용 안 함
  infiniteTiles: boolean // 무한 모드(디지털 변형): 타일 제한 없음. 기본 꺼짐
  bgmTrack: number // BGM_TRACKS 인덱스
  bgmVolume: number // 0~1
  sfxVolume: number // 0~1 (0 = 효과음 끔)
  watchDelay: number // 관전 모드 수 간격(ms)
  actionBarPos: ActionBarPos // 인게임 행동 바(턴 안내+①②) 위치
  board3d: boolean // 보드를 3D(three.js)로 표시(실험). 기본 꺼짐 → 2D SVG.
  board3dStyle: PieceStyle // 3D 말 스타일: 일반(스타일 토큰) / 실사(사실적 벌)
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
  return { game: true, view: false, ai: true, sound: false, help: false }
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
    hints: false,
    queen: false,
    infiniteTiles: false,
    bgmTrack: 0,
    bgmVolume: 0.4,
    sfxVolume: 0.6,
    watchDelay: 700,
    actionBarPos: 'top',
    board3d: false,
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
  aggressive: '내 말 공격·동시 위협(포크) 우선',
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
      board3dStyle: s.board3dStyle === 'realistic' ? 'realistic' : d.board3dStyle,
      themeId: COLOR_THEMES.some((t) => t.id === s.themeId) ? (s.themeId as string) : d.themeId,
      personaYellow: PERSONAS.includes(s.personaYellow as Persona) ? (s.personaYellow as Persona) : d.personaYellow,
      personaBrown: PERSONAS.includes(s.personaBrown as Persona) ? (s.personaBrown as Persona) : d.personaBrown,
      difficultyYellow: DIFFS.includes(s.difficultyYellow as Difficulty) ? (s.difficultyYellow as Difficulty) : d.difficultyYellow,
      difficultyBrown: DIFFS.includes(s.difficultyBrown as Difficulty) ? (s.difficultyBrown as Difficulty) : d.difficultyBrown,
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
  let lastMove: Move | null = null
  let modalDismissed = false // 결과 모달 닫음 여부
  let infoModal: 'queen' | 'saves' | null = null // 팝업(여왕벌 설명/저장 보관함), 결과 모달보다 우선
  // 리치(한 수로 5목) 칸, render 가 채우고 renderPanel 이 읽는다.
  let dangerCells: Hex[] = []
  let winNowCells: Hex[] = []

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
  let openMenu: 'mode' | 'difficulty' | null = null // 모드/난이도 펼침 메뉴
  let lastBgmVolume = settings.bgmVolume || 0.35 // 뮤트 복원용
  let lastSfxVolume = settings.sfxVolume || 0.6
  // 새 게임의 초기 상태(현재 설정의 무한 모드 반영).
  const freshState = (): GameState => createInitialState({ infiniteTiles: settings.infiniteTiles })
  // 진영별 AI 인스턴스(관전은 양쪽 다른 성향·시드 → 같은 모양으로만 끝나지 않게). vsAi 는 갈색만.
  let aiYellow: Ai | null = null
  let aiBrown: Ai | null = null
  let aiThinking = false // 재진입 가드 + 입력 잠금
  let aiTimer: number | null = null
  let watchRunning = false // 관전 재생 중인지(런타임, 저장 안 함, 새로고침 시 자동 시작 방지)
  const aiControls = (turn: Player): boolean =>
    settings.mode === 'watch' || (settings.mode === 'vsAi' && turn === 'brown')
  const aiForTurn = (turn: Player): Ai | null => (turn === 'yellow' ? aiYellow : aiBrown)
  // 그 진영을 두는 AI 의 난이도(해설은 전문가일 때만). 관전은 색깔별, vsAi 는 단일.
  const aiDifficultyFor = (turn: Player): Difficulty =>
    settings.mode === 'watch' ? (turn === 'yellow' ? settings.difficultyYellow : settings.difficultyBrown) : settings.aiDifficulty
  const rebuildAi = (): void => {
    // 같은 시드면 두 AI 가 결정론적으로 같은 대국을 반복 → 시드를 진영별로 다르게.
    // 관전은 색깔별 난이도·성향, vsAi(갈색)는 단일 난이도(aiDifficulty)·성향.
    aiYellow =
      settings.mode === 'watch'
        ? createAi({ difficulty: settings.difficultyYellow, persona: settings.personaYellow, seed: 0x1111 })
        : null
    if (settings.mode === 'hotseat') {
      aiBrown = null
    } else {
      const diff = settings.mode === 'watch' ? settings.difficultyBrown : settings.aiDifficulty
      aiBrown = createAi({ difficulty: diff, persona: settings.personaBrown, seed: 0x2222 })
    }
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
  // "공유하기": 가능하면 기기 공유 시트(메신저/SNS 등)로 바로 보낸다. 없으면 클립보드 복사로 폴백.
  // 결과 모달에서 저장/불러오기 단계 없이 한 번에 기보를 전달하기 위함.
  function shareGameCode(code: string): void {
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string }) => Promise<void> }
    if (typeof nav.share === 'function') {
      // 공유 텍스트 = BTB1 코드 그대로(받는 쪽 "코드로 가져오기"가 인식). 호출은 클릭 제스처 안에서.
      nav.share({ title: 'Be the Bee 기보', text: code }).then(
        () => {
          notice = '기보를 공유했어요.'
          render()
        },
        () => shareCode(code), // 취소/미지원 → 클립보드 복사로 폴백
      )
      return
    }
    shareCode(code)
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
    openMenu = null
    clearFx()
    startTurn()
  }

  root.innerHTML = `
    <div class="game">
      <aside class="panel"></aside>
      <div class="board-wrap">
        <svg class="board" xmlns="${SVGNS}" tabindex="0">
          <defs>
            <filter id="hiveGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.95" />
            </filter>
            <radialGradient id="wax-yellow" cx="38%" cy="32%" r="75%"></radialGradient>
            <radialGradient id="wax-brown" cx="38%" cy="32%" r="75%"></radialGradient>
            <radialGradient id="bee-yellow" cx="35%" cy="28%" r="72%"></radialGradient>
            <radialGradient id="bee-brown" cx="35%" cy="28%" r="72%"></radialGradient>
            <!-- 말 입체감(테마 무관): 광원(왼쪽 위)에서 멀수록 어두워져 그림자가 오른쪽 아래에 맺힘 -->
            <radialGradient id="bee-shade" cx="32%" cy="27%" r="88%">
              <stop offset="0%" stop-color="#2a1c00" stop-opacity="0" />
              <stop offset="48%" stop-color="#2a1c00" stop-opacity="0" />
              <stop offset="100%" stop-color="#2a1c00" stop-opacity="0.3" />
            </radialGradient>
            <!-- 말(벌+원판) 에셋: design_handoff_bee_pieces 스펙. 진영=원판색, 벌 공통. -->
            <radialGradient id="disc-gold" cx="36%" cy="30%" r="80%">
              <stop offset="0%" stop-color="#dcb65e" />
              <stop offset="60%" stop-color="#d2a230" />
              <stop offset="100%" stop-color="#977523" />
            </radialGradient>
            <radialGradient id="disc-brown" cx="36%" cy="30%" r="80%">
              <stop offset="0%" stop-color="#8f6158" />
              <stop offset="60%" stop-color="#6f3529" />
              <stop offset="100%" stop-color="#50261e" />
            </radialGradient>
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
        <div class="action-bar"></div>
        <div class="board-notes"></div>
      </div>
    </div>
    <div class="modal-layer"></div>
    <div class="credit">
      <div class="credit-line">원본 보드게임: 김수민 · 김재현 · 조주현</div>
      <div class="credit-line">프로그램 구현: 김수민</div>
    </div>
  `
  const svg = root.querySelector('svg.board') as SVGSVGElement
  const content = svg.querySelector('g.content') as SVGGElement
  const fx = svg.querySelector('g.fx') as SVGGElement
  const panel = root.querySelector('.panel') as HTMLElement
  const boardWrap = root.querySelector('.board-wrap') as HTMLElement
  const actionBar = root.querySelector('.action-bar') as HTMLElement
  const boardNotes = root.querySelector('.board-notes') as HTMLElement
  const modalLayer = root.querySelector('.modal-layer') as HTMLElement

  // 3D 보드(실험): board-wrap 안에 three.js 캔버스 호스트. settings.board3d 면 SVG 대신 표시한다.
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
    cam = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, w: HEX_SIZE * 26 }
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

    // 인게임 행동 단축키 (사람 차례에만)
    if (state.phase === 'playing' && !aiThinking && !aiControls(state.turn) && draft !== null) {
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

  // 메뉴(모드/난이도) 바깥을 클릭하면 닫는다
  window.addEventListener('click', (e: MouseEvent) => {
    if (openMenu === null) return
    const t = e.target as Element | null
    if (!t || !t.closest('.menu-wrap')) {
      openMenu = null
      render()
    }
  })

  // ---- 턴/액션 상태머신 -----------------------------------------------------

  function startTurn(): void {
    pieceKind = 'normal'
    if (state.phase === 'finished') {
      draft = null
      return
    }
    const allowed = allowedMoveTypes(state)
    if (allowed.length === 1 && allowed[0] === 'tileAndPiece') draft = { stage: 'tile', action: 'tileAndPiece' }
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
        openMenu = null
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

  // 벌집 완성, 새로 잠긴 칸마다 꿀이 바닥부터 차오르는 연출(칸마다 시차).
  function spawnHoneyRise(cells: Hex[]): void {
    cells.forEach((h, i) => {
      const poly = document.createElementNS(SVGNS, 'polygon')
      poly.setAttribute('points', hexPolygonPoints(hexToPixel(h)))
      poly.setAttribute('fill', theme.hiveFill)
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
    openMenu = null
    if (state.phase === 'finished' && state.result?.kind === 'win') {
      sound.win()
      spawnWinBurst(state.board)
    } else {
      sound.place(mover)
      sparkleLastPiece(move, mover)
      // 이 수로 벌집이 새로 완성/확장됐으면 꿀 차오름 + 완성음
      const hived = newlyHivedCells(prevBoard, state.board)
      if (hived.length > 0) {
        spawnHoneyRise(hived)
        sound.hive()
      }
    }
    // 훈수 모드면 새 차례가 위협받을 때(상대가 다음 한 수로 5목 가능) 경고음
    if (settings.hints && state.phase === 'playing') {
      const opp = opponent(state.turn)
      if (winningCells(state.board, opp, state.supplies[opp]).length > 0) sound.alert()
    }
    // 관전 대결이 끝나면 자동으로 멈춤, 새 게임이 저절로 또 돌지 않게.
    if (state.phase === 'finished' && settings.mode === 'watch') watchRunning = false
    startTurn()
    autoSaveNow() // 매 수 자동 저장 → 새로고침해도 이어하기
    render()
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
    if (aiThinking || aiControls(state.turn)) return
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
      interactive?: boolean
      onClick?: () => void
    },
  ): SVGPolygonElement {
    const poly = document.createElementNS(SVGNS, 'polygon')
    poly.setAttribute('points', hexPolygonPoints(center))
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
    for (const h of BG_HEXES) {
      content.appendChild(
        makeHexPolygon(hexToPixel(h), {
          fill: '#fbf3de',
          stroke: '#e3cf9c',
          strokeWidth: 1,
          opacity: 0.5,
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

    // 3) 벌집 강조, 금색 글로우 오버레이(가시성 ↑)
    const hiveKeys = new Set<string>()
    for (const hive of detectHives(viewState.board)) for (const k of hive.cells) hiveKeys.add(k)
    for (const key of hiveKeys) {
      const h = hexFromKey(key)
      content.appendChild(
        makeHexPolygon(hexToPixel(h), {
          fill: theme.hiveFill,
          stroke: theme.hiveGlow,
          strokeWidth: 4.5,
          opacity: 0.55,
          filter: 'url(#hiveGlow)',
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
        content.appendChild(
          makeHexPolygon(hexToPixel(c), {
            fill: 'none',
            stroke: '#2563eb',
            strokeWidth: 3,
            dash: true,
            interactive: false,
          }),
        )
      }
    }
    // 위험/승리 칸 힌트는 훈수 모드에서만(설명서엔 없는 보조, 방 설정으로 공통 적용)
    dangerCells = []
    winNowCells = []
    if (settings.hints && state.phase === 'playing' && !replaying) {
      const opp = opponent(state.turn)
      // 여왕벌 모드가 꺼져 있으면 queen 으로만 둘 수 있는 칸(잠긴 벌집)은 리치가 아니다.
      // queenUsed 를 true 로 친 사본으로 호출해 "실제로 둘 수 있는 승리 칸"만 표시한다.
      const effSupply = (p: Player): typeof state.supplies[Player] =>
        settings.queen ? state.supplies[p] : { ...state.supplies[p], queenUsed: true }
      dangerCells = winningCells(state.board, opp, effSupply(opp))
      winNowCells = winningCells(state.board, state.turn, effSupply(state.turn))
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

    // 6) 말 = 실물 토큰(벌 + 원판). design_handoff_bee_pieces 스펙(hifi)을 그대로 이식.
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
      const discSide = isGold ? '#967216' : '#3f1f17'
      const discRim = isGold ? '#ecc659' : '#9a5847'
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
      if (key === lastPieceKey) add('circle', { cx: 100, cy: 100, r: 84, fill: 'none', stroke: '#2563eb', 'stroke-width': 3.4 }) // 직전 수 파란 링

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
        const hints: BoardHints = { frontier, pieceTargets, provisional, lastPiece: lpc }
        board3dApi.update(viewState, hints)
      }
    }

    renderPanel()
    renderActionBar()
    renderBoardNotes()
    renderModal()
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
        if (winNowCells.length > 0) {
          parts.push(`<div class="reach win">✨ 여기 두면 5목 완성, 승리!</div>`)
        } else if (dangerCells.length > 0) {
          parts.push(`<div class="reach danger">⚠️ 상대가 다음 한 수로 5목을 둘 수 있어요. 막으세요!</div>`)
        }
      }
      if (aiComment) parts.push(`<div class="ai-comment">🐝 전문가: ${aiComment}</div>`)
      if (coachNote !== null && settings.mode === 'vsAi' && settings.aiDifficulty === 'expert') {
        parts.push(`<div class="coach-comment ${notePolarity(coachNote)}">🧑‍🏫 내 수: ${noteLine(coachNote)}</div>`)
      }
    }
    boardNotes.innerHTML = parts.join('')
  }

  // 인게임 행동(①/② 선택·여왕벌로 놓기·취소)은 보드 아래 별도 바에, 설정 버튼과 분리.
  function renderActionBar(): void {
    if (state.phase !== 'playing' || aiThinking || aiControls(state.turn) || draft === null) {
      actionBar.innerHTML = ''
      return
    }
    const items: string[] = []
    if (draft.stage === 'chooseAction') {
      items.push(`<span class="ab-prompt">${PLAYER_LABEL[state.turn]} 차례 · 행동 선택</span>`)
      items.push(`<button data-act="twoTiles">① 타일 2개<kbd>1</kbd></button>`)
      items.push(`<button data-act="tileAndPiece">② 타일 + 말<kbd>2</kbd></button>`)
    } else {
      items.push(`<span class="ab-prompt">${instructionText()}</span>`)
      if (draft.stage === 'piece' && settings.queen && !state.supplies[state.turn].queenUsed) {
        items.push(
          `<button data-act="queen" class="${pieceKind === 'queen' ? 'active' : ''}">여왕벌로 놓기 ${pieceKind === 'queen' ? '✓' : ''}<kbd>Q</kbd></button>`,
        )
      }
      if (draftHasSelection()) items.push(`<button data-act="cancel">취소<kbd>Esc</kbd></button>`)
    }
    actionBar.innerHTML = items.join('')
    for (const btn of Array.from(actionBar.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
  }

  function renderModal(): void {
    // 설명 팝업(여왕벌 등)이 떠 있으면 결과 모달보다 우선 표시.
    if (infoModal === 'queen') {
      renderQueenInfo()
      return
    }
    if (infoModal === 'saves') {
      renderSavesModal()
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
            <button data-act="new">다시 하기</button>
            <button class="modal-share" data-act="shareGame" title="저장 없이 이 판 기보를 바로 공유">📤 공유하기</button>
            <button data-act="replayEnter">복기 보기</button>
            <button data-act="closeModal">닫기</button>
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
            <button data-act="queenConfirm">확인하고 켜기</button>
            <button data-act="queenCancel">취소</button>
          </div>
        </div>
      </div>
    `
    for (const btn of Array.from(modalLayer.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
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
                <button data-act="loadSlot:${s.id}" title="이 기보 불러오기">불러오기</button>
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

  function renderReplayPanel(idx: number): void {
    const n = moveLog.length
    const tl = timeline()
    const vs = tl[idx]!
    const scores = totalHiveScores(vs.board)
    const playing = replayTimer !== null
    const disPrev = idx <= 0 ? 'disabled' : ''
    const disNext = idx >= n ? 'disabled' : ''
    // 이 수의 해설(✓/✗)은 보드 옆 board-notes 에 띄운다(renderBoardNotes). 보드만 봐도 읽히게.
    panel.innerHTML = `
      <h2>🐝 복기</h2>
      <div class="status replay">
        <div class="status-header">복기 ${idx} / ${n} 수</div>
        <div class="instruction">${describeMove(idx)}</div>
      </div>
      <div class="scores">벌집 점수 노랑 ${scores.yellow} : ${scores.brown} 갈색</div>
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
    `
    for (const btn of Array.from(panel.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
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
    const scores = totalHiveScores(state.board)
    const supplyLine = (p: Player): string => {
      const s = state.supplies[p]
      const tiles = state.infiniteTiles ? '∞' : String(s.tiles)
      return `${PLAYER_LABEL[p]}: 타일 ${tiles} · 말 ${s.pieces}${s.queenUsed ? ' · 여왕벌✓' : ''}`
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

    // 모드/난이도는 버튼을 누르면 그 밑에 펼쳐지는 메뉴, 나머지는 토글. (보드 아래 액션 바와 분리)
    const menu = (kind: 'mode' | 'difficulty', items: string[]): string =>
      openMenu === kind ? `<div class="menu-popup">${items.join('')}</div>` : ''
    const modeMenu = menu(
      'mode',
      (['hotseat', 'vsAi', 'watch'] as Mode[]).map(
        (m) => `<button data-act="setMode:${m}" class="${settings.mode === m ? 'active' : ''}">${MODE_LABEL[m]}</button>`,
      ),
    )
    const diffMenu = menu(
      'difficulty',
      DIFFS.map(
        (d) => `<button data-act="setDiff:${d}" class="${settings.aiDifficulty === d ? 'active' : ''}">${DIFF_LABEL[d]}</button>`,
      ),
    )
    const gameGrid = `
      <div class="settings-grid">
        <div class="menu-wrap">
          <button data-act="menuMode" class="${openMenu === 'mode' ? 'open' : ''}" title="플레이 모드 바꾸기">${MODE_SHORT[settings.mode]} ▾</button>${modeMenu}
        </div>
        <div class="menu-wrap">
          <button data-act="menuDifficulty" class="${openMenu === 'difficulty' ? 'open' : ''}" ${settings.mode === 'vsAi' ? '' : 'disabled'} title="AI 난이도 바꾸기">${settings.mode === 'vsAi' ? DIFF_LABEL[settings.aiDifficulty] : '난이도'} ▾</button>${diffMenu}
        </div>
        <button data-act="toggleQueen" class="${settings.queen ? 'active' : ''}">여왕벌 모드${settings.queen ? ' ✓' : ''}</button>
        <button data-act="toggleInfinite" class="${settings.infiniteTiles ? 'active' : ''}" title="타일 보유 제한 없이 플레이(말 5목으로만 결판)">무한 모드${settings.infiniteTiles ? ' ✓' : ''}</button>
        <button data-act="undo" ${history.length > 0 && !aiThinking ? '' : 'disabled'}>무르기</button>
        <button data-act="replayEnter" ${moveLog.length > 0 ? '' : 'disabled'}>복기</button>
        <button data-act="new">새 게임</button>
        <button data-act="shareGame" title="저장 없이 지금 판 기보를 바로 공유">📤 공유하기</button>
        <button data-act="saveGame" title="지금 판을 보관함에 저장">💾 저장</button>
        <button data-act="openSaves" title="저장한 기보 보관함(불러오기·공유·삭제)">📂 보관함</button>
      </div>`
    const viewGrid = `
      <div class="settings-grid">
        <button data-act="cycleTheme" title="${settings.board3d ? '3D 벌 스타일 전환(일반/실사)' : theme.desc}">${settings.board3d ? `🐝 벌: ${settings.board3dStyle === 'realistic' ? '실사' : '일반'}` : `🎨 테마: ${theme.label}`}</button>
        <button data-act="toggle3d" class="${settings.board3d ? 'active' : ''}" title="보드를 3D로 표시(실험)">🧊 3D 보드${settings.board3d ? ' ✓' : ''}</button>
        <button data-act="toggleActionPos" title="행동 버튼을 보드 위/아래 중 어디에 둘지">행동 버튼 ${settings.actionBarPos === 'top' ? '⬆ 위' : '⬇ 아래'}</button>
        <button data-act="toggleHints" class="${settings.hints ? 'active' : ''}">훈수${settings.hints ? ' ✓' : ''}</button>
        <button data-act="resetView" title="${settings.board3d ? '3D 카메라(시점·줌)를 처음 위치로' : '보드 확대·이동을 처음 상태로'}">카메라 리셋</button>
      </div>`
    const settingsSummary =
      settings.mode === 'hotseat'
        ? `<div class="settings-summary">🎮 ${MODE_LABEL.hotseat}</div>`
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
        <select data-ctl="difficulty${diffCtl}" aria-label="${icon} 난이도">${diffOpts(diffCtl === 'Yellow' ? settings.difficultyYellow : settings.difficultyBrown)}</select>
        <select data-ctl="persona${diffCtl}" aria-label="${icon} 성향">${personaOpts(persona)}</select>
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
    } else if (settings.mode === 'vsAi') {
      aiCtl = `
        <div class="ai-ctl">
          <div class="persona-row"><span class="pr-label">AI 성향</span><select data-ctl="personaBrown" aria-label="AI 성향">${personaOpts(settings.personaBrown)}</select></div>
          <div class="persona-desc">${PERSONA_LABEL[settings.personaBrown]}: ${PERSONA_DESC[settings.personaBrown]}</div>
        </div>`
    }

    const trackOpts = BGM_TRACKS.map(
      (t, i) => `<option value="${i}" ${i === settings.bgmTrack ? 'selected' : ''}>${t.title}</option>`,
    ).join('')
    const soundCtl = `
      <div class="sound-ctl">
        <div class="sc-row">
          <button data-act="toggleMusic" class="${sound.musicOn() ? 'active' : ''}">🎵 ${sound.musicOn() ? '정지' : '재생'}</button>
          <select data-ctl="bgmTrack" aria-label="배경음악 선택">${trackOpts}</select>
        </div>
        <div class="sc-slider">
          <button class="mute" data-act="muteBgm" title="음소거">${settings.bgmVolume > 0 ? '🔊' : '🔇'}</button>
          <span class="sc-label">BGM</span>
          <input type="range" data-ctl="bgmVol" min="0" max="100" step="10" value="${Math.round(settings.bgmVolume * 100)}">
        </div>
        <div class="sc-slider">
          <button class="mute" data-act="muteSfx" title="음소거">${settings.sfxVolume > 0 ? '🔊' : '🔇'}</button>
          <span class="sc-label">효과음</span>
          <input type="range" data-ctl="sfxVol" min="0" max="100" step="10" value="${Math.round(settings.sfxVolume * 100)}">
        </div>
      </div>`

    // 설정 패널 아코디언: 헤더 클릭으로 섹션 펼치기/접기(상태는 settings.sectionsOpen 에 저장).
    const section = (key: SectionKey, label: string, content: string): string => {
      const isOpen = !!settings.sectionsOpen[key]
      return `<div class="acc ${isOpen ? 'open' : ''}">
        <button class="acc-head" data-act="sec:${key}">${label}<span class="acc-caret">${isOpen ? '▾' : '▸'}</span></button>
        <div class="acc-body">${content}</div>
      </div>`
    }
    const helpRows = `
      <button class="help-tut" data-act="tutorial" title="게임 방법을 처음부터 다시 봐요">📖 튜토리얼 다시 보기</button>
      <div class="help-row"><span class="help-ico">🏆</span><span>같은 진영 말 <b>5개</b>를 일렬로 연결하면 승리</span></div>
      <div class="help-row"><span class="help-ico">🍯</span><span>타일은 기존 타일에 <b>붙여서</b> 놓기</span></div>
      <div class="help-row"><span class="help-ico">🖱️</span><span>휠 = 확대 · 드래그 = 이동</span></div>
      <div class="help-row"><span class="help-ico">⌨️</span><span>화살표 = 이동 · ＋－ = 확대 · 0 = 처음 위치</span></div>`

    panel.innerHTML = `
      <h2>🐝 Be the Bee</h2>
      <div class="status ${state.phase === 'finished' ? 'finished' : state.turn}">
        <div class="status-header">${header}</div>
        <div class="instruction">${instruction}</div>
        ${message ? `<div class="message">⚠️ ${message}</div>` : ''}
        ${notice ? `<div class="notice">✓ ${notice}</div>` : ''}
      </div>
      <div class="supplies">
        <div>${supplyLine('yellow')}</div>
        <div>${supplyLine('brown')}</div>
      </div>
      <div class="scores">벌집 점수 노랑 ${scores.yellow} : ${scores.brown} 갈색</div>
      ${settingsSummary}
      ${section('game', '🎮 게임', gameGrid)}
      ${section('view', '👁 화면 · 설정', viewGrid)}
      ${settings.mode !== 'hotseat' ? section('ai', settings.mode === 'watch' ? '🤖 관전 설정' : '🤖 AI 설정', aiCtl) : ''}
      ${section('sound', '🔊 사운드', soundCtl)}
      ${section('help', '❓ 도움말', helpRows)}
    `

    for (const btn of Array.from(panel.querySelectorAll('button'))) {
      if (btn.hasAttribute('disabled')) continue
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
    const trackSel = panel.querySelector('select[data-ctl="bgmTrack"]') as HTMLSelectElement | null
    if (trackSel) {
      trackSel.addEventListener('change', () => {
        settings.bgmTrack = Number(trackSel.value)
        sound.setBgmTrack(BGM_TRACKS[settings.bgmTrack]!.file)
        persist()
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
        render()
      })
    }
    const wireDifficulty = (which: 'difficultyYellow' | 'difficultyBrown'): void => {
      const sel = panel.querySelector(`select[data-ctl="${which}"]`) as HTMLSelectElement | null
      if (!sel) return
      sel.addEventListener('change', () => {
        settings[which] = sel.value as Difficulty
        rebuildAi()
        persist()
        render()
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
      settings.sectionsOpen[k] = !settings.sectionsOpen[k]
      persist()
      render()
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

    // 모드/난이도 메뉴 선택
    if (act.startsWith('setMode:')) {
      stopReplayTimer()
      replayIndex = null
      clearAiTimer()
      settings.mode = act.slice('setMode:'.length) as Mode
      watchRunning = false // 관전으로 바꿔도 ▶ 를 눌러야 시작, 모드 바꿀 여유를 준다
      rebuildAi()
      openMenu = null
      message = ''
      persist()
      startTurn()
      render()
      maybeScheduleAi()
      return
    }
    if (act.startsWith('setDiff:')) {
      stopReplayTimer()
      replayIndex = null
      clearAiTimer()
      settings.aiDifficulty = act.slice('setDiff:'.length) as Difficulty
      rebuildAi()
      openMenu = null
      persist()
      render()
      maybeScheduleAi()
      return
    }

    // 메뉴 토글이 아닌 행동은 열린 메뉴를 닫는다
    if (act !== 'menuMode' && act !== 'menuDifficulty') openMenu = null

    switch (act) {
      case 'menuMode':
        openMenu = openMenu === 'mode' ? null : 'mode'
        break
      case 'menuDifficulty':
        if (settings.mode !== 'hotseat') openMenu = openMenu === 'difficulty' ? null : 'difficulty'
        break
      case 'twoTiles':
        draft = { stage: 'tile', action: 'twoTiles' }
        break
      case 'tileAndPiece':
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
        if (history.length > 0) {
          clearAiTimer()
          stopReplayTimer()
          clearFx()
          replayIndex = null
          // 사람 차례가 될 때까지 되돌린다, vs AI 에선 AI 수와 내 수를 함께 무른다.
          // (한 수만 무르면 AI 차례로 돌아가 AI 가 즉시 다시 둬 무효가 됨)
          do {
            state = history[history.length - 1]!
            history = history.slice(0, -1)
            moveLog = moveLog.slice(0, -1) // history 와 보조 맞춤
          } while (history.length > 0 && aiControls(state.turn))
          message = ''
          notice = ''
          coachNote = null
          lastMove = null
          modalDismissed = false
          openMenu = null
          startTurn()
          autoSaveNow() // 무른 결과도 이어하기에 반영
        }
        break
      case 'closeModal':
        modalDismissed = true
        break
      case 'toggleHints':
        settings.hints = !settings.hints
        break
      case 'toggle3d':
        settings.board3d = !settings.board3d
        applyBoard3D()
        break
      case 'toggleQueen':
        if (settings.queen) {
          // 끄기는 즉시(설명 불필요)
          settings.queen = false
          if (pieceKind === 'queen') pieceKind = 'normal'
        } else {
          // 켜기 전 설명 팝업, 확인해야 켜진다
          infoModal = 'queen'
        }
        break
      case 'queenConfirm':
        settings.queen = true
        infoModal = null
        break
      case 'queenCancel':
        infoModal = null
        break
      case 'toggleInfinite':
        // 무한 모드는 현재 판에도 즉시 반영(타일이 줄지/소진되지 않게). 새 게임도 설정 반영.
        settings.infiniteTiles = !settings.infiniteTiles
        state = { ...state, infiniteTiles: settings.infiniteTiles }
        notice = settings.infiniteTiles ? '무한 모드 ON — 타일 무제한' : '무한 모드 OFF — 타일 30개'
        break
      case 'toggleActionPos':
        settings.actionBarPos = settings.actionBarPos === 'top' ? 'bottom' : 'top'
        applyActionBarPos()
        break
      case 'cycleTheme': {
        if (settings.board3d) {
          // 3D 모드: 테마 버튼은 벌 스타일(일반 ↔ 실사) 전환. 색 테마는 2D 에서만.
          settings.board3dStyle = settings.board3dStyle === 'stylized' ? 'realistic' : 'stylized'
          board3dApi?.setStyle(settings.board3dStyle)
        } else {
          const i = COLOR_THEMES.findIndex((t) => t.id === theme.id)
          theme = COLOR_THEMES[(i + 1) % COLOR_THEMES.length]!
          settings.themeId = theme.id
          applyThemeColors()
        }
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
        // 결과 모달의 "공유하기" — 저장/불러오기 없이 현재 판 기보를 바로 공유(시트→복사 폴백).
        shareGameCode(encodeSnapshot(snapshot()))
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
      case 'resetView':
        if (settings.board3d) board3dApi?.resetCamera()
        else setInitialCamera()
        return
      case 'tutorial':
        openTutorial(root)
        return
      case 'new':
        clearAiTimer()
        stopReplayTimer()
        clearFx()
        replayIndex = null
        state = freshState()
        history = []
        moveLog = []
        message = ''
        notice = ''
        coachNote = null
        lastMove = null
        modalDismissed = false
        startTurn()
        autoSaveNow() // 새 게임도 이어하기 기준점으로 저장
        break
      default:
        return
    }
    persist()
    render()
    maybeScheduleAi()
  }

  // 진행 중이던 판이 있으면 자동 복원(이어하기). 없으면 현재 설정으로 새 게임 시작.
  const resumed = loadAutoSave()
  if (resumed) applySnapshot(resumed)
  else {
    state = freshState()
    startTurn()
  }
  setInitialCamera()
  render()
  maybeScheduleAi() // 불러온 모드가 관전이거나, 이어한 판이 AI 차례면 바로 둔다
  maybeShowTutorial(root) // 첫 접속이면 튜토리얼을 띄운다(한 번만, localStorage)
}
