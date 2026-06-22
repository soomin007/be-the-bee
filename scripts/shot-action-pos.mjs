// 인게임 행동 바 위치(상단/하단) 전환 + 패널 도움말 박스 시각 확인. dev 서버 필요.
// 첫 수를 둬 갈색 chooseAction(①② 버튼) 상태를 만든 뒤 두 위치를 각각 스크린샷.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1180, height: 860 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board polygon')

// 첫 수: 타일 놓을 자리(프론티어, opacity 0.22) → 말 놓을 칸(초록 테두리).
// fill=none 링은 force 클릭(아래 타일이 핸들러 보유, known_issues 참고).
await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })

// 갈색 차례 chooseAction → 행동 바에 ①② 버튼이 뜬다.
await page.waitForSelector('.action-bar button[data-act="twoTiles"]')

const posOf = async () => {
  // action-bar 의 화면상 y 중심과 board(svg) 중심을 비교해 위/아래 판정.
  const bar = await page.locator('.action-bar').boundingBox()
  const board = await page.locator('svg.board').boundingBox()
  return bar.y + bar.height / 2 < board.y + board.height / 2 ? 'top' : 'bottom'
}

// 1) 기본(상단)
const posTop = await posOf()
await page.screenshot({ path: 'docs/design/shots/action-top.png' })

// 2) 토글 → 하단
await page.locator('button[data-act="toggleActionPos"]').click()
await page.waitForTimeout(80)
const posBottom = await posOf()
await page.screenshot({ path: 'docs/design/shots/action-bottom.png' })

// 도움말 박스 존재 확인
const helpRows = await page.locator('.help .hint').count()

await browser.close()
console.log(`defaultPos=${posTop}, afterToggle=${posBottom}, helpHints=${helpRows}, errors=${errors.length}`)
const ok = posTop === 'top' && posBottom === 'bottom' && helpRows === 2 && errors.length === 0
console.log(ok ? 'PASS: 행동 바 위치 전환 + 도움말 박스' : 'FAIL')
process.exit(ok ? 0 : 1)
