// 관전 색깔별 난이도 + 성향 설명 + 종료 시 자동 멈춤 점검.
// (관전 진입·색깔별 난이도 선택은 새 게임 마법사 경유 — 2026-06-30 UI 개편)
import { chromium } from 'playwright'
import { prepPage, openWizard, wizardPick } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await prepPage(page, { extra: () => localStorage.removeItem('be-the-bee/settings') })
await page.waitForSelector('.panel')

// 마법사에서 관전: 노랑=어려움·벌집형, 갈색=쉬움 으로 다르게 → 시작(바로 진행)
await openWizard(page)
await wizardPick(page, ['ngOpp:watch', 'ngDiffY:hard', 'ngPersonaY:hive', 'ngDiffB:easy', 'ngStartWatch'])
await page.waitForSelector('.ai-ctl')

// 진행을 잠시 멈춰 두고(빠른 종료 대기 전 설정 확인) 색깔별 셀렉트·성향 설명 확인
await page.locator('button[data-act="toggleWatch"]').click() // ⏸
const diffY = await page.locator('select[data-ctl="difficultyYellow"]').count()
const diffB = await page.locator('select[data-ctl="difficultyBrown"]').count()
const descCount = await page.locator('.persona-desc').count()

const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('be-the-bee/settings')))
const perColor = saved.difficultyYellow === 'hard' && saved.difficultyBrown === 'easy' && saved.personaYellow === 'hive'

await page.locator('.panel').screenshot({ path: 'docs/design/shots/panel-watch2.png' })

// 종료 시 자동 멈춤: 간격 최소로 끝까지 돌린다(▶ 재개)
await page.locator('input[data-ctl="watchDelay"]').fill('100')
await page.locator('input[data-ctl="watchDelay"]').dispatchEvent('change')
await page.locator('button[data-act="toggleWatch"]').click() // ▶ 재개
// 게임 종료까지 대기(결과 모달 등장), 최대 120초(hard 는 수당 수 초 걸릴 수 있음)
let finished = false
for (let i = 0; i < 240; i++) {
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
