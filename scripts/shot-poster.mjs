// 홍보용 포스터(세로 1080x1400, 2x → 2160x2800 PNG) 생성.
//   node scripts/shot-poster.mjs   →  public/poster.png (배포 URL 로도 공유 가능)
// dev 서버 불필요(page.setContent). 게임의 실제 말 아트(piece-art 스펙)·꿀 팔레트를 그대로 써서
// "꿀벌 5목이 완성되는 순간"을 히어로로 삼는다. 외부 이미지 0 — SVG/CSS + 구글폰트만.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const beeMascot = readFileSync('public/favicon.svg', 'utf8')

// ---- 게임 말 아트(piece-art.ts 와 동일 스펙: viewBox 0 0 200 210, 원판 중심 100,100 r80) ----
const PIECE_DEFS = `
  <radialGradient id="pa-disc-gold" cx="36%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#dcb65e"/><stop offset="60%" stop-color="#d2a230"/><stop offset="100%" stop-color="#977523"/>
  </radialGradient>
  <radialGradient id="pa-disc-brown" cx="36%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#8f6158"/><stop offset="60%" stop-color="#6f3529"/><stop offset="100%" stop-color="#50261e"/>
  </radialGradient>
  <radialGradient id="pa-body" cx="38%" cy="26%" r="78%">
    <stop offset="0%" stop-color="#ffd456"/><stop offset="52%" stop-color="#f4b70e"/><stop offset="100%" stop-color="#c8870a"/>
  </radialGradient>
  <clipPath id="pa-bodyclip" clipPathUnits="userSpaceOnUse"><ellipse cx="100" cy="111" rx="32" ry="46"/></clipPath>`
const BEE_BODY = `
  <path d="M94 53 Q88 44 84 41" fill="none" stroke="#15100a" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M106 53 Q112 44 116 41" fill="none" stroke="#15100a" stroke-width="3.6" stroke-linecap="round"/>
  <circle cx="83" cy="40" r="3.4" fill="#15100a"/>
  <circle cx="117" cy="40" r="3.4" fill="#15100a"/>
  <ellipse cx="100" cy="111" rx="32" ry="46" fill="url(#pa-body)" stroke="#9a6406" stroke-width="1.6"/>
  <g clip-path="url(#pa-bodyclip)">
    <path d="M26 100 Q100 109 174 100" fill="none" stroke="#1d150b" stroke-width="11"/>
    <path d="M28 119 Q100 128 172 119" fill="none" stroke="#1d150b" stroke-width="11"/>
    <path d="M56 162 L56 129 Q100 138 144 129 L144 162 Z" fill="#1d150b"/>
  </g>
  <ellipse cx="86" cy="92" rx="10" ry="15" fill="#ffffff" opacity="0.42"/>
  <ellipse cx="73" cy="105" rx="29" ry="12" fill="#fbfaf6" opacity="0.82" stroke="#d8c79a" stroke-width="1.4" transform="rotate(-40 73 105)"/>
  <ellipse cx="127" cy="105" rx="29" ry="12" fill="#fbfaf6" opacity="0.82" stroke="#d8c79a" stroke-width="1.4" transform="rotate(40 127 105)"/>
  <ellipse cx="100" cy="65" rx="20.5" ry="17.5" fill="#15100a"/>
  <circle cx="91" cy="59" r="3.9" fill="#ffffff"/>
  <circle cx="109" cy="59" r="3.9" fill="#ffffff"/>`
const DISC = {
  yellow: { grad: 'pa-disc-gold', side: '#967216', rim: '#ecc659' },
  brown: { grad: 'pa-disc-brown', side: '#3f1f17', rim: '#9a5847' },
}
function pieceMarkup(cx, cy, discR, owner, queen = false) {
  const s = discR / 80
  const tx = (cx - 100 * s).toFixed(2)
  const ty = (cy - 109 * s).toFixed(2)
  const d = DISC[owner]
  const queenRing = queen ? `<circle cx="100" cy="100" r="71" fill="none" stroke="#cf2a1c" stroke-width="2.8"/>` : ''
  const crown = queen
    ? `<text x="100" y="44" text-anchor="middle" dominant-baseline="central" font-size="30" fill="#ffe07a" stroke="#7a5410" stroke-width="0.6">♛</text>`
    : ''
  return `<g transform="translate(${tx} ${ty}) scale(${s.toFixed(4)})">
    <ellipse cx="100" cy="122" rx="80" ry="68" fill="#000000" opacity="0.16"/>
    <circle cx="100" cy="109" r="80" fill="${d.side}"/>
    <circle cx="100" cy="100" r="80" fill="url(#${d.grad})"/>
    <circle cx="100" cy="100" r="79" fill="none" stroke="${d.rim}" stroke-width="2.2" opacity="0.5"/>
    <ellipse cx="74" cy="72" rx="44" ry="31" fill="#ffffff" opacity="0.06"/>
    ${queenRing}
    <g>${BEE_BODY}${crown}</g>
  </g>`
}

// ---- 히어로 보드(육각 벌집 + 가운데를 가로지르는 노랑 5목, 꿀빛 글로우) ----
const R = 78 // hex 중심→꼭짓점
const SQ3 = Math.sqrt(3)
const hx = (q, r) => R * SQ3 * (q + r / 2)
const hy = (q, r) => R * 1.5 * r
// pointy-top 육각 꼭짓점
function hexPts(cx, cy) {
  let p = ''
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30)
    p += `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)} `
  }
  return p.trim()
}
// 셀: t=타일색, p=말(없으면 null). 가운데 r=1 줄의 노랑 5개가 승리 라인.
const CELLS = [
  { q: 0, r: 1, t: 'y', p: 'y', win: true }, { q: 1, r: 1, t: 'y', p: 'y', win: true },
  { q: 2, r: 1, t: 'y', p: 'y', win: true }, { q: 3, r: 1, t: 'y', p: 'y', win: true },
  { q: 4, r: 1, t: 'y', p: 'y', win: true },
  { q: 0, r: 0, t: 'b', p: 'b' }, { q: 1, r: 0, t: 'y', p: null }, { q: 2, r: 0, t: 'b', p: 'b' }, { q: 3, r: 0, t: 'y', p: null },
  { q: -1, r: 1, t: 'b', p: 'b' }, { q: 5, r: 1, t: 'y', p: null },
  { q: -1, r: 2, t: 'y', p: null }, { q: 0, r: 2, t: 'b', p: 'b' }, { q: 1, r: 2, t: 'y', p: null },
  { q: 2, r: 2, t: 'b', p: null }, { q: 3, r: 2, t: 'y', p: 'y', q2: true }, { q: 4, r: 2, t: 'b', p: 'b' },
]
function boardSvg() {
  const cx = CELLS.map((c) => hx(c.q, c.r))
  const cy = CELLS.map((c) => hy(c.q, c.r))
  const pad = R * 1.25
  const minX = Math.min(...cx) - pad, maxX = Math.max(...cx) + pad
  const minY = Math.min(...cy) - pad, maxY = Math.max(...cy) + pad
  const w = maxX - minX, h = maxY - minY
  const tiles = CELLS.map((c) => {
    const x = hx(c.q, c.r), y = hy(c.q, c.r)
    const grad = c.t === 'y' ? 'tile-y' : 'tile-b'
    const stroke = c.win ? '#e8590c' : c.t === 'y' ? '#6e5114' : '#43280a'
    const sw = c.win ? 6 : 2.4
    return `<polygon points="${hexPts(x, y)}" fill="url(#${grad})" stroke="${stroke}" stroke-width="${sw}"/>`
  }).join('')
  // 승리 라인 꿀빛 글로우(타일 위, 말 아래)
  const wins = CELLS.filter((c) => c.win)
  const lineX1 = hx(wins[0].q, wins[0].r), lineX2 = hx(wins[wins.length - 1].q, wins[wins.length - 1].r)
  const lineY = hy(wins[0].q, wins[0].r)
  const glowLine =
    `<line x1="${lineX1}" y1="${lineY}" x2="${lineX2}" y2="${lineY}" stroke="#f97316" stroke-width="${R * 1.25}" stroke-linecap="round" opacity="0.7" filter="url(#softglow)"/>` +
    `<line x1="${lineX1}" y1="${lineY}" x2="${lineX2}" y2="${lineY}" stroke="#ffe39a" stroke-width="${R * 0.3}" stroke-linecap="round" opacity="0.95" filter="url(#softglow)"/>`
  // 꽃가루 반짝(라인 주변 소수)
  const sparkS = [[lineX1 - 30, lineY - 60], [lineX2 + 24, lineY + 40], [(lineX1 + lineX2) / 2, lineY - 78]]
    .map(([x, y]) => `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="6" fill="#fff1b8"/>`).join('')
  const pieces = CELLS.filter((c) => c.p).map((c) => pieceMarkup(hx(c.q, c.r), hy(c.q, c.r), R * 0.62, c.p === 'y' ? 'yellow' : 'brown', c.q2)).join('')
  return `<svg class="board" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${PIECE_DEFS}
      <radialGradient id="tile-y" cx="38%" cy="30%" r="80%">
        <stop offset="0%" stop-color="#fcdf6e"/><stop offset="55%" stop-color="#f0c531"/><stop offset="100%" stop-color="#d3a013"/>
      </radialGradient>
      <radialGradient id="tile-b" cx="38%" cy="30%" r="80%">
        <stop offset="0%" stop-color="#c4843a"/><stop offset="55%" stop-color="#97581d"/><stop offset="100%" stop-color="#744213"/>
      </radialGradient>
      <filter id="softglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
    </defs>
    ${tiles}${glowLine}${sparkS}${pieces}
  </svg>`
}

// ---- 포스터 HTML ----
const poster = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,900&family=Jua&family=Gothic+A1:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --ink: #43290a;        /* 짙은 밀랍(본문/제목) */
    --ink-soft: #7a4f12;   /* 부드러운 갈색 */
    --gold: #f4c430;       /* 꿀 */
    --amber: #d99405;
    --glow: #f97316;
    --cream: #fffaef;
  }
  html, body { width: 1080px; height: 1400px; }
  .poster {
    width: 1080px; height: 1400px; position: relative; overflow: hidden;
    background: radial-gradient(120% 75% at 50% 8%, #fff5cf 0%, #f7d765 42%, #efbe3a 72%, #e3a722 100%);
    font-family: 'Gothic A1', 'Malgun Gothic', sans-serif; color: var(--ink);
    display: flex; flex-direction: column; align-items: center;
    padding: 86px 80px 64px;
  }
  /* 배경 벌집 무늬(아주 옅게) */
  .bg-hex { position: absolute; background: #6b4a12; opacity: 0.07;
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
  .bg1 { width: 360px; height: 415px; top: -150px; left: -120px; }
  .bg2 { width: 300px; height: 346px; bottom: 250px; right: -130px; opacity: 0.06; }
  .bg3 { width: 200px; height: 230px; top: 120px; right: 60px; opacity: 0.05; }

  .top { display: flex; align-items: center; gap: 22px; z-index: 2; }
  .mascot { width: 116px; height: 116px; flex: none;
    filter: drop-shadow(0 8px 12px rgba(90,55,5,0.32)); }
  .wordmark { font-family: 'Fraunces', Georgia, serif; font-weight: 900; line-height: 0.88;
    letter-spacing: -2px; }
  .wordmark .l1 { font-size: 80px; color: var(--ink); }
  .wordmark .l2 { font-size: 80px; color: var(--amber);
    text-shadow: 0 3px 0 #b9790a, 0 0 1px #5c3c08; }
  .eyebrow { margin-top: 20px; font-size: 24px; font-weight: 800; letter-spacing: 8px;
    color: var(--ink-soft); text-transform: none; z-index: 2; }

  .hero { z-index: 2; margin-top: 18px; width: 100%; display: flex; justify-content: center; }
  .board { width: 960px; height: auto; filter: drop-shadow(0 22px 30px rgba(95,58,8,0.28)); }

  .tagline { z-index: 2; text-align: center; margin-top: 28px; }
  .tagline .big { font-family: 'Jua', 'Malgun Gothic', sans-serif; font-size: 76px; line-height: 1.04;
    color: var(--ink); }
  .tagline .big em { font-style: normal; color: var(--glow);
    text-shadow: 0 2px 0 #c64f0a; }
  .tagline .sub { margin-top: 14px; font-family: 'Jua', sans-serif; font-size: 40px; color: var(--ink-soft); }

  .chips { z-index: 2; margin-top: 34px; display: flex; flex-wrap: wrap; gap: 16px 18px;
    justify-content: center; max-width: 860px; }
  .chip { font-size: 27px; font-weight: 800; color: var(--ink);
    background: var(--cream); border: 3px solid #c79a2f; border-radius: 999px;
    padding: 13px 26px; box-shadow: 0 4px 0 #c79a2f; }

  .foot { z-index: 2; margin-top: auto; width: 100%; display: flex; flex-direction: column;
    align-items: center; gap: 18px; }
  .cta { font-size: 34px; font-weight: 800; color: var(--cream); letter-spacing: 0.5px;
    background: #43290a; border-radius: 999px; padding: 18px 44px;
    box-shadow: 0 8px 0 rgba(40,24,6,0.35); }
  .cta b { color: var(--gold); }
  .credit { font-size: 22px; font-weight: 700; color: var(--ink-soft); text-align: center; }
</style></head><body>
  <div class="poster">
    <div class="bg-hex bg1"></div><div class="bg-hex bg2"></div><div class="bg-hex bg3"></div>
    <div class="top">
      <div class="mascot">${beeMascot}</div>
      <div class="wordmark"><div class="l1">Be the</div><div class="l2">Bee</div></div>
    </div>
    <div class="eyebrow">2인 육각 전략 보드게임</div>
    <div class="hero">${boardSvg()}</div>
    <div class="tagline">
      <div class="big">같은 색 꿀벌 <em>5마리</em>를 한 줄로.</div>
      <div class="sub">벌집의 주인이 되세요.</div>
    </div>
    <div class="chips">
      <span class="chip">👥 사람 vs 사람</span>
      <span class="chip">🤖 AI와 대결</span>
      <span class="chip">👀 AI 관전</span>
      <span class="chip">🔗 온라인 초대 대전</span>
    </div>
    <div class="foot">
      <div class="cta">▶ 무료 플레이 · <b>soomin007.github.io/be-the-bee</b></div>
      <div class="credit">원작 보드게임 김수민 · 김재현 · 조주현 &nbsp;|&nbsp; 프로그램 구현 김수민</div>
    </div>
  </div>
</body></html>`

mkdirSync('public', { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 2 })
await page.setContent(poster, { waitUntil: 'networkidle' })
try { await page.evaluate(() => document.fonts.ready) } catch {}
await page.waitForTimeout(250)
await page.locator('.poster').screenshot({ path: 'public/poster.png' })
await browser.close()
console.log('saved public/poster.png (2160x2800)')
