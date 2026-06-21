// 설정(모드·난이도·볼륨)이 새로고침 후에도 유지되는지 점검. dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('button[data-act="menuMode"]')

// vs AI + 난이도 어려움
await page.locator('button[data-act="menuMode"]').click()
await page.locator('button[data-act="setMode:vsAi"]').click()
await page.locator('button[data-act="menuDifficulty"]').click()
await page.locator('button[data-act="setDiff:hard"]').click()
// BGM 볼륨 10%로
await page.locator('input[data-ctl="bgmVol"]').fill('10')
await page.locator('input[data-ctl="bgmVol"]').dispatchEvent('change')

// 새로고침
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.settings-summary')

const summary = ((await page.locator('.settings-summary').textContent()) ?? '').trim()
const bgmVal = await page.locator('input[data-ctl="bgmVol"]').inputValue()

await browser.close()
const ok = summary.includes('vs AI') && summary.includes('어려움') && bgmVal === '10' && errors.length === 0
console.log(`summary="${summary}", bgmVol=${bgmVal}, errors=${errors.length}`)
console.log(ok ? 'PASS: 설정이 새로고침 후 유지됨' : 'FAIL')
process.exit(ok ? 0 : 1)
