// 공유 미리보기(og-cover.png 1200x630) + 애플 터치 아이콘(apple-touch-icon.png 180x180) 생성.
// dev 서버 불필요(page.setContent). 산출물은 public/ 로 → 빌드 시 배포에 포함.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const beeSvg = readFileSync('public/favicon.svg', 'utf8')
const browser = await chromium.launch()

// 1) OG 커버 1200x630
const cover = `
<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  .wrap {
    width: 1200px; height: 630px; display: flex; align-items: center; gap: 60px;
    padding: 0 90px; font-family: system-ui, 'Segoe UI', sans-serif;
    background: radial-gradient(circle at 22% 35%, #ffe9a8 0%, #f7d35e 45%, #eab92f 100%);
    position: relative; overflow: hidden;
  }
  .hex { position: absolute; width: 150px; height: 173px; opacity: 0.18;
    background: #6b4a12; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
  .h1 { top: -50px; right: 120px; } .h2 { bottom: -70px; right: 360px; opacity: 0.12; }
  .h3 { top: 180px; right: -40px; opacity: 0.12; }
  .bee { width: 300px; height: 300px; filter: drop-shadow(0 10px 16px rgba(80,50,5,0.3)); flex: none; }
  .txt { position: relative; z-index: 2; }
  .title { font-size: 104px; font-weight: 900; color: #4a2f0c; letter-spacing: -1px; line-height: 1; }
  .tag { font-size: 40px; font-weight: 700; color: #7a4f12; margin-top: 22px; }
  .modes { font-size: 28px; font-weight: 600; color: #8a6a2a; margin-top: 18px; }
</style></head><body>
  <div class="wrap">
    <div class="hex h1"></div><div class="hex h2"></div><div class="hex h3"></div>
    <div class="bee">${beeSvg}</div>
    <div class="txt">
      <div class="title">Be the Bee</div>
      <div class="tag">벌집의 주인이 되세요!</div>
      <div class="modes">🐝 사람 vs 사람 · vs AI · AI 관전</div>
    </div>
  </div>
</body></html>`
const p1 = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await p1.setContent(cover, { waitUntil: 'networkidle' })
await p1.locator('.wrap').screenshot({ path: 'public/og-cover.png' })

// 2) 애플 터치 아이콘 180x180 (파비콘을 래스터화)
const icon = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0} body{width:180px;height:180px} svg{width:180px;height:180px;display:block}
</style></head><body>${beeSvg}</body></html>`
const p2 = await browser.newPage({ viewport: { width: 180, height: 180 } })
await p2.setContent(icon, { waitUntil: 'networkidle' })
await p2.screenshot({ path: 'public/apple-touch-icon.png' })

await browser.close()
console.log('saved public/og-cover.png (1200x630), public/apple-touch-icon.png (180x180)')
