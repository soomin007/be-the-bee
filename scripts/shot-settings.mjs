// 설정 패널 다듬기 확인: 모드/난이도 버튼 현재값 표시 + 도움말 박스 + 줄바꿈. dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 860 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.panel')

// 기본(hotseat) 패널
await page.locator('.panel').screenshot({ path: 'docs/design/shots/panel-hotseat.png' })

// vs AI + 난이도 어려움 선택 후 버튼 라벨 확인
await page.locator('button[data-act="menuMode"]').click()
await page.locator('button[data-act="setMode:vsAi"]').click()
await page.locator('button[data-act="menuDifficulty"]').click()
await page.locator('button[data-act="setDiff:hard"]').click()
const modeBtn = (await page.locator('button[data-act="menuMode"]').textContent())?.trim()
const diffBtn = (await page.locator('button[data-act="menuDifficulty"]').textContent())?.trim()
await page.locator('.panel').screenshot({ path: 'docs/design/shots/panel-vsai.png' })

await browser.close()
console.log({ modeBtn, diffBtn })
console.log('saved docs/design/shots/panel-hotseat.png, panel-vsai.png')
