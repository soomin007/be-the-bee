// 모바일 뷰포트 스크린샷(쾌적화 검증). dev 서버 URL 을 인자로(기본 5199).
//   node scripts/shot-mobile.mjs http://localhost:5199/
// 결과: scratchpad 의 mobile-*.png (세로/가로/작은폰).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = process.argv[2] ?? 'http://localhost:5199/'
const OUT = process.argv[3] ?? '.'
mkdirSync(OUT, { recursive: true })

const SHOTS = [
  { name: 'portrait', width: 390, height: 844 }, // iPhone 13/14 세로
  { name: 'landscape', width: 844, height: 390 }, // 가로
  { name: 'small', width: 360, height: 640 }, // 보급형 안드로이드 세로
]

const browser = await chromium.launch()
for (const s of SHOTS) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  // 튜토리얼 오버레이가 보드를 덮지 않게 미리 '봤음' 표시(known_issues).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('be-the-bee/tutorial-seen', '1')
    } catch {
      /* 무시 */
    }
  })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('svg.board', { timeout: 8000 }).catch(() => {})
  await page.screenshot({ path: `${OUT}/mobile-${s.name}.png` })
  console.log(`shot: mobile-${s.name}.png (${s.width}x${s.height})`)
  await ctx.close()
}
await browser.close()
console.log('done')
