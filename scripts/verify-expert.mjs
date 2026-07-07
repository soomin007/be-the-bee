// 전문가 난이도: 새 게임 마법사에 노출 + vs AI 로 한 수 응수 + 에러 없음.
// (해설은 결정적 수에서만 떠 비결정적이라 선택 점검. 난이도 선택은 마법사로 이동 — 2026-06-30 UI 개편)
import { chromium } from 'playwright'
import { prepPage, openWizard, wizardPick } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await prepPage(page)
await page.waitForSelector('svg.board')

// 1) 마법사 AI 단계에 '전문가' 가 있는지 → 선택 후 시작
await openWizard(page)
await wizardPick(page, ['ngOpp:ai'])
const hasExpert = await page.locator('.ng-card button[data-act="ngDiff:expert"]').count()
await wizardPick(page, ['ngDiff:expert', 'ngStartAi'])

// 2) 사람(노랑) 한 수 → 전문가(갈색) 응수 → 갈색 자원이 줄었는지로 확인 + 에러 0.
//    (전문가 MCTS 는 수 초 걸리고, ① 타일 2개로 응수할 수도 있어 "말 2개" 단언은 틀린다.)
const c = page.locator('button[data-act="tileAndPiece"]')
if (await c.count()) await c.first().click()
await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
const aiMoved = await page
  .waitForFunction(
    () => {
      const t = document.querySelector('.board-status')?.textContent ?? ''
      const m = t.match(/갈색: 타일 (\d+|∞)/)
      return m !== null && m[1] !== '∞' && Number(m[1]) < 30
    },
    { timeout: 30000 },
  )
  .then(() => true)
  .catch(() => false)

await browser.close()
console.log({ hasExpert, aiMoved, errors: errors.length })
const ok = hasExpert === 1 && aiMoved && errors.length === 0
console.log(ok ? 'PASS: 전문가 마법사 노출 + vs AI 응수 + 에러 없음' : 'FAIL')
process.exit(ok ? 0 : 1)
