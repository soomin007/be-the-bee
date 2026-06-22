// 핫시트 게임 UI: SVG 보드 렌더 + 클릭 입력 + 줌/팬 카메라 + 턴/액션 상태머신.
// 엔진(순수)에만 의존한다. 엔진은 이 파일을 절대 import 하지 않는다.

import {
  allowedMoveTypes,
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
  opponent,
  totalHiveScores,
  validatePiecePlacement,
  winningCells,
  winningLine,
  withTile,
} from '../engine/index'
import type { Ai, Difficulty, GameState, Hex, Move, PieceKind, Player } from '../engine/index'
import { HEX_SIZE, hexPolygonPoints, hexToPixel, type Point } from './layout'
import { createSound, BGM_TRACKS } from './sound'
import { COLOR_THEMES, DEFAULT_THEME_ID, themeById, type ColorTheme } from './themes'
import { autoSave, hasSlot, loadAutoSave, loadSlot, saveSlot, type GameSnapshot } from './game-save'

const SVGNS = 'http://www.w3.org/2000/svg'

// 진영 색(타일·말·벌집)은 컬러 테마에서 가져온다 — themes.ts.
// 말 = 벌: 몸통 + 줄무늬(진영 구분 + 벌 느낌), 흰 테두리로 타일과 대비.
const PLAYER_LABEL: Record<Player, string> = { yellow: '노랑', brown: '갈색' }

// 결과 모달 벌 마스코트(인라인 SVG — 외부 에셋 없음). .wing 은 CSS 로 펄럭.
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

// 여왕벌 설명 팝업용 마스코트 — 왕관 쓴 벌(인라인 SVG). .wing 펄럭은 BEE_SVG 와 공유.
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
const DIFF_LABEL: Record<Difficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' }
const AI_DELAY_MS = 350

// 방(매치) 설정. 지금은 로컬에서 패널로 바꾸지만, 멀티플레이에서는 게임 시작 전 로비에서
// 방장이 정해 양쪽에 공통 적용되는 "방 설정"이 되도록 한 곳에 모아 둔다(직렬화 가능).
interface RoomSettings {
  mode: Mode
  aiDifficulty: Difficulty
  hints: boolean // 훈수 모드: 위험/승리 칸 힌트 표시
  queen: boolean // 여왕벌 모드(확장 — 숙련자용). 기본 꺼짐. AI 는 사용 안 함
  bgmTrack: number // BGM_TRACKS 인덱스
  bgmVolume: number // 0~1
  sfxVolume: number // 0~1 (0 = 효과음 끔)
  watchDelay: number // 관전 모드 수 간격(ms)
  actionBarPos: ActionBarPos // 인게임 행동 바(턴 안내+①②) 위치
  themeId: string // 컬러 테마(themes.ts COLOR_THEMES 의 id)
}
function defaultSettings(): RoomSettings {
  return {
    mode: 'hotseat',
    aiDifficulty: 'medium',
    hints: false,
    queen: false,
    bgmTrack: 0,
    bgmVolume: 0.4,
    sfxVolume: 0.6,
    watchDelay: 700,
    actionBarPos: 'top',
    themeId: DEFAULT_THEME_ID,
  }
}

const SETTINGS_KEY = 'be-the-bee/settings'
const MODES: Mode[] = ['hotseat', 'vsAi', 'watch']
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard']
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
      themeId: COLOR_THEMES.some((t) => t.id === s.themeId) ? (s.themeId as string) : d.themeId,
    }
  } catch {
    return d
  }
}

function saveSettings(s: RoomSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* 사생활 모드 등 — 무시 */
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
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
  let state: GameState = createInitialState()
  let history: GameState[] = []
  let moveLog: Move[] = [] // 둔 수의 순서(history 와 보조를 맞춤) — 복기용
  let replayIndex: number | null = null // null = 실시간, 그 외 = timeline 의 그 국면을 본다
  let replayTimer: number | null = null // 복기 자동 재생 타이머
  let draft: Draft | null = null
  let pieceKind: PieceKind = 'normal'
  let message = '' // 경고(잘못된 수 등) — ⚠️ 빨강
  let notice = '' // 긍정 피드백(저장/불러오기 등) — ✓ 초록, 다음 수에 사라짐
  let lastMove: Move | null = null
  let modalDismissed = false // 결과 모달 닫음 여부
  let infoModal: 'queen' | null = null // 설명 팝업(여왕벌 등) — 떠 있으면 결과 모달보다 우선
  // 리치(한 수로 5목) 칸 — render 가 채우고 renderPanel 이 읽는다.
  let dangerCells: Hex[] = []
  let winNowCells: Hex[] = []

  let cam: Camera = { cx: 0, cy: 0, w: HEX_SIZE * 26 }
  // 포인터(마우스/터치) 추적 — 1개=팬, 2개=핀치 줌
  const pointers = new Map<number, { x: number; y: number }>()
  let dragMoved = false
  let lastX = 0
  let lastY = 0
  let pinchDist = 0

  // 방 설정 + AI 상태 (settings 자체는 유지, 필드만 바뀜 — 새 게임에도 방 설정은 유지)
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
  let ai: Ai | null = null
  let aiThinking = false // 재진입 가드 + 입력 잠금
  let aiTimer: number | null = null
  const aiControls = (turn: Player): boolean =>
    settings.mode === 'watch' || (settings.mode === 'vsAi' && turn === 'brown')
  const rebuildAi = (): void => {
    ai = settings.mode === 'hotseat' ? null : createAi({ difficulty: settings.aiDifficulty })
  }
  rebuildAi() // 불러온 모드가 vs AI/관전이면 AI 준비

  // ---- 저장/불러오기(localStorage 기보) -------------------------------------
  function snapshot(): GameSnapshot {
    return { v: 1, state, history, moveLog, mode: settings.mode, savedAt: Date.now() }
  }
  function autoSaveNow(): void {
    autoSave(snapshot())
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
          </defs>
          <g class="content"></g>
          <g class="fx" pointer-events="none"></g>
        </svg>
        <div class="action-bar"></div>
      </div>
    </div>
    <div class="modal-layer"></div>
  `
  const svg = root.querySelector('svg.board') as SVGSVGElement
  const content = svg.querySelector('g.content') as SVGGElement
  const fx = svg.querySelector('g.fx') as SVGGElement
  const panel = root.querySelector('.panel') as HTMLElement
  const boardWrap = root.querySelector('.board-wrap') as HTMLElement
  const actionBar = root.querySelector('.action-bar') as HTMLElement
  const modalLayer = root.querySelector('.modal-layer') as HTMLElement

  // 행동 바(턴 안내+①②)를 보드 위/아래로 — CSS order 로만 전환(DOM 순서는 유지).
  function applyActionBarPos(): void {
    boardWrap.classList.toggle('ab-top', settings.actionBarPos === 'top')
  }
  applyActionBarPos()

  // 컬러 테마 적용: 밀랍 그라데이션 stop 과 벌집 글로우 색을 현재 테마로 채운다.
  // (테마 변경 시 다시 호출 → render() 가 나머지 인라인 색을 다시 그린다.)
  function applyThemeColors(): void {
    for (const owner of ['yellow', 'brown'] as Player[]) {
      const grad = svg.querySelector(`#wax-${owner}`)
      if (!grad) continue
      while (grad.firstChild) grad.removeChild(grad.firstChild)
      const tc = theme.tile[owner]
      for (const [off, col] of [
        ['0%', tc.light],
        ['55%', tc.mid],
        ['100%', tc.dark],
      ] as const) {
        const s = document.createElementNS(SVGNS, 'stop')
        s.setAttribute('offset', off)
        s.setAttribute('stop-color', col)
        grad.appendChild(s)
      }
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

  // 복기 자동 재생 — watchDelay 간격으로 한 수씩 앞으로.
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

  // 복기 컨트롤(보기 전용 — state/history/moveLog 를 건드리지 않는다).
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

  // ---- 연출(fx 레이어 — render 가 지우지 않는 일회성 효과) -------------------
  function clearFx(): void {
    while (fx.firstChild) fx.removeChild(fx.firstChild)
  }

  // 착지 꽃가루 반짝 — 6방향으로 튀었다 사라지는 점.
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

  // 승리 — 5목 라인을 따라 꿀이 터지는 연출(칸마다 시차).
  function spawnWinBurst(board: GameState['board']): void {
    const line = winningLine(board)
    if (!line) return
    line.cells.forEach((k, i) => {
      window.setTimeout(() => spawnSparkle(hexToPixel(hexFromKey(k)), '#f59e0b'), i * 90)
    })
  }

  // 벌집 완성 — 새로 잠긴 칸마다 꿀이 바닥부터 차오르는 연출(칸마다 시차).
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

  // 직전 수로 새로 벌집(연속 타일선)에 편입된 칸들 — 꿀 차오름 대상.
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
    const prevBoard = state.board
    state = applyMove(state, move)
    message = ''
    notice = ''
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
    if (ai === null || state.phase !== 'playing') return
    if (!aiControls(state.turn) || aiThinking) return
    aiThinking = true
    render() // "생각 중" 표시 + 입력 잠금
    // 관전 모드는 사용자가 정한 간격으로 천천히 — vs AI 는 짧게.
    const delay = settings.mode === 'watch' ? settings.watchDelay : AI_DELAY_MS
    aiTimer = window.setTimeout(() => {
      aiTimer = null
      aiThinking = false
      try {
        applyAndAdvance(ai!.chooseMove(state))
      } catch {
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
    // 복기 중이면 과거 국면을 본다(보기 전용 오버레이 — 실제 상태는 그대로).
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

    // 0) 옅은 배경 그리드(점선, 비인터랙티브)
    const occupied = new Set(Object.keys(viewState.board))
    for (const h of BG_HEXES) {
      content.appendChild(
        makeHexPolygon(hexToPixel(h), {
          fill: 'none',
          stroke: '#c9b88f',
          strokeWidth: 0.6,
          opacity: 0.3,
          dash: true,
          interactive: false,
        }),
      )
    }

    // 1) 프론티어(타일 놓을 자리) — 더 또렷한 점선
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

    // 2) 타일
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

    // 3) 벌집 강조 — 금색 글로우 오버레이(가시성 ↑)
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
    void occupied

    // 4) 잠정 타일(미확정) — 점선
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

    // 4.5) 직전 수 강조 — 타일은 칸 파란 점선(말 둘레 링은 말 그릴 때). + 리치 힌트
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
    // 위험/승리 칸 힌트는 훈수 모드에서만(설명서엔 없는 보조 — 방 설정으로 공통 적용)
    dangerCells = []
    winNowCells = []
    if (settings.hints && state.phase === 'playing' && !replaying) {
      const opp = opponent(state.turn)
      dangerCells = winningCells(state.board, opp, state.supplies[opp])
      winNowCells = winningCells(state.board, state.turn, state.supplies[state.turn])
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

    // 6) 말 = 벌 (날개 + 몸통 + 줄무늬) + 여왕벌 왕관
    for (const key of Object.keys(viewState.board)) {
      const piece = viewState.board[key]!.piece
      if (!piece) continue
      const p = hexToPixel(hexFromKey(key))
      const r = HEX_SIZE * 0.52
      const stripe = theme.piece[piece.owner].stripe

      // 날개(몸통 뒤, 살짝 위로) — 투명한 흰 타원 2개
      for (const dir of [-1, 1]) {
        const wx = p.x + dir * r * 0.34
        const wy = p.y - r * 0.5
        const wing = document.createElementNS(SVGNS, 'ellipse')
        wing.setAttribute('cx', String(wx))
        wing.setAttribute('cy', String(wy))
        wing.setAttribute('rx', String(r * 0.3))
        wing.setAttribute('ry', String(r * 0.17))
        wing.setAttribute('fill', '#ffffff')
        wing.setAttribute('opacity', '0.8')
        wing.setAttribute('stroke', stripe)
        wing.setAttribute('stroke-width', '1')
        wing.setAttribute('transform', `rotate(${dir * 22} ${wx} ${wy})`)
        wing.style.pointerEvents = 'none'
        content.appendChild(wing)
      }

      // 몸통(.piece — 테스트/검증이 세는 요소)
      const body = document.createElementNS(SVGNS, 'circle')
      body.classList.add('piece')
      if (lastKeys.has(key)) body.classList.add('pop')
      body.setAttribute('cx', String(p.x))
      body.setAttribute('cy', String(p.y))
      body.setAttribute('r', String(r))
      body.setAttribute('fill', theme.piece[piece.owner].body)
      body.setAttribute('stroke', '#fff')
      body.setAttribute('stroke-width', '2.5')
      body.style.pointerEvents = 'none'
      content.appendChild(body)

      // 줄무늬 2줄
      for (const [yy, half] of [
        [-0.2, 0.6],
        [0.16, 0.72],
      ] as const) {
        const s = document.createElementNS(SVGNS, 'line')
        s.setAttribute('x1', String(p.x - r * half))
        s.setAttribute('y1', String(p.y + r * yy))
        s.setAttribute('x2', String(p.x + r * half))
        s.setAttribute('y2', String(p.y + r * yy))
        s.setAttribute('stroke', stripe)
        s.setAttribute('stroke-width', String(r * 0.26))
        s.setAttribute('stroke-linecap', 'round')
        s.style.pointerEvents = 'none'
        content.appendChild(s)
      }

      // 직전 수의 말은 말 둘레 파란 링으로(타일의 칸 테두리와 구분)
      if (key === lastPieceKey) {
        const ring = document.createElementNS(SVGNS, 'circle')
        ring.setAttribute('cx', String(p.x))
        ring.setAttribute('cy', String(p.y))
        ring.setAttribute('r', String(r * 1.28))
        ring.setAttribute('fill', 'none')
        ring.setAttribute('stroke', '#2563eb')
        ring.setAttribute('stroke-width', '3')
        ring.style.pointerEvents = 'none'
        content.appendChild(ring)
      }

      // 여왕벌 왕관(줄무늬 위에)
      if (piece.kind === 'queen') {
        const crown = document.createElementNS(SVGNS, 'text')
        crown.setAttribute('x', String(p.x))
        crown.setAttribute('y', String(p.y))
        crown.setAttribute('text-anchor', 'middle')
        crown.setAttribute('dominant-baseline', 'central')
        crown.setAttribute('font-size', String(r * 1.0))
        crown.setAttribute('fill', '#fff')
        crown.setAttribute('stroke', stripe)
        crown.setAttribute('stroke-width', '0.5')
        crown.style.pointerEvents = 'none'
        crown.textContent = '♛'
        content.appendChild(crown)
      }
    }

    // 7) 승리 이펙트 — 이긴 5목 라인 강조(초록 굵은 펄스). 복기에선 마지막 국면에서만.
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

    renderPanel()
    renderActionBar()
    renderModal()
  }

  // 인게임 행동(①/② 선택·여왕벌로 놓기·취소)은 보드 아래 별도 바에 — 설정 버튼과 분리.
  function renderActionBar(): void {
    if (state.phase !== 'playing' || aiThinking || aiControls(state.turn) || draft === null) {
      actionBar.innerHTML = ''
      return
    }
    const items: string[] = []
    if (draft.stage === 'chooseAction') {
      items.push(`<span class="ab-prompt">${PLAYER_LABEL[state.turn]} 차례 — 행동 선택</span>`)
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
      sub = `타일 소진 — 벌집 점수 노랑 ${r.scores.yellow} : ${r.scores.brown} 갈색`
    } else {
      title = `🏆 ${PLAYER_LABEL[r.winner]} 승리 (점수)`
      sub = `타일 소진 — 벌집 점수 노랑 ${r.scores.yellow} : ${r.scores.brown} 갈색`
    }
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${BEE_SVG}
          <div class="modal-title">${title}</div>
          <div class="modal-sub">${sub}</div>
          <div class="modal-actions">
            <button data-act="new">다시 하기</button>
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

  // 여왕벌 모드 켜기 전 설명 팝업 — 확인해야 켜진다(확장 규칙 안내). 외부 에셋 0.
  function renderQueenInfo(): void {
    modalLayer.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card queen-info">
          ${QUEEN_SVG}
          <div class="modal-title">👑 여왕벌 모드 (확장 규칙)</div>
          <div class="modal-sub">숙련자용 규칙이에요. 켜면 평소보다 한 수가 더 강력해집니다.</div>
          <ul class="info-list">
            <li>게임 중 <b>딱 한 번</b>, 일반 말 대신 여왕벌을 놓을 수 있어요.</li>
            <li>여왕벌은 <b>어떤 타일 위에도</b> 놓을 수 있어요 — 상대 벌집 위에도! (벌집 잠금 무시)</li>
            <li>여왕벌도 내 말이라 <b>5목(승리) 판정에 포함</b>돼요.</li>
            <li>놓을 때 행동 바의 <b>“여왕벌로 놓기”</b>(단축키 <kbd>Q</kbd>)를 눌러요.</li>
            <li>AI는 여왕벌을 쓰지 않아요(사람 전용).</li>
          </ul>
          <div class="modal-actions">
            <button data-act="queenConfirm">확인 — 켜기</button>
            <button data-act="queenCancel">취소</button>
          </div>
        </div>
      </div>
    `
    for (const btn of Array.from(modalLayer.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
  }

  function renderReplayPanel(idx: number): void {
    const n = moveLog.length
    const vs = timeline()[idx]!
    const scores = totalHiveScores(vs.board)
    const playing = replayTimer !== null
    const disPrev = idx <= 0 ? 'disabled' : ''
    const disNext = idx >= n ? 'disabled' : ''
    panel.innerHTML = `
      <h2>🐝 복기</h2>
      <div class="status replay">
        <div class="status-header">복기 — ${idx} / ${n} 수</div>
        <div class="instruction">${describeMove(idx)}</div>
      </div>
      <div class="scores">벌집 점수 — 노랑 ${scores.yellow} : ${scores.brown} 갈색</div>
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
      return `${PLAYER_LABEL[p]}: 타일 ${s.tiles} · 말 ${s.pieces}${s.queenUsed ? ' · 여왕벌✓' : ''}`
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
        instruction = `타일 소진 — 벌집 점수 노랑 ${state.result.scores.yellow} : ${state.result.scores.brown} 갈색`
      }
    } else if (aiThinking || aiControls(state.turn)) {
      header = `${PLAYER_LABEL[state.turn]} 차례`
      instruction = settings.mode === 'watch' ? '🤖 AI끼리 관전 중…' : '🤖 AI가 생각 중…'
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
      (['easy', 'medium', 'hard'] as Difficulty[]).map(
        (d) => `<button data-act="setDiff:${d}" class="${settings.aiDifficulty === d ? 'active' : ''}">${DIFF_LABEL[d]}</button>`,
      ),
    )
    const settingsHtml = `
      <div class="settings-grid">
        <div class="menu-wrap">
          <button data-act="menuMode" class="${openMenu === 'mode' ? 'open' : ''}">모드 ▾</button>${modeMenu}
        </div>
        <div class="menu-wrap">
          <button data-act="menuDifficulty" class="${openMenu === 'difficulty' ? 'open' : ''}" ${settings.mode === 'hotseat' ? 'disabled' : ''}>난이도 ▾</button>${diffMenu}
        </div>
        <button data-act="toggleHints" class="${settings.hints ? 'active' : ''}">훈수${settings.hints ? ' ✓' : ''}</button>
        <button data-act="toggleQueen" class="${settings.queen ? 'active' : ''}">여왕벌 모드${settings.queen ? ' ✓' : ''}</button>
        <button data-act="toggleActionPos" title="행동 버튼을 보드 위/아래 중 어디에 둘지">행동 버튼 ${settings.actionBarPos === 'top' ? '⬆ 위' : '⬇ 아래'}</button>
        <button data-act="cycleTheme" title="${theme.desc}">🎨 테마: ${theme.label}</button>
        <button data-act="undo" ${history.length > 0 && !aiThinking ? '' : 'disabled'}>무르기</button>
        <button data-act="replayEnter" ${moveLog.length > 0 ? '' : 'disabled'}>복기</button>
        <button data-act="saveGame" title="지금 판을 저장해 둬요">💾 저장</button>
        <button data-act="loadGame" ${hasSlot() ? '' : 'disabled'} title="저장한 판을 불러와요">📂 불러오기</button>
        <button data-act="resetView" title="보드 확대·이동을 처음 상태로">처음 위치로</button>
        <button data-act="new">새 게임</button>
      </div>`
    const settingsSummary =
      settings.mode === 'hotseat'
        ? `<div class="settings-summary">🎮 ${MODE_LABEL.hotseat}</div>`
        : `<div class="settings-summary">🎮 ${MODE_LABEL[settings.mode]} · 난이도 <b>${DIFF_LABEL[settings.aiDifficulty]}</b></div>`

    // 관전 모드: 두는 속도(수 간격) 조절. 간격이 클수록 천천히.
    const watchCtl =
      settings.mode === 'watch'
        ? `<div class="sc-slider watch-speed">
             <span class="sc-label">관전 간격</span>
             <input type="range" data-ctl="watchDelay" min="100" max="2000" step="100" value="${settings.watchDelay}">
             <span class="sc-val">${(settings.watchDelay / 1000).toFixed(1)}초</span>
           </div>`
        : ''

    let reach = ''
    if (state.phase === 'playing') {
      if (winNowCells.length > 0) {
        reach = `<div class="reach win">✨ ${PLAYER_LABEL[state.turn]} 리치! 여기 두면 승리</div>`
      } else if (dangerCells.length > 0) {
        reach = `<div class="reach danger">⚠️ ${PLAYER_LABEL[opponent(state.turn)]} 리치! 다음 한 수로 5목 — 막으세요</div>`
      }
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

    panel.innerHTML = `
      <h2>🐝 Be the Bee</h2>
      <div class="status ${state.phase === 'finished' ? 'finished' : state.turn}">
        <div class="status-header">${header}</div>
        <div class="instruction">${instruction}</div>
        ${message ? `<div class="message">⚠️ ${message}</div>` : ''}
        ${notice ? `<div class="notice">✓ ${notice}</div>` : ''}
      </div>
      ${reach}
      <div class="supplies">
        <div>${supplyLine('yellow')}</div>
        <div>${supplyLine('brown')}</div>
      </div>
      <div class="scores">벌집 점수 — 노랑 ${scores.yellow} : ${scores.brown} 갈색</div>
      ${settingsHtml}
      ${settingsSummary}
      ${watchCtl}
      ${soundCtl}
      <div class="help">
        <p class="hint">같은 진영 말 <b>5개를 일렬로</b> 연결하면 승리. 타일은 기존 타일에 붙여서 놓습니다.</p>
        <p class="hint nav">🖱️ 휠 = 확대 · 드래그 = 이동<br>⌨️ 화살표 = 이동 · ＋－ = 확대 · 0 = 처음 위치로</p>
      </div>
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
    if (draft.action === 'pieceOnly') return '더 놓을 타일이 없습니다 — 말을 놓을 타일을 클릭하세요.'
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

    // 복기 컨트롤(보기 전용) — 별도 처리 후 종료
    if (act.startsWith('replay')) {
      handleReplay(act)
      return
    }

    // 모드/난이도 메뉴 선택
    if (act.startsWith('setMode:')) {
      stopReplayTimer()
      replayIndex = null
      clearAiTimer()
      settings.mode = act.slice('setMode:'.length) as Mode
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
          // 사람 차례가 될 때까지 되돌린다 — vs AI 에선 AI 수와 내 수를 함께 무른다.
          // (한 수만 무르면 AI 차례로 돌아가 AI 가 즉시 다시 둬 무효가 됨)
          do {
            state = history[history.length - 1]!
            history = history.slice(0, -1)
            moveLog = moveLog.slice(0, -1) // history 와 보조 맞춤
          } while (history.length > 0 && aiControls(state.turn))
          message = ''
          notice = ''
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
      case 'toggleQueen':
        if (settings.queen) {
          // 끄기는 즉시(설명 불필요)
          settings.queen = false
          if (pieceKind === 'queen') pieceKind = 'normal'
        } else {
          // 켜기 전 설명 팝업 — 확인해야 켜진다
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
      case 'toggleActionPos':
        settings.actionBarPos = settings.actionBarPos === 'top' ? 'bottom' : 'top'
        applyActionBarPos()
        break
      case 'cycleTheme': {
        const i = COLOR_THEMES.findIndex((t) => t.id === theme.id)
        theme = COLOR_THEMES[(i + 1) % COLOR_THEMES.length]!
        settings.themeId = theme.id
        applyThemeColors()
        break
      }
      case 'saveGame':
        saveSlot(snapshot())
        notice = '현재 판을 저장했어요.'
        break
      case 'loadGame': {
        const s = loadSlot()
        if (s) {
          clearAiTimer()
          stopReplayTimer()
          applySnapshot(s)
          autoSaveNow()
          notice = '저장한 판을 불러왔어요.'
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
        setInitialCamera()
        return
      case 'new':
        clearAiTimer()
        stopReplayTimer()
        clearFx()
        replayIndex = null
        state = createInitialState()
        history = []
        moveLog = []
        message = ''
        notice = ''
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

  // 진행 중이던 판이 있으면 자동 복원(이어하기). 없으면 새 게임으로 시작.
  const resumed = loadAutoSave()
  if (resumed) applySnapshot(resumed)
  else startTurn()
  setInitialCamera()
  render()
  maybeScheduleAi() // 불러온 모드가 관전이거나, 이어한 판이 AI 차례면 바로 둔다
}
