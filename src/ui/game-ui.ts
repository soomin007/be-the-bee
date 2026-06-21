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
  isTilePlaceable,
  totalHiveScores,
  validatePiecePlacement,
  withTile,
} from '../engine/index'
import type { Ai, GameState, Hex, Move, PieceKind, Player } from '../engine/index'
import { HEX_SIZE, hexPolygonPoints, hexToPixel, type Point } from './layout'

const SVGNS = 'http://www.w3.org/2000/svg'

const TILE_FILL: Record<Player, string> = { yellow: '#f4d35e', brown: '#c1812f' }
const PIECE_FILL: Record<Player, string> = { yellow: '#d98a00', brown: '#3f2007' }
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
const NEXT_MODE: Record<Mode, Mode> = { hotseat: 'vsAi', vsAi: 'watch', watch: 'hotseat' }
const AI_DELAY_MS = 350

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

export function mountGame(root: HTMLElement): void {
  let state: GameState = createInitialState()
  let history: GameState[] = []
  let draft: Draft | null = null
  let pieceKind: PieceKind = 'normal'
  let message = ''

  let cam: Camera = { cx: 0, cy: 0, w: HEX_SIZE * 26 }
  // 드래그 팬 상태
  let pointerDown = false
  let dragMoved = false
  let lastX = 0
  let lastY = 0

  // AI 상태
  let mode: Mode = 'hotseat'
  let ai: Ai | null = null
  let aiThinking = false // 재진입 가드 + 입력 잠금
  let aiTimer: number | null = null
  const aiControls = (turn: Player): boolean =>
    mode === 'watch' || (mode === 'vsAi' && turn === 'brown')

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
      </div>
    </div>
  `
  const svg = root.querySelector('svg.board') as SVGSVGElement
  const content = svg.querySelector('g.content') as SVGGElement
  const panel = root.querySelector('.panel') as HTMLElement

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

  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    pointerDown = true
    dragMoved = false
    lastX = e.clientX
    lastY = e.clientY
    try {
      svg.setPointerCapture(e.pointerId)
    } catch {
      /* happy-dom 등 미지원 환경 무시 */
    }
  })
  svg.addEventListener('pointermove', (e: PointerEvent) => {
    if (!pointerDown) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    if (!dragMoved && Math.hypot(dx, dy) > 4) {
      dragMoved = true
      svg.classList.add('panning')
    }
    if (dragMoved) {
      panByClient(dx, dy)
      lastX = e.clientX
      lastY = e.clientY
    }
  })
  const endPointer = (): void => {
    pointerDown = false
    svg.classList.remove('panning')
  }
  svg.addEventListener('pointerup', endPointer)
  svg.addEventListener('pointercancel', endPointer)

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
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
    state = applyMove(state, move)
    message = ''
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

    // 6) 말(원) + 여왕벌 표식
    for (const key of Object.keys(state.board)) {
      const piece = state.board[key]!.piece
      if (!piece) continue
      const p = hexToPixel(hexFromKey(key))
      const circle = document.createElementNS(SVGNS, 'circle')
      circle.setAttribute('cx', String(p.x))
      circle.setAttribute('cy', String(p.y))
      circle.setAttribute('r', String(HEX_SIZE * 0.52))
      circle.setAttribute('fill', PIECE_FILL[piece.owner])
      circle.setAttribute('stroke', '#fff')
      circle.setAttribute('stroke-width', '2.5')
      circle.style.pointerEvents = 'none'
      content.appendChild(circle)
      if (piece.kind === 'queen') {
        const crown = document.createElementNS(SVGNS, 'text')
        crown.setAttribute('x', String(p.x))
        crown.setAttribute('y', String(p.y))
        crown.setAttribute('text-anchor', 'middle')
        crown.setAttribute('dominant-baseline', 'central')
        crown.setAttribute('font-size', String(HEX_SIZE * 0.7))
        crown.setAttribute('fill', '#fff')
        crown.style.pointerEvents = 'none'
        crown.textContent = '♛'
        content.appendChild(crown)
      }
    }

    renderPanel()
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
      instruction = mode === 'watch' ? '🤖 AI끼리 관전 중…' : '🤖 AI가 생각 중…'
    } else {
      header = `${PLAYER_LABEL[state.turn]} 차례`
      instruction = instructionText()
    }

    const humanTurn = state.phase === 'playing' && !aiThinking && !aiControls(state.turn)
    const buttons: string[] = []
    if (humanTurn && draft !== null) {
      if (draft.stage === 'chooseAction') {
        buttons.push(`<button data-act="twoTiles">타일 2개 (①)</button>`)
        buttons.push(`<button data-act="tileAndPiece">타일 + 말 (②)</button>`)
      }
      if (draft.stage === 'piece' && !state.supplies[state.turn].queenUsed) {
        buttons.push(
          `<button data-act="queen" class="${pieceKind === 'queen' ? 'active' : ''}">여왕벌 ${pieceKind === 'queen' ? '✓' : ''}</button>`,
        )
      }
      if (draftHasSelection()) buttons.push(`<button data-act="cancel">취소</button>`)
    }
    buttons.push(`<button data-act="cycleMode" class="${mode !== 'hotseat' ? 'active' : ''}">모드: ${MODE_LABEL[mode]}</button>`)
    if (history.length > 0 && !aiThinking) buttons.push(`<button data-act="undo">무르기</button>`)
    buttons.push(`<button data-act="resetView">뷰 리셋</button>`)
    buttons.push(`<button data-act="new">새 게임</button>`)

    panel.innerHTML = `
      <h2>🐝 Be the Bee</h2>
      <div class="status ${state.phase === 'finished' ? 'finished' : state.turn}">
        <div class="status-header">${header}</div>
        <div class="instruction">${instruction}</div>
        ${message ? `<div class="message">⚠️ ${message}</div>` : ''}
      </div>
      <div class="supplies">
        <div>${supplyLine('yellow')}</div>
        <div>${supplyLine('brown')}</div>
      </div>
      <div class="scores">벌집 점수 — 노랑 ${scores.yellow} : ${scores.brown} 갈색</div>
      <div class="buttons">${buttons.join('')}</div>
      <p class="hint">같은 진영 말 5개를 일렬로 연결하면 승리. 타일은 기존 타일에 붙여야 합니다.</p>
      <p class="hint nav">🖱️ 휠: 줌 · 드래그: 이동 · ⌨️ 화살표/＋－/0(리셋)</p>
    `

    for (const btn of Array.from(panel.querySelectorAll('button'))) {
      btn.addEventListener('click', () => onPanelAction(btn.getAttribute('data-act')))
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
    switch (act) {
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
          startTurn()
        }
        break
      case 'cycleMode':
        clearAiTimer()
        mode = NEXT_MODE[mode]
        ai = mode === 'hotseat' ? null : createAi({ difficulty: 'medium' })
        message = ''
        startTurn()
        break
      case 'resetView':
        setInitialCamera()
        return
      case 'new':
        clearAiTimer()
        state = createInitialState()
        history = []
        message = ''
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
