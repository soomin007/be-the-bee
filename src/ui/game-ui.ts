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

const SVGNS = 'http://www.w3.org/2000/svg'

const TILE_FILL: Record<Player, string> = { yellow: '#f4d35e', brown: '#c1812f' }
// 말 = 벌. 몸통 색 + 줄무늬 색(진영 구분 + 벌 느낌). 흰 테두리로 타일과 대비.
const PIECE_FILL: Record<Player, string> = { yellow: '#e0a106', brown: '#8a5418' }
const PIECE_STRIPE: Record<Player, string> = { yellow: '#3a2600', brown: '#241200' }
const PLAYER_LABEL: Record<Player, string> = { yellow: '노랑', brown: '갈색' }
const TILE_STROKE = '#6b5524'

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
  let draft: Draft | null = null
  let pieceKind: PieceKind = 'normal'
  let message = ''
  let lastMove: Move | null = null
  let modalDismissed = false // 결과 모달 닫음 여부
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
  const settings = defaultSettings()
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

  root.innerHTML = `
    <div class="game">
      <aside class="panel"></aside>
      <div class="board-wrap">
        <svg class="board" xmlns="${SVGNS}" tabindex="0">
          <defs>
            <filter id="hiveGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.95" />
            </filter>
          </defs>
          <g class="content"></g>
        </svg>
        <div class="action-bar"></div>
      </div>
    </div>
    <div class="modal-layer"></div>
  `
  const svg = root.querySelector('svg.board') as SVGSVGElement
  const content = svg.querySelector('g.content') as SVGGElement
  const panel = root.querySelector('.panel') as HTMLElement
  const actionBar = root.querySelector('.action-bar') as HTMLElement
  const modalLayer = root.querySelector('.modal-layer') as HTMLElement

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

  function applyAndAdvance(move: Move): void {
    history = [...history, state]
    lastMove = move
    const mover = state.turn
    state = applyMove(state, move)
    message = ''
    modalDismissed = false
    openMenu = null
    if (state.phase === 'finished' && state.result?.kind === 'win') sound.win()
    else sound.place(mover)
    // 훈수 모드면 새 차례가 위협받을 때(상대가 다음 한 수로 5목 가능) 경고음
    if (settings.hints && state.phase === 'playing') {
      const opp = opponent(state.turn)
      if (winningCells(state.board, opp, state.supplies[opp]).length > 0) sound.alert()
    }
    startTurn()
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
    aiTimer = window.setTimeout(() => {
      aiTimer = null
      aiThinking = false
      try {
        applyAndAdvance(ai!.chooseMove(state))
      } catch {
        render()
      }
    }, AI_DELAY_MS)
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
    const player = state.turn
    const lastKeys = lastMove ? new Set(moveCells(lastMove).map(hexKey)) : new Set<string>()

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
    const occupied = new Set(Object.keys(state.board))
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
          fill: TILE_FILL[player],
          stroke: TILE_STROKE,
          strokeWidth: 1.2,
          opacity: 0.22,
          dash: true,
          onClick: () => onHexClick(f),
        }),
      )
    }

    // 2) 타일
    for (const key of Object.keys(state.board)) {
      const cell = state.board[key]!
      const h = hexFromKey(key)
      content.appendChild(
        makeHexPolygon(hexToPixel(h), {
          fill: TILE_FILL[cell.tile.owner],
          stroke: TILE_STROKE,
          strokeWidth: 1.5,
          cls: lastKeys.has(key) ? 'pop' : undefined,
          onClick: () => onHexClick(h),
        }),
      )
    }

    // 3) 벌집 강조 — 금색 글로우 오버레이(가시성 ↑)
    const hiveKeys = new Set<string>()
    for (const hive of detectHives(state.board)) for (const k of hive.cells) hiveKeys.add(k)
    for (const key of hiveKeys) {
      const h = hexFromKey(key)
      content.appendChild(
        makeHexPolygon(hexToPixel(h), {
          fill: '#fde68a',
          stroke: '#f59e0b',
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
          fill: TILE_FILL[player],
          stroke: '#111',
          strokeWidth: 2,
          opacity: 0.6,
          dash: true,
          onClick: () => onHexClick(prov),
        }),
      )
    }

    // 4.5) 직전 수 강조 — 타일은 칸 파란 점선(말 둘레 링은 말 그릴 때). + 리치 힌트
    const lpc = lastMove ? lastPieceCell(lastMove) : null
    const lastPieceKey = lpc ? hexKey(lpc) : null
    if (lastMove) {
      for (const c of lastTileCells(lastMove)) {
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
    if (settings.hints && state.phase === 'playing') {
      const opp = opponent(state.turn)
      dangerCells = winningCells(state.board, opp, state.supplies[opp])
      winNowCells = winningCells(state.board, state.turn, state.supplies[state.turn])
      for (const c of dangerCells) {
        content.appendChild(
          makeHexPolygon(hexToPixel(c), {
            fill: 'none',
            stroke: '#dc2626',
            strokeWidth: 3.5,
            cls: 'pulse',
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
            cls: 'pulse',
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
    for (const key of Object.keys(state.board)) {
      const piece = state.board[key]!.piece
      if (!piece) continue
      const p = hexToPixel(hexFromKey(key))
      const r = HEX_SIZE * 0.52
      const stripe = PIECE_STRIPE[piece.owner]

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
      body.setAttribute('fill', PIECE_FILL[piece.owner])
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

    // 7) 승리 이펙트 — 이긴 5목 라인 강조(초록 굵은 펄스)
    if (state.phase === 'finished' && state.result?.kind === 'win') {
      const line = winningLine(state.board)
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
          <div class="modal-title">${title}</div>
          <div class="modal-sub">${sub}</div>
          <div class="modal-actions">
            <button data-act="new">다시 하기</button>
            <button data-act="closeModal">닫기</button>
          </div>
        </div>
      </div>
    `
    for (const btn of Array.from(modalLayer.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
    }
  }

  function renderPanel(): void {
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
        <button data-act="undo" ${history.length > 0 && !aiThinking ? '' : 'disabled'}>무르기</button>
        <button data-act="resetView">뷰 리셋</button>
        <button data-act="new">새 게임</button>
      </div>`

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
      </div>
      ${reach}
      <div class="supplies">
        <div>${supplyLine('yellow')}</div>
        <div>${supplyLine('brown')}</div>
      </div>
      <div class="scores">벌집 점수 — 노랑 ${scores.yellow} : ${scores.brown} 갈색</div>
      ${settingsHtml}
      ${soundCtl}
      <p class="hint">같은 진영 말 5개를 일렬로 연결하면 승리. 타일은 기존 타일에 붙여야 합니다.</p>
      <p class="hint nav">🖱️ 휠: 줌 · 드래그: 이동 · ⌨️ 화살표/＋－/0(리셋)</p>
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
      })
    }
    const bgmVol = panel.querySelector('input[data-ctl="bgmVol"]') as HTMLInputElement | null
    if (bgmVol) {
      bgmVol.addEventListener('input', () => {
        settings.bgmVolume = Number(bgmVol.value) / 100
        sound.setBgmVolume(settings.bgmVolume)
      })
    }
    const sfxVol = panel.querySelector('input[data-ctl="sfxVol"]') as HTMLInputElement | null
    if (sfxVol) {
      sfxVol.addEventListener('input', () => {
        settings.sfxVolume = Number(sfxVol.value) / 100
        sound.setSfxVolume(settings.sfxVolume)
      })
      sfxVol.addEventListener('change', () => sound.place('yellow')) // 레벨 미리듣기
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

    // 모드/난이도 메뉴 선택
    if (act.startsWith('setMode:')) {
      clearAiTimer()
      settings.mode = act.slice('setMode:'.length) as Mode
      rebuildAi()
      openMenu = null
      message = ''
      startTurn()
      render()
      maybeScheduleAi()
      return
    }
    if (act.startsWith('setDiff:')) {
      clearAiTimer()
      settings.aiDifficulty = act.slice('setDiff:'.length) as Difficulty
      rebuildAi()
      openMenu = null
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
          state = history[history.length - 1]!
          history = history.slice(0, -1)
          message = ''
          lastMove = null
          modalDismissed = false
          startTurn()
        }
        break
      case 'closeModal':
        modalDismissed = true
        break
      case 'toggleHints':
        settings.hints = !settings.hints
        break
      case 'toggleQueen':
        settings.queen = !settings.queen
        if (!settings.queen && pieceKind === 'queen') pieceKind = 'normal'
        break
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
        state = createInitialState()
        history = []
        message = ''
        lastMove = null
        modalDismissed = false
        startTurn()
        break
      default:
        return
    }
    render()
    maybeScheduleAi()
  }

  setInitialCamera()
  startTurn()
  render()
}
