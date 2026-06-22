// 첫 접속 튜토리얼 — 규칙서(PDF) 기준 페이지 넘김 캐러셀. ui 계층(엔진과 무관).
// 일러스트는 외부 에셋 없이 게임과 같은 pointy-top 헥스·벌 말 SVG + CSS 애니메이션으로 재현한다.

import { hex, type Hex } from '../engine/index'
import { HEX_SIZE, hexPolygonPoints, hexToPixel } from './layout'

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
const STRIPE: Record<Color, string> = { yellow: '#3a2600', brown: '#241200' }

// 그라데이션·글로우 정의(튜토리얼 전용 id — 한 번에 한 SVG 만 DOM 에 있음).
const DEFS = `
  <defs>
    <radialGradient id="tw-yellow" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#fcdf6e"/><stop offset="55%" stop-color="#f0c531"/><stop offset="100%" stop-color="#d3a013"/>
    </radialGradient>
    <radialGradient id="tw-brown" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#c4843a"/><stop offset="55%" stop-color="#97581d"/><stop offset="100%" stop-color="#744213"/>
    </radialGradient>
    <radialGradient id="tb-yellow" cx="35%" cy="28%" r="72%">
      <stop offset="0%" stop-color="#f4cf73"/><stop offset="55%" stop-color="#e0a106"/><stop offset="100%" stop-color="#9a6f07"/>
    </radialGradient>
    <radialGradient id="tb-brown" cx="35%" cy="28%" r="72%">
      <stop offset="0%" stop-color="#b88a52"/><stop offset="55%" stop-color="#8a5418"/><stop offset="100%" stop-color="#5e3910"/>
    </radialGradient>
    <filter id="tutGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.95"/>
    </filter>
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

// 말 = 벌(바닥 그림자 + 구형 음영 + 날개 + 줄무늬 + 광택). 게임 렌더와 같은 구성.
function bee(h: Hex, color: Color, delay = 0): string {
  const c = px(h)
  const r = S * 0.52
  const st = STRIPE[color]
  return `<g class="tut-pop" style="animation-delay:${delay}ms">
    <ellipse cx="${c.x + r * 0.28}" cy="${c.y + r * 0.86}" rx="${r * 0.9}" ry="${r * 0.24}" fill="#000" opacity="0.18"/>
    <ellipse cx="${c.x - r * 0.34}" cy="${c.y - r * 0.5}" rx="${r * 0.3}" ry="${r * 0.17}" fill="#fff" opacity="0.8" stroke="${st}" stroke-width="1" transform="rotate(-22 ${c.x - r * 0.34} ${c.y - r * 0.5})"/>
    <ellipse cx="${c.x + r * 0.34}" cy="${c.y - r * 0.5}" rx="${r * 0.3}" ry="${r * 0.17}" fill="#fff" opacity="0.8" stroke="${st}" stroke-width="1" transform="rotate(22 ${c.x + r * 0.34} ${c.y - r * 0.5})"/>
    <circle cx="${c.x}" cy="${c.y}" r="${r}" fill="url(#tb-${color})" stroke="#fff" stroke-width="2.5"/>
    <line x1="${c.x - r * 0.6}" y1="${c.y - r * 0.2}" x2="${c.x + r * 0.6}" y2="${c.y - r * 0.2}" stroke="${st}" stroke-width="${r * 0.26}" stroke-linecap="round"/>
    <line x1="${c.x - r * 0.72}" y1="${c.y + r * 0.16}" x2="${c.x + r * 0.72}" y2="${c.y + r * 0.16}" stroke="${st}" stroke-width="${r * 0.26}" stroke-linecap="round"/>
    <ellipse cx="${c.x - r * 0.34}" cy="${c.y - r * 0.4}" rx="${r * 0.26}" ry="${r * 0.16}" fill="#fff" opacity="0.5" transform="rotate(-32 ${c.x - r * 0.34} ${c.y - r * 0.4})"/>
  </g>`
}

// 여왕벌 = 벌 + 왕관.
function queen(h: Hex, color: Color, delay = 0): string {
  const c = px(h)
  const r = S * 0.52
  const crownY = c.y - r * 1.05
  const crown = `<g class="tut-pop" style="animation-delay:${delay + 120}ms">
    <path d="M${c.x - r * 0.6} ${crownY + r * 0.34} L${c.x - r * 0.6} ${crownY - r * 0.1} L${c.x - r * 0.28} ${crownY + r * 0.16} L${c.x} ${crownY - r * 0.22} L${c.x + r * 0.28} ${crownY + r * 0.16} L${c.x + r * 0.6} ${crownY - r * 0.1} L${c.x + r * 0.6} ${crownY + r * 0.34} Z"
      fill="#ffd54a" stroke="#b8860b" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${c.x}" cy="${crownY - r * 0.06}" r="2.2" fill="#ef4444"/>
  </g>`
  return bee(h, color, delay) + crown
}

// 꽃가루 반짝(승리 연출) — center 둘레로 튀는 점들(무한 반복).
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

const PAGES: Page[] = [
  {
    title: '🐝 Be the Bee 에 오신 걸 환영해요!',
    body: '<b>목표</b>는 간단해요. 같은 색 <b>말(꿀벌) 5개를 일렬로</b> 먼저 연결하면 그 줄의 주인 — <b>벌집의 주인</b>이 되어 승리!',
    svg: () => {
      const r = row(5)
      const tiles = r.map((h, i) => tile(h, 'yellow', { delay: i * 90 })).join('')
      const bees = r.map((h, i) => bee(h, 'yellow', 200 + i * 110)).join('')
      return scene(r, tiles + bees)
    },
  },
  {
    title: '시작은 타일 두 개',
    body: '게임은 <b>노란색 타일 1개</b>와 <b>갈색 타일 1개</b>가 한 변을 맞댄 상태로 시작해요. <b>노랑</b>이 선플레이어(먼저 두는 쪽)예요.',
    svg: () => {
      const hs = [hex(0, 0), hex(1, 0)]
      return scene(hs, tile(hex(0, 0), 'yellow', { delay: 0 }) + tile(hex(1, 0), 'brown', { delay: 160 }))
    },
  },
  {
    title: '내 턴에 할 수 있는 것',
    body: '둘 중 <b>하나</b>를 골라요.<br>① 내 <b>타일 2개</b> 놓기<br>② 내 <b>타일 1개</b> + 원하는 타일 위에 <b>말 1개</b> 놓기<br><span class="tut-dim">노랑의 첫 턴만은 ②만 가능해요.</span>',
    svg: () => {
      // 오른쪽 칸에 타일을 깔고 그 위에 말을 얹는 ② 동작 표현
      const hs = [hex(0, 0), hex(1, 0), hex(2, 0)]
      const tiles = hs.map((h, i) => tile(h, 'yellow', { delay: i * 120 })).join('')
      return scene(hs, tiles + bee(hex(2, 0), 'yellow', 520))
    },
  },
  {
    title: '타일은 “붙여서” 놓아요',
    body: '새 타일은 항상 <b>이미 놓인 타일에 한 변 이상 붙여서</b> 놓아야 해요. <span class="tut-dim">점선 칸 = 놓을 수 있는 자리</span>',
    svg: () => {
      const solid = [hex(0, 0), hex(1, 0), hex(0, 1)]
      const dashes = [hex(2, 0), hex(1, 1), hex(-1, 1)]
      const tiles =
        tile(hex(0, 0), 'yellow', { delay: 0 }) +
        tile(hex(1, 0), 'brown', { delay: 90 }) +
        tile(hex(0, 1), 'yellow', { delay: 180 })
      const frontier = dashes.map((h) => tile(h, 'yellow', { dash: true })).join('')
      return scene([...solid, ...dashes], frontier + tiles)
    },
  },
  {
    title: '벌집(Hive)',
    body: '같은 색 타일 <b>5개를 일렬로</b> 연결하면 <b>벌집</b>이 돼요. 벌집이 생기면 그 위엔 <b>주인만</b> 말을 올릴 수 있어요. <span class="tut-dim">(벌집 전에 놓인 말은 그대로 둬요.)</span>',
    svg: () => {
      const r = row(5)
      return scene(r, r.map((h, i) => tile(h, 'yellow', { glow: true, delay: i * 110 })).join(''))
    },
  },
  {
    title: '승리 — 그리고 작은 전략',
    body: '같은 색 <b>말 5개를 먼저 일렬로</b> 만들면 승리! <br>💡 벌집에 끌려가지 말고 <b>말 5개</b>에 집중하세요. 상대 타일 위에도 내 말을 놓아 <b>허리를 끊을</b> 수 있어요.',
    svg: () => {
      const r = row(5)
      const tiles = r.map((h) => tile(h, 'yellow')).join('')
      const bees = r.map((h, i) => bee(h, 'yellow', i * 90)).join('')
      return scene(r, tiles + bees + pollen(hex(2, 0)))
    },
  },
  {
    title: '여왕벌 (확장) — 이제 시작해요!',
    body: '확장 규칙: <b>여왕벌</b>은 게임당 <b>한 번</b>, <b>어떤 타일 위에도</b> — 상대 벌집 위에도! — 놓을 수 있어요. 설정에서 켤 수 있어요.<br><b>이제 직접 해볼까요?</b> 🐝',
    svg: () => {
      const hs = [hex(0, 0), hex(1, 0)]
      return scene(hs, tile(hex(0, 0), 'yellow', { delay: 0 }) + tile(hex(1, 0), 'brown', { delay: 80 }) + queen(hex(0, 0), 'yellow', 220))
    },
  },
]

// 튜토리얼 캐러셀을 연다(첫 접속/재열기 공용). 닫으면 seen 플래그를 기록한다.
export function openTutorial(root: HTMLElement): void {
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
