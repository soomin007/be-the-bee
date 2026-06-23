// 기보 분석(복기 해설) + 공유 버튼 점검. 실제 공유 코드(vsAi 35수, 노랑 승)를 가져와
// 분석 모드로 진입하는지, 결정적 장면에 해설(✓/✗)이 뜨는지, 패널 공유 버튼이 동작하는지 본다.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

// 사용자가 보낸 실제 기보(34수 missBlock → 35수 win).
const CODE =
  'BTB1:eyJ2IjoxLCJtdiI6InQgLTEgMCAwIDA7dCAxIC0xIC0xIDA7dCAtMSAxIDEgLTE7dCAxIDEgLTEgMTt0IC0yIDIgMSAwOzIgMSAtMiAxIDI7dCAxIC0zIDEgLTM7dCAtMSAyIC0xIDI7dCAtMSAzIC0xIDM7dCAtMSAtMSAtMSAtMTt0IC0xIC0yIC0xIC0yO3QgMCAyIDAgMjt0IDEgMyAtMiAyO3QgMiAwIDEgMTt0IDAgMyAyIDA7dCAzIDAgMyAwOzIgLTIgMyAtMyAzO3QgLTIgMSAtMiAxO3QgMCAxIDAgMTt0IDAgLTEgMCAtMTt0IC0zIDIgLTMgMjt0IDIgLTEgMSAyO3QgMiAtMyAyIC0zO3QgMiAyIDIgMjt0IDMgMiAzIDI7dCAyIDEgMiAxO3QgNCAtMSA0IC0xOzIgMiAtMiAtMiAtMTt0IDAgLTMgMCAtMzt0IC0xIC0zIC0xIC0zOzIgMyAtMyA0IC0zO3QgMSAtNCAxIC00O3QgNCAtMiAzIC0zO3QgLTIgMCAtMiAwO3QgNCAwIDQgLTMiLCJpbmYiOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODIxODc0MTk1NDV9'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1100, height: 860 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('be-the-bee/tutorial-seen', '1')
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')

// 1) 공유 코드 가져오기 → 분석(복기) 모드 진입
page.once('dialog', (d) => d.accept(CODE))
await page.locator('button[data-act="openSaves"]').click()
await page.waitForSelector('.saves-card')
await page.locator('button[data-act="importGame"]').click()
await page.waitForSelector('.replay-nav', { timeout: 4000 })
const enteredReplay = (await page.locator('.replay-nav').count()) > 0

// 2) 마지막 수(35수) → win 해설(✓, good)
await page.locator('button[data-act="replayLast"]').click()
await page.waitForTimeout(80)
const winText = (await page.locator('.coach-comment.good').first().textContent()) ?? ''
const winOk = winText.includes('5목') // "5목 완성 — 승부를 냈어요!"

// 3) 한 수 뒤로(34수) → missBlock 해설(✗, bad)
await page.locator('button[data-act="replayPrev"]').click()
await page.waitForTimeout(80)
const badText = (await page.locator('.coach-comment.bad').first().textContent()) ?? ''
const blunderOk = badText.includes('막지')

// 4) 복기 종료 → 패널 "공유하기" 버튼이 BTB1 코드를 클립보드에 복사
await page.locator('button[data-act="replayExit"]').click()
await page.waitForTimeout(80)
const shareBtn = page.locator('.panel button[data-act="shareGame"]')
const shareBtnOk = (await shareBtn.count()) > 0
await shareBtn.first().click()
await page.waitForTimeout(120)
const copied = await page.evaluate(() => navigator.clipboard.readText())
const shareCopyOk = typeof copied === 'string' && copied.startsWith('BTB1:')

await browser.close()
console.log({ enteredReplay, winOk, blunderOk, shareBtnOk, shareCopyOk, errors: errors.length })
const ok = enteredReplay && winOk && blunderOk && shareBtnOk && shareCopyOk && errors.length === 0
console.log(ok ? 'PASS: 가져오기→분석 해설(✓/✗) + 패널 공유 버튼' : 'FAIL')
process.exit(ok ? 0 : 1)
