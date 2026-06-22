// 벌 테마 2단계 잔여(꿀 차오름·붕붕·날갯짓음) 스모크: 힌트 켜고 여러 수를 둬도
// 새 코드 경로(newlyHivedCells 매 수 실행 + buzz 힌트 렌더 + fx 스폰)가 에러 없이 돈다.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')

// 훈수 모드 ON → 리치 칸이 buzz 클래스로 렌더된다(리치 상황이면).
await page.locator('button[data-act="toggleHints"]').click()

async function play() {
  const c = page.locator('button[data-act="tileAndPiece"]')
  if (await c.count()) await c.first().click()
  const fr = page.locator('svg.board polygon[opacity="0.22"]')
  if (!(await fr.count())) return
  await fr.first().click({ force: true })
  const tg = page.locator('svg.board polygon[stroke="#16a34a"]')
  if (!(await tg.count())) return
  await tg.first().click({ force: true })
}
for (let i = 0; i < 14; i++) await play()

const pieces = await page.locator('svg.board circle.piece').count()
const buzzCss = await page.evaluate(() => {
  // .buzz / .honey-rise 키프레임이 스타일시트에 존재하는지(가벼운 존재 확인)
  const txt = [...document.styleSheets].flatMap((s) => {
    try {
      return [...s.cssRules].map((r) => r.cssText)
    } catch {
      return []
    }
  }).join(' ')
  return { hasBuzz: txt.includes('reach-buzz'), hasHoney: txt.includes('honey-rise') }
})
await browser.close()
console.log({ pieces, ...buzzCss, errors: errors.length })
const ok = pieces >= 10 && buzzCss.hasBuzz && buzzCss.hasHoney && errors.length === 0
console.log(ok ? 'PASS: fx 스모크(에러 없음 + 모션 키프레임 존재)' : 'FAIL')
process.exit(ok ? 0 : 1)
