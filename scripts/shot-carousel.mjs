// 인스타 캐러셀(4:5 1080x1350, 2x) 7장 생성 — 포스터만 봐도 규칙·플레이·특징을 다 알 수 있게.
//   node scripts/shot-carousel.mjs   →  public/carousel/slide-01.png … slide-07.png
// 게임의 실제 말 아트(piece-art 스펙)·꿀 팔레트를 그대로 써서 보드 다이어그램을 그린다.
// 외부 이미지 0 — SVG/CSS + 구글폰트만.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const beeMascot = readFileSync('public/favicon.svg', 'utf8')

// ---- 게임 말 아트(piece-art.ts 와 동일 스펙) ----
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
  <circle cx="83" cy="40" r="3.4" fill="#15100a"/><circle cx="117" cy="40" r="3.4" fill="#15100a"/>
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
  <circle cx="91" cy="59" r="3.9" fill="#ffffff"/><circle cx="109" cy="59" r="3.9" fill="#ffffff"/>`
const DISC = {
  yellow: { grad: 'pa-disc-gold', side: '#967216', rim: '#ecc659' },
  brown: { grad: 'pa-disc-brown', side: '#3f1f17', rim: '#9a5847' },
}
function pieceMarkup(cx, cy, discR, owner, queen = false) {
  const s = discR / 80
  const tx = (cx - 100 * s).toFixed(2), ty = (cy - 109 * s).toFixed(2)
  const d = DISC[owner]
  const queenRing = queen ? `<circle cx="100" cy="100" r="71" fill="none" stroke="#cf2a1c" stroke-width="2.8"/>` : ''
  const crown = queen ? `<text x="100" y="44" text-anchor="middle" dominant-baseline="central" font-size="30" fill="#ffe07a" stroke="#7a5410" stroke-width="0.6">♛</text>` : ''
  return `<g transform="translate(${tx} ${ty}) scale(${s.toFixed(4)})">
    <ellipse cx="100" cy="122" rx="80" ry="68" fill="#000" opacity="0.16"/>
    <circle cx="100" cy="109" r="80" fill="${d.side}"/>
    <circle cx="100" cy="100" r="80" fill="url(#${d.grad})"/>
    <circle cx="100" cy="100" r="79" fill="none" stroke="${d.rim}" stroke-width="2.2" opacity="0.5"/>
    <ellipse cx="74" cy="72" rx="44" ry="31" fill="#fff" opacity="0.06"/>
    ${queenRing}<g>${BEE_BODY}${crown}</g></g>`
}

// ---- 육각 보드 다이어그램(범용) ----
const R = 70, SQ3 = Math.sqrt(3)
const hx = (q, r) => R * SQ3 * (q + r / 2)
const hy = (q, r) => R * 1.5 * r
function hexPts(cx, cy) {
  let p = ''
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30)
    p += `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)} `
  }
  return p.trim()
}
function plusMark(cx, cy, s = 1) {
  return `<g stroke="#e8590c" stroke-width="${8 * s}" stroke-linecap="round"><line x1="${cx - 18 * s}" y1="${cy}" x2="${cx + 18 * s}" y2="${cy}"/><line x1="${cx}" y1="${cy - 18 * s}" x2="${cx}" y2="${cy + 18 * s}"/></g>`
}
function padlock(cx, cy, s = 1) {
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <path d="M -11 0 v -9 a 11 11 0 0 1 22 0 v 9" fill="none" stroke="#3a2408" stroke-width="6"/>
    <rect x="-17" y="0" width="34" height="27" rx="6" fill="#5a3a10" stroke="#2e1d07" stroke-width="2.5"/>
    <circle cx="0" cy="11" r="4" fill="#ffd86b"/><rect x="-2" y="12" width="4" height="9" rx="2" fill="#ffd86b"/>
  </g>`
}
// cells: {q,r, t:'y'|'b'|'ghost', p:'y'|'b'|null, win, queen, ring, mark:'plus', lock}
function board(cells, { glow = false } = {}) {
  const xs = cells.map((c) => hx(c.q, c.r)), ys = cells.map((c) => hy(c.q, c.r))
  const pad = R * 1.3
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad
  let tiles = '', pieces = '', over = '', glowLine = ''
  for (const c of cells) {
    const x = hx(c.q, c.r), y = hy(c.q, c.r)
    if (c.t === 'ghost') {
      tiles += `<polygon points="${hexPts(x, y)}" fill="#fff7e0" fill-opacity="0.5" stroke="#e8590c" stroke-width="4.5" stroke-dasharray="11 9"/>`
    } else {
      const grad = c.t === 'y' ? 'tile-y' : 'tile-b'
      const stroke = c.win ? '#e8590c' : c.t === 'y' ? '#6e5114' : '#43280a'
      tiles += `<polygon points="${hexPts(x, y)}" fill="url(#${grad})" stroke="${stroke}" stroke-width="${c.win ? 6 : 2.4}"/>`
    }
    if (c.ring) tiles += `<circle cx="${x}" cy="${y}" r="${R * 0.78}" fill="none" stroke="#e8590c" stroke-width="5" opacity="0.9"/>`
    if (c.p) pieces += pieceMarkup(x, y, R * 0.62, c.p === 'y' ? 'yellow' : 'brown', c.queen)
    if (c.mark === 'plus') over += plusMark(x, y, 1.05)
    if (c.lock) over += padlock(x, y - R * 0.02, 1.25)
  }
  if (glow) {
    const wc = cells.filter((c) => c.win)
    const x1 = hx(wc[0].q, wc[0].r), x2 = hx(wc[wc.length - 1].q, wc[wc.length - 1].r), yy = hy(wc[0].q, wc[0].r)
    glowLine =
      `<line x1="${x1}" y1="${yy}" x2="${x2}" y2="${yy}" stroke="#f97316" stroke-width="${R * 1.25}" stroke-linecap="round" opacity="0.68" filter="url(#sg)"/>` +
      `<line x1="${x1}" y1="${yy}" x2="${x2}" y2="${yy}" stroke="#ffe39a" stroke-width="${R * 0.3}" stroke-linecap="round" opacity="0.95" filter="url(#sg)"/>`
  }
  return `<svg class="board" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}" xmlns="http://www.w3.org/2000/svg">
    <defs>${PIECE_DEFS}
      <radialGradient id="tile-y" cx="38%" cy="30%" r="80%"><stop offset="0%" stop-color="#fcdf6e"/><stop offset="55%" stop-color="#f0c531"/><stop offset="100%" stop-color="#d3a013"/></radialGradient>
      <radialGradient id="tile-b" cx="38%" cy="30%" r="80%"><stop offset="0%" stop-color="#c4843a"/><stop offset="55%" stop-color="#97581d"/><stop offset="100%" stop-color="#744213"/></radialGradient>
      <filter id="sg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
    </defs>${tiles}${glowLine}${pieces}${over}</svg>`
}

// ---- 슬라이드별 보드 ----
const HERO = [
  { q: 0, r: 1, t: 'y', p: 'y', win: true }, { q: 1, r: 1, t: 'y', p: 'y', win: true }, { q: 2, r: 1, t: 'y', p: 'y', win: true },
  { q: 3, r: 1, t: 'y', p: 'y', win: true }, { q: 4, r: 1, t: 'y', p: 'y', win: true },
  { q: 0, r: 0, t: 'b', p: 'b' }, { q: 1, r: 0, t: 'y' }, { q: 2, r: 0, t: 'b', p: 'b' }, { q: 3, r: 0, t: 'y' },
  { q: -1, r: 1, t: 'b', p: 'b' }, { q: 5, r: 1, t: 'y' },
  { q: -1, r: 2, t: 'y' }, { q: 0, r: 2, t: 'b', p: 'b' }, { q: 1, r: 2, t: 'y' }, { q: 2, r: 2, t: 'b' }, { q: 3, r: 2, t: 'y', p: 'y', queen: true }, { q: 4, r: 2, t: 'b', p: 'b' },
]
const WIN = [
  { q: 0, r: 1, t: 'y', p: 'y', win: true }, { q: 1, r: 1, t: 'y', p: 'y', win: true }, { q: 2, r: 1, t: 'y', p: 'y', win: true },
  { q: 3, r: 1, t: 'y', p: 'y', win: true }, { q: 4, r: 1, t: 'y', p: 'y', win: true },
  { q: 1, r: 0, t: 'b', p: 'b' }, { q: 3, r: 0, t: 'b', p: 'b' }, { q: 2, r: 2, t: 'b', p: 'b' },
]
const TURN_A = [
  { q: 0, r: 0, t: 'y' }, { q: 1, r: 0, t: 'b' }, { q: 0, r: 1, t: 'y' },
  { q: 1, r: 1, t: 'ghost', mark: 'plus' }, { q: 2, r: 0, t: 'ghost', mark: 'plus' },
]
const TURN_B = [
  { q: 0, r: 0, t: 'y' }, { q: 1, r: 0, t: 'b' }, { q: 0, r: 1, t: 'y' },
  { q: 2, r: 0, t: 'y', p: 'y', ring: true }, { q: 1, r: 1, t: 'ghost', mark: 'plus' },
]
const HIVE = [
  { q: 0, r: 1, t: 'y', win: true }, { q: 1, r: 1, t: 'y', win: true }, { q: 2, r: 1, t: 'y', win: true, p: 'y' },
  { q: 3, r: 1, t: 'y', win: true }, { q: 4, r: 1, t: 'y', win: true, lock: true },
  { q: 0, r: 0, t: 'y' }, { q: 1, r: 0, t: 'b' }, { q: 3, r: 0, t: 'b', p: 'b' }, { q: 2, r: 2, t: 'b' },
]

// ---- 공통 head(폰트·토큰) + 캐러셀 CSS ----
const HEAD = `<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,900&family=Jua&family=Gothic+A1:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--ink:#43290a;--ink-soft:#7a4f12;--gold:#f4c430;--amber:#d99405;--glow:#f97316;--cream:#fffaef}
  html,body{width:1080px;height:1350px}
  .poster{width:1080px;height:1350px;position:relative;overflow:hidden;display:flex;flex-direction:column;
    padding:58px 70px 50px;background:radial-gradient(120% 75% at 50% 8%,#fff5cf 0%,#f7d765 42%,#efbe3a 72%,#e3a722 100%);
    font-family:'Gothic A1','Malgun Gothic',sans-serif;color:var(--ink)}
  .bg-hex{position:absolute;background:#6b4a12;opacity:0.06;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
  .bg1{width:340px;height:392px;top:-130px;left:-110px}.bg2{width:260px;height:300px;bottom:-90px;right:-90px}
  .head{display:flex;justify-content:space-between;align-items:center;z-index:2}
  .brand{display:flex;align-items:center;gap:12px;font-family:'Fraunces',Georgia,serif;font-weight:900;font-size:30px;color:#5a3a10}
  .brand svg{width:46px;height:46px;display:block}
  .pageno{font-weight:800;font-size:25px;color:var(--ink-soft);letter-spacing:2px}
  .kicker{align-self:flex-start;margin-top:26px;background:#43290a;color:var(--cream);font-weight:800;font-size:24px;
    padding:9px 22px;border-radius:999px;letter-spacing:1px;z-index:2}
  .title{margin-top:16px;font-family:'Jua','Malgun Gothic',sans-serif;font-size:64px;line-height:1.04;color:var(--ink);z-index:2}
  .title em{font-style:normal;color:var(--glow);text-shadow:0 2px 0 #c64f0a}
  .body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;width:100%;z-index:2}
  .lead{font-size:33px;line-height:1.46;text-align:center;color:#5a3a10;max-width:900px}
  .lead b{color:#b35309}
  .hero{width:100%;display:flex;justify-content:center}
  .board{display:block;height:auto;filter:drop-shadow(0 16px 22px rgba(95,58,8,0.24))}
  .hero .board{width:740px}
  .dots{display:flex;gap:13px;justify-content:center;z-index:2;padding-top:6px}
  .dot{width:23px;height:26px;background:#6b4a12;opacity:0.22;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}
  .dot.on{opacity:1;background:#e8590c}
  /* 말풍선/구성요소 */
  .wordmark{font-family:'Fraunces',Georgia,serif;font-weight:900;line-height:0.86;letter-spacing:-2px;display:flex;flex-direction:column}
  .wordmark .l1{color:var(--ink)}.wordmark .l2{color:var(--amber);text-shadow:0 3px 0 #b9790a}
  .two{display:flex;gap:48px;justify-content:center;width:100%}
  .opt{display:flex;flex-direction:column;align-items:center;gap:16px}
  .optlabel{font-family:'Jua',sans-serif;font-size:36px;color:var(--ink)}
  .opt .board{width:340px}
  .cards{display:flex;flex-direction:column;gap:30px;width:100%;max-width:880px}
  .rcard{display:flex;align-items:center;gap:28px;background:var(--cream);border:3px solid #c79a2f;border-radius:28px;padding:32px 36px;box-shadow:0 6px 0 #c79a2f}
  .ric{font-size:66px;flex:none;line-height:1}
  .rt{font-family:'Jua',sans-serif;font-size:42px;color:var(--ink)}
  .rd{font-size:29px;color:var(--ink-soft);margin-top:6px}
  .modes{display:grid;grid-template-columns:1fr 1fr;gap:22px;width:100%;max-width:900px}
  .mcard{background:var(--cream);border:3px solid #c79a2f;border-radius:24px;padding:26px 28px;box-shadow:0 5px 0 #c79a2f;display:flex;flex-direction:column;gap:6px}
  .mcard .mi{font-size:46px;line-height:1}
  .mcard b{font-size:33px;color:var(--ink)}
  .mcard small{font-size:24px;color:var(--ink-soft)}
  .pills{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;max-width:900px}
  .pills span{background:#fff3cf;border:2px solid #c79a2f;border-radius:999px;padding:11px 22px;font-weight:800;font-size:25px;color:var(--ink)}
  .swipe{font-family:'Jua',sans-serif;font-size:36px;color:#b35309}
  .ctag{font-family:'Jua',sans-serif;font-size:46px;color:var(--ink-soft);text-align:center}
  .bigbee svg{width:220px;height:220px;display:block;filter:drop-shadow(0 10px 14px rgba(90,55,5,.3))}
  .ctaurl{font-weight:800;font-size:40px;color:var(--cream);background:#43290a;border-radius:999px;padding:18px 42px;box-shadow:0 8px 0 rgba(40,24,6,.35)}
  .credit{font-weight:700;font-size:22px;color:var(--ink-soft);text-align:center}
  /* 표지/CTA 변형 */
  .cover .wordmark{align-items:center}
  .cover .wordmark .l1,.cover .wordmark .l2{font-size:104px}
  .cover .title{align-self:center}
</style>`

const dots = (n) => `<div class="dots">${Array.from({ length: 7 }, (_, i) => `<span class="dot${i + 1 === n ? ' on' : ''}"></span>`).join('')}</div>`
function slide({ n, kicker, titleHtml, bodyHtml, variant = '' }) {
  return `<!doctype html><html lang="ko"><head>${HEAD}</head><body>
    <div class="poster ${variant}">
      <div class="bg-hex bg1"></div><div class="bg-hex bg2"></div>
      <div class="head"><div class="brand">${beeMascot}<span>Be the Bee</span></div><div class="pageno">${String(n).padStart(2, '0')} / 07</div></div>
      ${kicker ? `<div class="kicker">${kicker}</div>` : ''}
      ${titleHtml ? `<div class="title">${titleHtml}</div>` : ''}
      <div class="body">${bodyHtml}</div>
      ${dots(n)}
    </div></body></html>`
}

const SLIDES = [
  // 1 — 표지
  slide({
    n: 1, variant: 'cover',
    titleHtml: `<div class="wordmark"><span class="l1">Be the</span><span class="l2">Bee</span></div>`,
    bodyHtml: `<div class="ctag">같은 색 꿀벌 5마리를 한 줄로</div>
      <div class="hero">${board(HERO, { glow: true })}</div>
      <div class="swipe">👉 넘겨서 규칙 한눈에 보기</div>`,
  }),
  // 2 — 목표
  slide({
    n: 2, kicker: '목표', titleHtml: `꿀벌 <em>5개</em>를 한 줄로!`,
    bodyHtml: `<div class="hero">${board(WIN, { glow: true })}</div>
      <p class="lead">내 말(꿀벌) <b>5개</b>가 어느 방향이든 <b>한 줄</b>로 이어지면 <b>그 즉시 승리</b>예요.</p>`,
  }),
  // 3 — 한 턴
  slide({
    n: 3, kicker: '한 턴에 둘 중 하나', titleHtml: `타일을 깔고, 벌을 올려요`,
    bodyHtml: `<div class="two">
        <div class="opt"><div class="optlabel">① 타일 2개</div>${board(TURN_A)}</div>
        <div class="opt"><div class="optlabel">② 타일 1개 + 말 1개</div>${board(TURN_B)}</div>
      </div>
      <p class="lead">타일은 <b>이미 놓인 타일 옆</b>에 붙여서 놓아요. 보드가 한 판마다 자라나요.</p>`,
  }),
  // 4 — 벌집
  slide({
    n: 4, kicker: '벌집', titleHtml: `같은 색 타일 <em>5개</em> = 벌집`,
    bodyHtml: `<div class="hero">${board(HIVE)}</div>
      <p class="lead">벌집이 완성되면 그 위에는 <b>주인만</b> 새 말을 올릴 수 있어요. 상대의 길목을 잠그는 <b>핵심 전략</b>이에요.</p>`,
  }),
  // 5 — 승부
  slide({
    n: 5, kicker: '승부', titleHtml: `이렇게 이겨요`,
    bodyHtml: `<div class="cards">
        <div class="rcard"><div class="ric">🏆</div><div><div class="rt">말 5개를 한 줄로</div><div class="rd">잇는 순간 바로 승리</div></div></div>
        <div class="rcard"><div class="ric">🍯</div><div><div class="rt">타일을 다 쓰면</div><div class="rd">벌집 점수로 결정 (긴 벌집일수록 높아요)</div></div></div>
      </div>`,
  }),
  // 6 — 즐기는 법
  slide({
    n: 6, kicker: '즐기는 법', titleHtml: `혼자도, 친구와도`,
    bodyHtml: `<div class="modes">
        <div class="mcard"><span class="mi">👥</span><b>사람 vs 사람</b><small>한 기기에서 번갈아</small></div>
        <div class="mcard"><span class="mi">🤖</span><b>AI와 대결</b><small>난이도·성향 선택</small></div>
        <div class="mcard"><span class="mi">👀</span><b>AI 관전</b><small>두 AI의 수 구경</small></div>
        <div class="mcard"><span class="mi">🔗</span><b>온라인 초대 대전</b><small>링크로 친구와 1:1</small></div>
      </div>
      <div class="pills"><span>👑 여왕벌</span><span>♾️ 무한 모드</span><span>📖 규칙 튜토리얼</span><span>↩️ 복기</span><span>🎨 테마·3D</span></div>`,
  }),
  // 7 — CTA
  slide({
    n: 7, variant: 'cta', titleHtml: `지금, <em>무료로</em> 플레이`,
    bodyHtml: `<div class="bigbee">${beeMascot}</div>
      <div class="ctaurl">soomin007.github.io/be-the-bee</div>
      <p class="lead">설치 없이 바로 플레이. 친구에게 <b>링크만 보내면</b> 온라인 1:1 대전.</p>
      <div class="credit">원작 보드게임 김수민 · 김재현 · 조주현 &nbsp;|&nbsp; 프로그램 구현 김수민</div>`,
  }),
]

mkdirSync('public/carousel', { recursive: true })
const browser = await chromium.launch()
for (let i = 0; i < SLIDES.length; i++) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 })
  await page.setContent(SLIDES[i], { waitUntil: 'networkidle' })
  try { await page.evaluate(() => document.fonts.ready) } catch {}
  await page.waitForTimeout(200)
  const name = `slide-${String(i + 1).padStart(2, '0')}`
  await page.locator('.poster').screenshot({ path: `public/carousel/${name}.png` })
  await page.close()
  console.log(`saved public/carousel/${name}.png`)
}
await browser.close()
