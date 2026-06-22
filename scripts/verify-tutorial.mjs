// 첫 접속 튜토리얼: 자동 표시 → 페이지 넘김 → 완료 시 재표시 안 됨 → 재열기 버튼.
// + 페이지 스크린샷 몇 장 저장.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })

// 1) 첫 접속 자동 표시
await page.waitForSelector('.tut-card', { timeout: 5000 })
const autoShown = (await page.locator('.tut-card').count()) === 1
const totalDots = await page.locator('.tut-dot').count()
await page.locator('.tut-card').screenshot({ path: 'docs/design/shots/tutorial-1.png' })

// 2) 다음으로 몇 장 넘기기
await page.locator('button[data-tut="next"]').click()
await page.locator('button[data-tut="next"]').click()
await page.waitForTimeout(150)
const stepText = (await page.locator('.tut-step').textContent())?.trim()
await page.locator('.tut-card').screenshot({ path: 'docs/design/shots/tutorial-3.png' })

// 끝까지 가서 "시작하기" → 닫힘
for (let i = 0; i < totalDots; i++) {
  const btn = page.locator('button[data-tut="next"]')
  if (await btn.count()) await btn.click()
  await page.waitForTimeout(60)
}
const closedAfterFinish = (await page.locator('.tut-card').count()) === 0

// 3) 새로고침 → 재표시 안 됨(seen 플래그)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const notShownAgain = (await page.locator('.tut-card').count()) === 0

// 4) 설정의 📖 튜토리얼로 재열기
await page.locator('button[data-act="tutorial"]').click()
await page.waitForSelector('.tut-card')
const reopened = (await page.locator('.tut-card').count()) === 1

await browser.close()
console.log({ autoShown, totalDots, stepText, closedAfterFinish, notShownAgain, reopened, errors: errors.length })
const ok =
  autoShown && totalDots === 7 && stepText === '3 / 7' && closedAfterFinish && notShownAgain && reopened && errors.length === 0
console.log(ok ? 'PASS: 튜토리얼 자동표시·넘김·완료기억·재열기' : 'FAIL')
process.exit(ok ? 0 : 1)
