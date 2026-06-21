// 설정 패널(모드 메뉴 펼친 상태) 스크린샷 + 메뉴 동작 점검. dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const out = process.argv[3] ?? 'panel.png'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('button[data-act="menuMode"]')

// 모드 메뉴 열기
await page.locator('button[data-act="menuMode"]').click()
const modeOpts = await page.locator('.menu-popup button[data-act^="setMode:"]').count()
// vs AI 선택
await page.locator('button[data-act="setMode:vsAi"]').click()
const popupAfter = await page.locator('.menu-popup').count()
const diffDisabled = await page.locator('button[data-act="menuDifficulty"]').isDisabled()
// 다시 모드 메뉴 열어 스크린샷
await page.locator('button[data-act="menuMode"]').click()
// 볼륨 스텝 확인
const step = await page.locator('input[data-ctl="bgmVol"]').getAttribute('step')

await page.locator('.panel').screenshot({ path: out })
await browser.close()

console.log(`modeOptions=${modeOpts}, popupAfterSelect=${popupAfter}, diffDisabledInVsAi=${diffDisabled}, bgmStep=${step}, errors=${errors.length}`)
const ok = modeOpts === 3 && popupAfter === 0 && diffDisabled === false && step === '10' && errors.length === 0
console.log(ok ? 'PASS: 모드 메뉴/난이도/볼륨스텝 동작' : 'FAIL')
console.log('saved', out)
process.exit(ok ? 0 : 1)
