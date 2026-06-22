// 여왕벌 모드 설명 팝업: 토글 클릭 → 모달 표시 → 취소(안 켜짐)/확인(켜짐) 동작 점검 + 스크린샷.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('button[data-act="toggleQueen"]')

const queenActive = async () =>
  (await page.locator('button[data-act="toggleQueen"]').getAttribute('class'))?.includes('active') ?? false

// 1) 토글 클릭 → 설명 모달이 뜨고, 아직 켜지지 않았다
await page.locator('button[data-act="toggleQueen"]').click()
await page.waitForSelector('.modal-card.queen-info')
const shownNotYetOn = (await page.locator('.modal-card.queen-info').count()) === 1 && !(await queenActive())
await page.screenshot({ path: 'docs/design/shots/queen-popup.png' })

// 2) 취소 → 모달 닫히고 여전히 꺼짐
await page.locator('button[data-act="queenCancel"]').click()
await page.waitForTimeout(60)
const cancelKeepsOff = (await page.locator('.modal-card.queen-info').count()) === 0 && !(await queenActive())

// 3) 다시 토글 → 확인 → 모달 닫히고 켜짐
await page.locator('button[data-act="toggleQueen"]').click()
await page.waitForSelector('.modal-card.queen-info')
await page.locator('button[data-act="queenConfirm"]').click()
await page.waitForTimeout(60)
const confirmTurnsOn = (await page.locator('.modal-card.queen-info').count()) === 0 && (await queenActive())

// 4) 켜진 상태에서 토글 → 즉시 꺼짐(모달 없음)
await page.locator('button[data-act="toggleQueen"]').click()
await page.waitForTimeout(60)
const offIsImmediate = (await page.locator('.modal-card.queen-info').count()) === 0 && !(await queenActive())

await browser.close()
console.log({ shownNotYetOn, cancelKeepsOff, confirmTurnsOn, offIsImmediate, errors: errors.length })
const ok = shownNotYetOn && cancelKeepsOff && confirmTurnsOn && offIsImmediate && errors.length === 0
console.log(ok ? 'PASS: 여왕벌 설명 팝업 확인/취소 동작' : 'FAIL')
process.exit(ok ? 0 : 1)
