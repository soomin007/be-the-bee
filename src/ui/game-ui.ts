// 핫시트 게임 UI: SVG 보드 렌더 + 클릭 입력 + 턴/액션 상태머신.
// 엔진(순수)에만 의존한다. 엔진은 이 파일을 절대 import 하지 않는다.

import {
  allowedMoveTypes,
  applyMove,
  createInitialState,
  detectHives,
  frontierCells,
  hexEquals,
  hexFromKey,
  isTilePlaceable,
  totalHiveScores,
  validatePiecePlacement,
  withTile,
} from '../engine/index'
import type { GameState, Hex, Move, PieceKind, Player } from '../engine/index'
import { HEX_SIZE, hexPolygonPoints, hexToPixel, type Point } from './layout'

const SVGNS = 'http://www.w3.org/2000/svg'

const TILE_FILL: Record<Player, string> = { yellow: '#f4d35e', brown: '#c1812f' }
const PIECE_FILL: Record<Player, string> = { yellow: '#d98a00', brown: '#3f2007' }
const PLAYER_LABEL: Record<Player, string> = { yellow: '노랑', brown: '갈색' }
const TILE_STROKE = '#6b5524'
const HIVE_STROKE = '#eab308'

// 진행 중인 턴의 선택 상태(아직 엔진에 커밋되지 않음).
type Draft =
  | { readonly stage: 'chooseAction' } // ①/② 둘 다 가능 — 버튼 선택 대기
  | { readonly stage: 'tile'; readonly action: 'twoTiles' | 'tileAndPiece'; readonly first?: Hex }
  | { readonly stage: 'piece'; readonly action: 'tileAndPiece' | 'pieceOnly'; readonly tile?: Hex }

export function mountGame(root: HTMLElement): void {
  let state: GameState = createInitialState()
  let history: GameState[] = []
  let draft: Draft | null = null
  let pieceKind: PieceKind = 'normal'
  let message = ''

  root.innerHTML = `
    <div class="game">
      <div class="board-wrap"><svg class="board" xmlns="${SVGNS}"></svg></div>
      <aside class="panel"></aside>
    </div>
  `
  const svg = root.querySelector('svg.board') as SVGSVGElement
  const panel = root.querySelector('.panel') as HTMLElement

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
  }

  function onHexClick(h: Hex): void {
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
      // twoTiles
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

    // draft.stage === 'piece'
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

  // ---- 렌더링 ----------------------------------------------------------------

  function makeHexPolygon(
    center: Point,
    opts: {
      fill: string
      stroke: string
      strokeWidth: number
      opacity?: number
      dash?: boolean
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
    if (opts.onClick) {
      poly.style.cursor = 'pointer'
      poly.addEventListener('click', opts.onClick)
    }
    return poly
  }

  function render(): void {
    const player = state.turn

    // 이번 렌더에 표시할 보조 칸 결정 (판별 유니온 내로잉을 위해 if 로 분기)
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

    // viewBox 계산
    const boundHexes: Hex[] = Object.keys(state.board).map(hexFromKey)
    for (const f of frontier) boundHexes.push(f)
    if (provisionalFirst) boundHexes.push(provisionalFirst)
    if (provisionalTile) boundHexes.push(provisionalTile)

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const h of boundHexes) {
      const p = hexToPixel(h)
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const pad = HEX_SIZE * 1.5
    svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`)

    while (svg.firstChild) svg.removeChild(svg.firstChild)

    // 1) 프론티어(타일 놓을 자리)
    for (const f of frontier) {
      svg.appendChild(
        makeHexPolygon(hexToPixel(f), {
          fill: TILE_FILL[player],
          stroke: TILE_STROKE,
          strokeWidth: 1,
          opacity: 0.22,
          dash: true,
          onClick: () => onHexClick(f),
        }),
      )
    }

    // 2) 타일 + 벌집 윤곽
    const hiveKeys = new Set<string>()
    for (const hive of detectHives(state.board)) for (const k of hive.cells) hiveKeys.add(k)
    for (const key of Object.keys(state.board)) {
      const cell = state.board[key]!
      const h = hexFromKey(key)
      const inHive = hiveKeys.has(key)
      svg.appendChild(
        makeHexPolygon(hexToPixel(h), {
          fill: TILE_FILL[cell.tile.owner],
          stroke: inHive ? HIVE_STROKE : TILE_STROKE,
          strokeWidth: inHive ? 4 : 1.5,
          onClick: () => onHexClick(h),
        }),
      )
    }

    // 3) 잠정 타일(미확정) — 점선
    for (const prov of [provisionalFirst, provisionalTile]) {
      if (!prov) continue
      svg.appendChild(
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

    // 4) 말 놓을 수 있는 타일 강조(말 단계)
    if (pieceStage) {
      for (const key of Object.keys(board2)) {
        const h = hexFromKey(key)
        if (validatePiecePlacement(board2, player, state.supplies[player], { at: h, kind: pieceKind }).ok) {
          svg.appendChild(
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

    // 5) 말(원) + 여왕벌 표식
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
      svg.appendChild(circle)
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
        svg.appendChild(crown)
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
    } else {
      header = `${PLAYER_LABEL[state.turn]} 차례`
      instruction = instructionText()
    }

    const buttons: string[] = []
    if (state.phase === 'playing' && draft !== null) {
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
    if (history.length > 0) buttons.push(`<button data-act="undo">무르기</button>`)
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
      <p class="hint">모든 타일은 기존 타일에 붙여야 합니다. 같은 진영 말 5개를 일렬로 연결하면 승리.</p>
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
          state = history[history.length - 1]!
          history = history.slice(0, -1)
          message = ''
          startTurn()
        }
        break
      case 'new':
        state = createInitialState()
        history = []
        message = ''
        startTurn()
        break
      default:
        return
    }
    render()
  }

  startTurn()
  render()
}
