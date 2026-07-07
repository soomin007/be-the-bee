// 설정(모드·난이도·볼륨)이 새로고침 후에도 유지되는지 점검. dev 서버 필요.
// 모드·난이도 변경은 설정 메뉴가 아니라 "새 게임 마법사"에서 한다(2026-06-30 UI 개편).
import { chromium } from 'playwright'
import { prepPage, openWizard, wizardPick } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await prepPage(page) // 첫 접속 오버레이 스킵 + 새 게임 마법사 닫기
await page.waitForSelector('svg.board')

// vs AI + 난이도 어려움 (새 게임 마법사 경유)
await openWizard(page)
await wizardPick(page, ['ngOpp:ai', 'ngDiff:hard', 'ngStartAi'])
// BGM 볼륨 10%로
await page.locator('input[data-ctl="bgmVol"]').fill('10')
await page.locator('input[data-ctl="bgmVol"]').dispatchEvent('change')

// 새로고침 (vsAi 새 판이 자동저장돼 마법사는 다시 안 뜬다)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.settings-summary')

const summary = ((await page.locator('.settings-summary').textContent()) ?? '').trim()
const bgmVal = await page.locator('input[data-ctl="bgmVol"]').inputValue()

await browser.close()
const ok = summary.includes('vs AI') && summary.includes('어려움') && bgmVal === '10' && errors.length === 0
console.log(`summary="${summary}", bgmVol=${bgmVal}, errors=${errors.length}`)
console.log(ok ? 'PASS: 설정이 새로고침 후 유지됨' : 'FAIL')
process.exit(ok ? 0 : 1)
