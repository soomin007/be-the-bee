// 관전 색깔별 난이도 + 성향 설명 + 종료 시 자동 멈춤 점검.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.setItem('be-the-bee/tutorial-seen', '1')) // 튜토리얼 끔
await page.evaluate(() => localStorage.removeItem('be-the-bee/settings'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.panel')

// 관전 모드
await page.locator('button[data-act="menuMode"]').click()
await page.locator('button[data-act="setMode:watch"]').click()
await page.waitForSelector('.ai-ctl')

// 색깔별 난이도 셀렉트 2개 + 성향 셀렉트 2개 + 성향 설명 2줄
const diffY = await page.locator('select[data-ctl="difficultyYellow"]').count()
const diffB = await page.locator('select[data-ctl="difficultyBrown"]').count()
const descCount = await page.locator('.persona-desc').count()

// 노랑=어려움, 갈색=쉬움 으로 다르게 설정 → persist 확인
await page.locator('select[data-ctl="difficultyYellow"]').selectOption('hard')
await page.locator('select[data-ctl="difficultyBrown"]').selectOption('easy')
await page.locator('select[data-ctl="personaYellow"]').selectOption('hive')
await page.waitForTimeout(80)
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('be-the-bee/settings')))
const perColor = saved.difficultyYellow === 'hard' && saved.difficultyBrown === 'easy' && saved.personaYellow === 'hive'

await page.locator('.panel').screenshot({ path: 'docs/design/shots/panel-watch2.png' })

// 종료 시 자동 멈춤: 빠르게 끝까지 돌려본다(간격 최소 + ▶ 시작)
await page.locator('input[data-ctl="watchDelay"]').fill('100')
await page.locator('input[data-ctl="watchDelay"]').dispatchEvent('change')
await page.locator('button[data-act="toggleWatch"]').click() // ▶ 시작
// 게임 종료까지 대기(결과 모달 등장) — 최대 60초
let finished = false
for (let i = 0; i < 120; i++) {
  if ((await page.locator('.modal-card').count()) > 0) { finished = true; break }
  await page.waitForTimeout(500)
}
// 종료 후 토글 버튼이 다시 "▶ 시작"(멈춤 상태)인지
let autoPaused = false
if (finished) {
  const label = (await page.locator('button[data-act="toggleWatch"]').textContent())?.trim() ?? ''
  autoPaused = label.includes('시작')
}

await browser.close()
console.log({ diffY, diffB, descCount, perColor, finished, autoPaused, errors: errors.length })
const ok = diffY === 1 && diffB === 1 && descCount === 2 && perColor && finished && autoPaused && errors.length === 0
console.log(ok ? 'PASS: 색깔별 난이도 + 성향 설명 + 종료 자동 멈춤' : 'FAIL')
process.exit(ok ? 0 : 1)
