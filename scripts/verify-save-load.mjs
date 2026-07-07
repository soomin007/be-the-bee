// 자동 이어하기 + 저장 보관함(여러 슬롯) + 기보 공유(코드 내보내기/가져오기) 점검.
import { chromium } from 'playwright'
import { prepPage, dismissWizard, openWizard, wizardPick } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1100, height: 860 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await prepPage(page) // 첫 접속 오버레이 스킵 + 새 게임 마법사 닫기
await page.waitForSelector('svg.board')

const pieces = () => page.locator('svg.board circle.piece').count()
async function play() {
  const c = page.locator('button[data-act="tileAndPiece"]')
  if (await c.count()) await c.first().click()
  await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
  await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
}
const openSaves = async () => {
  await page.locator('button[data-act="openSaves"]').click()
  await page.waitForSelector('.saves-card')
}

// 1) 두 수 → 새로고침 → 자동 복원(자동저장이 있으면 마법사는 안 뜬다)
await play()
await play()
const afterPlay = await pieces()
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')
await dismissWizard(page, 800) // 혹시 떠 있으면 닫기(방어)
const resumeOk = afterPlay === 2 && (await pieces()) === 2

// 2) 보관함에 저장 → 슬롯 1개. 공유 코드 복사(현재=2말) → 클립보드 BTB1
await openSaves()
await page.locator('.saves-top button[data-act="saveGame"]').click()
await page.waitForTimeout(80)
const slotCount = await page.locator('.save-row').count()
await page.locator('button[data-act="exportCurrent"]').click()
await page.waitForTimeout(120)
const code = await page.evaluate(() => navigator.clipboard.readText())
const codeOk = typeof code === 'string' && code.startsWith('BTB1:')
await page.locator('button[data-act="closeSaves"]').click()

// 3) 한 수 더(3) → 보관함에서 슬롯 불러오기 → 2로 복귀
await play()
const grew = await pieces() // 3
await openSaves()
await page.locator('.save-row button[data-act^="loadSlot:"]').first().click()
await page.waitForTimeout(80)
const loadOk = grew === 3 && (await pieces()) === 2

// 4) 공유 가져오기: 새 게임(0) → 코드 붙여넣기(다이얼로그) → 분석(복기)으로 진입 → 마지막 수=2로 복원
// ('새 게임'은 이제 마법사를 연다 → 사람과 · 한 기기 선택으로 새 판)
await openWizard(page)
await wizardPick(page, ['ngOpp:human', 'ngWhere:local'])
await page.waitForTimeout(60)
const fresh = await pieces() // 0
page.once('dialog', (d) => d.accept(code))
await openSaves()
await page.locator('button[data-act="importGame"]').click()
await page.waitForTimeout(120)
// 가져오면 분석(복기) 모드로 진입한다 → 마지막 수로 이동해 복원 확인
await page.locator('button[data-act="replayLast"]').click()
await page.waitForTimeout(80)
const importOk = fresh === 0 && (await pieces()) === 2

await browser.close()
console.log({ resumeOk, slotCount, codeOk, loadOk, importOk, errors: errors.length })
const ok = resumeOk && slotCount === 1 && codeOk && loadOk && importOk && errors.length === 0
console.log(ok ? 'PASS: 이어하기 + 보관함 슬롯 + 공유 코드 내보내기/가져오기' : 'FAIL')
process.exit(ok ? 0 : 1)
