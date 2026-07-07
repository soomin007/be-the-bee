// 첫 접속 흐름 + 튜토리얼 점검(2026-06-30 개편 반영):
//  첫 접속 = 앱 사용법 온보딩(스포트라이트) 자동 표시 → 건너뛰면 새 게임 마법사.
//  게임 규칙 튜토리얼은 자동으로 안 뜨고, 온보딩 마지막 '규칙 보기' 또는 설정의
//  '게임 규칙 다시 보기'(data-act="tutorial")로 연다. + 페이지 스크린샷 저장.
import { chromium } from 'playwright'
import { clickXY, dismissWizard } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })

// 1) 첫 접속: 앱 사용법 온보딩 자동 표시
await page.waitForSelector('.coach-layer', { timeout: 5000 })
const onboardShown = (await page.locator('.coach-layer').count()) === 1

// 2) 온보딩 건너뛰기 → 새 게임 마법사가 뜬다(첫 게임 설정) → 취소로 닫기
await clickXY(page, page.locator('.coach-skip'))
const wizardShown = await dismissWizard(page, 5000)

// 3) 설정 '게임 규칙 다시 보기'로 튜토리얼 열기 → 넘김 → 끝까지 → 닫힘
await page.locator('button[data-act="tutorial"]').click()
await page.waitForSelector('.tut-card')
const opened = (await page.locator('.tut-card').count()) === 1
const totalDots = await page.locator('.tut-dot').count()
await page.locator('.tut-card').screenshot({ path: 'docs/design/shots/tutorial-1.png' })

await page.locator('button[data-tut="next"]').click()
await page.locator('button[data-tut="next"]').click()
await page.waitForTimeout(150)
const stepText = (await page.locator('.tut-step').textContent())?.trim()
await page.locator('.tut-card').screenshot({ path: 'docs/design/shots/tutorial-3.png' })

for (let i = 0; i < totalDots; i++) {
  const btn = page.locator('button[data-tut="next"]')
  if (await btn.count()) await btn.click()
  await page.waitForTimeout(60)
}
const closedAfterFinish = (await page.locator('.tut-card').count()) === 0

// 4) 새로고침 → 온보딩·튜토리얼 재표시 안 됨(seen 플래그). 마법사만 뜰 수 있으니 닫는다.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
const notShownAgain =
  (await page.locator('.coach-layer').count()) === 0 && (await page.locator('.tut-card').count()) === 0
await dismissWizard(page)

// 5) 설정 버튼으로 재열기
await page.locator('button[data-act="tutorial"]').click()
await page.waitForSelector('.tut-card')
const reopened = (await page.locator('.tut-card').count()) === 1

await browser.close()
console.log({ onboardShown, wizardShown, opened, totalDots, stepText, closedAfterFinish, notShownAgain, reopened, errors: errors.length })
const ok =
  onboardShown && wizardShown && opened && totalDots >= 5 && stepText === `3 / ${totalDots}` && closedAfterFinish &&
  notShownAgain && reopened && errors.length === 0
console.log(ok ? 'PASS: 온보딩 자동표시 + 마법사 + 튜토리얼 넘김·완료기억·재열기' : 'FAIL')
process.exit(ok ? 0 : 1)
