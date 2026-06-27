// 첫 접속 튜토리얼, 규칙서(PDF) 기준 페이지 넘김 캐러셀. ui 계층(엔진과 무관).
// 일러스트는 외부 에셋 없이 게임과 같은 pointy-top 헥스·벌 말 SVG + CSS 애니메이션으로 재현한다.

import { hex, type Hex } from '../engine/index'
import { HEX_SIZE, hexPolygonPoints, hexToPixel } from './layout'
import { PIECE_DEFS, pieceMarkup } from './piece-art'

const SEEN_KEY = 'be-the-bee/tutorial-seen'
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}
function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* 무시 */
  }
}

type Color = 'yellow' | 'brown'
const S = HEX_SIZE // 튜토리얼 헥스 크기(게임과 동일)
const TILE: Record<Color, { mid: string; stroke: string }> = {
  yellow: { mid: '#f0c531', stroke: '#6e5114' },
  brown: { mid: '#97581d', stroke: '#43280a' },
}

// 그라데이션·글로우 정의(튜토리얼 전용 id, 한 번에 한 SVG 만 DOM 에 있음).
const DEFS = `
  <defs>
    <radialGradient id="tw-yellow" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#fcdf6e"/><stop offset="55%" stop-color="#f0c531"/><stop offset="100%" stop-color="#d3a013"/>
    </radialGradient>
    <radialGradient id="tw-brown" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#c4843a"/><stop offset="55%" stop-color="#97581d"/><stop offset="100%" stop-color="#744213"/>
    </radialGradient>
    <filter id="tutGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.95"/>
    </filter>
    ${PIECE_DEFS}
  </defs>`

function px(h: Hex): { x: number; y: number } {
  return hexToPixel(h, S)
}

interface TileOpt {
  glow?: boolean
  dash?: boolean
  delay?: number
}
function tile(h: Hex, color: Color, opt: TileOpt = {}): string {
  const pts = hexPolygonPoints(px(h), S)
  if (opt.dash) {
    return `<polygon points="${pts}" fill="${TILE[color].mid}" fill-opacity="0.2" stroke="${TILE[color].stroke}" stroke-width="2" stroke-dasharray="5 4"/>`
  }
  const filt = opt.glow ? ' filter="url(#tutGlow)"' : ''
  const style = opt.delay ? ` style="animation-delay:${opt.delay}ms"` : ''
  return `<polygon class="tut-pop" points="${pts}" fill="url(#tw-${color})" stroke="${TILE[color].stroke}" stroke-width="2"${filt}${style}/>`
}

// 말 = 게임 보드와 동일한 "벌+원판" 에셋(piece-art 공유). 원판 반지름은 게임과 같은 HEX_SIZE*0.6.
function bee(h: Hex, color: Color, delay = 0): string {
  const c = px(h)
  return pieceMarkup(c.x, c.y, S * 0.6, color, { delay })
}

// 여왕벌 = 벌 + 머리 왕관 + 원판 빨간 링(게임과 동일).
function queen(h: Hex, color: Color, delay = 0): string {
  const c = px(h)
  return pieceMarkup(c.x, c.y, S * 0.6, color, { delay, queen: true })
}

// 꽃가루 반짝(승리 연출), center 둘레로 튀는 점들(무한 반복).
function pollen(h: Hex): string {
  const c = px(h)
  const R = S * 0.95
  let out = ''
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 3) * i - Math.PI / 2
    const dx = (Math.cos(ang) * R).toFixed(1)
    const dy = (Math.sin(ang) * R).toFixed(1)
    out += `<circle cx="${c.x}" cy="${c.y}" r="${S * 0.1}" fill="#f59e0b" style="--dx:${dx}px;--dy:${dy}px;animation:pollen 1100ms ease-out infinite"/>`
  }
  return out
}

// 헥스 목록을 모두 담는 viewBox 로 SVG 한 장을 만든다.
function scene(hexes: Hex[], content: string): string {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const h of hexes) {
    const c = px(h)
    minX = Math.min(minX, c.x - S)
    minY = Math.min(minY, c.y - S)
    maxX = Math.max(maxX, c.x + S)
    maxY = Math.max(maxY, c.y + S)
  }
  const pad = S * 0.6
  const vb = `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + 2 * pad).toFixed(1)} ${(maxY - minY + 2 * pad).toFixed(1)}`
  return `<svg class="tut-svg" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${DEFS}${content}</svg>`
}

interface Page {
  title: string
  body: string
  svg: () => string
}

const row = (n: number, r = 0, q0 = 0): Hex[] => Array.from({ length: n }, (_, i) => hex(q0 + i, r))

// 반경 R 의 벌집(육각형 군집) 표지 일러스트. 대각선 색 교차 + 벌 2마리.
function coverScene(): string {
  const hs: Hex[] = []
  const parts: string[] = []
  const R = 2
  for (let q = -R; q <= R; q++) {
    const r1 = Math.max(-R, -q - R)
    const r2 = Math.min(R, -q + R)
    for (let rr = r1; rr <= r2; rr++) {
      const h = hex(q, rr)
      hs.push(h)
      const color: Color = (((q - rr) % 2) + 2) % 2 === 0 ? 'yellow' : 'brown'
      parts.push(tile(h, color, { delay: (q + R + (rr + R)) * 45 }))
    }
  }
  parts.push(bee(hex(0, 0), 'yellow', 720))
  parts.push(bee(hex(1, -1), 'brown', 840))
  return scene(hs, parts.join(''))
}

// 예시용 ○/✕ 도장(벌집 유효/무효 비교 등). 디지털이라 그림으로 바로 보여 준다.
function stamp(h: Hex, ok: boolean): string {
  const c = px(h)
  const r = S * 0.5
  const color = ok ? '#16a34a' : '#dc2626'
  return (
    `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="${color}"/>` +
    `<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" font-size="${(r * 1.25).toFixed(1)}" fill="#fff" font-weight="bold">${ok ? '✓' : '✕'}</text>`
  )
}

// 디지털 변형이라 실물 설명서의 문구·예시 그림을 화면에 맞게 옮겼다. 1페이지는 제목·표지.
const PAGES: Page[] = [
  {
    title: '🐝 Be the Bee',
    body: '노랑 vs 갈색, <b>1:1 추상전략 보드게임</b><br><span class="tut-dim">넘겨서 게임 방법을 확인하세요</span>',
    svg: coverScene,
  },
  {
    title: '🎯 게임 목표',
    body: '상대보다 빠르게 타일 위로 자신의 <b>말 5개를 일렬로</b> 연결해서, <b>벌집의 주인</b>이 되세요!',
    svg: () => {
      const r = row(5)
      const tiles = r.map((h, i) => tile(h, 'yellow', { delay: i * 90 })).join('')
      const bees = r.map((h, i) => bee(h, 'yellow', 200 + i * 110)).join('')
      return scene(r, tiles + bees)
    },
  },
  {
    title: '🧩 게임 시작',
    body:
      '<b>노랑</b>과 <b>갈색</b>의 1:1 대결이에요.<br>' +
      '• <b>노랑</b>이 먼저 두는 선플레이어예요.<br>' +
      '• 시작하면 노란 타일 1개와 갈색 타일 1개가 한 변을 맞댄 채 놓여 있어요.<br>' +
      '• 설정에서 <b>사람 vs 사람 · vs AI · AI 관전</b> 모드를 고를 수 있어요.',
    svg: () => {
      const hs = [hex(0, 0), hex(1, 0)]
      return scene(hs, tile(hex(0, 0), 'yellow', { delay: 0 }) + tile(hex(1, 0), 'brown', { delay: 200 }))
    },
  },
  {
    title: '🎮 게임 진행',
    body:
      '선플레이어부터 번갈아가며 ‘턴’을 진행합니다. 자신의 턴에 다음 중 하나의 행동만 할 수 있습니다.<br>' +
      '① 자신의 <b>타일 2개</b> 내려놓기<br>' +
      '② 자신의 <b>타일 1개</b>를 내려놓은 뒤, 원하는 타일 위에 <b>말 1개</b> 내려놓기<br>' +
      '<span class="tut-dim">• 선플레이어의 가장 첫 번째 턴에는 ②번 행동만 할 수 있습니다.<br>' +
      '• 모든 타일은 이미 놓여있는 타일과 최소 한 변이 맞닿은 상태로 놓아야 합니다.<br>' +
      '• 더 이상 내려놓을 타일이 없는 플레이어는 ‘원하는 타일 위로 자신의 말 1개 내려놓기’만 할 수 있습니다.</span>',
    svg: () => {
      const hs = [hex(0, 0), hex(1, 0), hex(2, 0)]
      const tiles = hs.map((h, i) => tile(h, 'yellow', { delay: i * 120 })).join('')
      return scene(hs, tiles + bee(hex(2, 0), 'yellow', 520))
    },
  },
  {
    title: '🍯 벌집',
    body:
      '같은 색 타일을 <b>일직선으로 5개 이상</b> 이으면 <b>벌집</b>이 돼요. ' +
      '<span class="tut-dim">(오른쪽 ✕처럼 꺾이면 벌집이 아니에요.)</span><br>' +
      '벌집이 생기면 그 위엔 <b>주인만</b> 말을 놓을 수 있어요. ' +
      '<span class="tut-dim">(벌집이 되기 전에 놓인 말은 그대로 둬요.)</span>',
    svg: () => {
      // 왼쪽: 일직선 5 = 벌집(✓, 금색 글로우) / 오른쪽: 꺾인 5 = 벌집 아님(✕)
      const straight = [hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0), hex(4, 0)]
      const bent = [hex(8, 0), hex(9, 0), hex(10, 0), hex(10, 1), hex(10, 2)]
      const sTiles = straight.map((h, i) => tile(h, 'yellow', { glow: true, delay: i * 80 })).join('')
      const bTiles = bent.map((h, i) => tile(h, 'yellow', { delay: i * 80 })).join('')
      const bounds = [...straight, ...bent, hex(2, -1), hex(9, -1)] // 도장 자리 포함
      return scene(bounds, sTiles + bTiles + stamp(hex(2, -1), true) + stamp(hex(9, -1), false))
    },
  },
  {
    title: '💡 초보자를 위한 전략 TIP',
    body:
      '<b>“상대의 허리를 끊어라!”</b><br>상대가 타일 3개를 일렬로 연결한 상황! 이때 내 타일로 양쪽을 모두 막는 것도 방법이지만, 벌집이 될 낌새가 보이는 상대 타일 위에 내 말을 놓아 미리 허리를 끊는 것도 좋은 전략일 수 있습니다.<br><br>' +
      '<b>“벌집에는 주인이 있지만, 타일에는 주인이 없다!”</b><br>벌집이 완성되지 않은 이상, 말은 타일의 색과 상관없이 놓을 수 있습니다! 전략적으로 상대의 타일을 선점하여 주도권을 잡아볼까요?<br><br>' +
      '<b>“벌집에 끌려가도 정신만 차리면 산다!”</b><br>Be the Bee는 타일이 아니라 말 5개를 일렬로 먼저 연결하면 승리하는 게임입니다. 상대가 벌집을 완성했더라도, 상대보다 빠르게 말 5개만 연결하면 당신의 승리입니다!',
    svg: () => {
      // 허리 끊기: 상대(갈색) 타일선 위에 내(노랑) 말을 선점
      const hs = [hex(0, 0), hex(1, 0), hex(2, 0)]
      const tiles = hs.map((h, i) => tile(h, 'brown', { delay: i * 110 })).join('')
      return scene(hs, tiles + bee(hex(1, 0), 'yellow', 480))
    },
  },
  {
    title: '🏆 게임 종료',
    body:
      '다른 플레이어보다 먼저 자신의 색깔 <b>말 5개 이상을 일렬로</b> 연결하는 플레이어가 승자가 됩니다.<br><br>' +
      '<b>승부가 나지 않는 경우</b><br>두 플레이어의 색깔 타일을 전부 사용했음에도 승부가 나지 않는 경우, 각자가 만든 <b>벌집의 개수와 길이</b>에 따라 승자를 결정합니다. 타일 5개로 이루어진 벌집은 1점이며, 연결된 타일이 하나씩 늘어날수록 1점씩 추가됩니다. 총점이 더 높은 플레이어가 승자가 되고, 동률인 경우 무승부로 종료됩니다.',
    svg: () => {
      const r = row(5)
      const tiles = r.map((h) => tile(h, 'yellow')).join('')
      const bees = r.map((h, i) => bee(h, 'yellow', i * 90)).join('')
      return scene(r, tiles + bees + pollen(hex(2, 0)))
    },
  },
  {
    title: '✨ 확장 모드 (선택)',
    body:
      '설정에서 켤 수 있는 <b>선택 모드</b>예요.<br><br>' +
      '<b>👑 여왕벌 모드</b> — 게임 중 <b>딱 한 번</b>, 일반 말 대신 여왕벌을 <b>어떤 타일 위에도</b>(상대 벌집 위에도!) 놓을 수 있어요.<br><br>' +
      '<b>♾️ 무한 모드</b> — 타일 개수 제한이 없어요. 타일 걱정 없이 오직 <b>말 5목</b>으로만 승부해요.<br><br>' +
      '<b>이제 직접 해볼까요?</b> 🐝',
    svg: () => {
      const hs = [hex(0, 0), hex(1, 0)]
      return scene(hs, tile(hex(0, 0), 'yellow', { delay: 0 }) + tile(hex(1, 0), 'brown', { delay: 80 }) + queen(hex(0, 0), 'yellow', 220))
    },
  },
]

// 튜토리얼 캐러셀을 연다(첫 접속/재열기 공용). 닫으면 seen 플래그를 기록한다.
export function openTutorial(root: HTMLElement, onClose?: () => void): void {
  let layer = root.querySelector('.tut-layer') as HTMLElement | null
  if (!layer) {
    layer = document.createElement('div')
    layer.className = 'tut-layer'
    root.appendChild(layer)
  }
  const host = layer
  let idx = 0

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowRight') {
      e.stopPropagation()
      if (idx < PAGES.length - 1) {
        idx += 1
        render()
      }
    } else if (e.key === 'ArrowLeft') {
      e.stopPropagation()
      if (idx > 0) {
        idx -= 1
        render()
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  // 게임의 window keydown(카메라/단축키)보다 먼저 잡아 막는다(document 버블이 window 보다 앞).
  document.addEventListener('keydown', onKey)

  function close(): void {
    markSeen()
    document.removeEventListener('keydown', onKey)
    host.innerHTML = ''
    onClose?.()
  }

  function handle(act: string | null): void {
    if (act === null) return
    if (act === 'skip') return close()
    if (act === 'prev') {
      idx = Math.max(0, idx - 1)
      return render()
    }
    if (act === 'next') {
      if (idx === PAGES.length - 1) return close()
      idx += 1
      return render()
    }
    if (act.startsWith('go:')) {
      idx = Number(act.slice(3))
      return render()
    }
  }

  function render(): void {
    const p = PAGES[idx]!
    const last = idx === PAGES.length - 1
    const dots = PAGES.map((_, i) => `<span class="tut-dot ${i === idx ? 'on' : ''}" data-tut="go:${i}"></span>`).join('')
    host.innerHTML = `
      <div class="tut-backdrop">
        <div class="tut-card">
          <button class="tut-skip" data-tut="skip" title="튜토리얼 닫기">건너뛰기 ✕</button>
          <div class="tut-illus">${p.svg()}</div>
          <div class="tut-step">${idx + 1} / ${PAGES.length}</div>
          <h2 class="tut-title">${p.title}</h2>
          <div class="tut-body">${p.body}</div>
          <div class="tut-dots">${dots}</div>
          <div class="tut-nav">
            <button data-tut="prev" ${idx === 0 ? 'disabled' : ''}>← 이전</button>
            <button class="tut-next" data-tut="next">${last ? '시작하기 🐝' : '다음 →'}</button>
          </div>
        </div>
      </div>`
    for (const el of Array.from(host.querySelectorAll('[data-tut]'))) {
      el.addEventListener('click', () => handle(el.getAttribute('data-tut')))
    }
  }

  render()
}

// 첫 접속이면 튜토리얼을 띄운다.
export function maybeShowTutorial(root: HTMLElement): void {
  if (!tutorialSeen()) openTutorial(root)
}
