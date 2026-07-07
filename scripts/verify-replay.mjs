// 복기(다시보기) 기능이 실제 브라우저에서 동작하는지 점검. dev 서버 필요.
import { chromium } from 'playwright'
import { prepPage } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'networkidle' })
await prepPage(page) // 첫 접속 오버레이 스킵 + 새 게임 마법사 닫기
await page.waitForSelector('svg.board')

const pieces = () => page.locator('svg.board circle.piece').count()

async function playMove() {
  const choose = page.locator('button[data-act="tileAndPiece"]')
  if (await choose.count()) await choose.first().click()
  // 타깃/프론티어 폴리곤은 fill=none 이라 아래 타일이 클릭을 받는다(실게임과 동일) → force
  await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
  await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
}

await playMove() // 노랑
await playMove() // 갈색
const afterPlay = await pieces()

// 복기 진입 → 하단 리모컨 표시 + 시작 국면(말 0). (복기 UI 는 패널 교체 → 하단 리모컨으로 바뀜, 2026-06-30)
await page.locator('button[data-act="replayEnter"]').click()
await page.waitForSelector('.replay-remote')
const panelHasReplay = (await page.locator('.replay-remote').count()) === 1
const atStart = await pieces()

// 한 수씩 전진
await page.locator('button[data-act="replayNext"]').click()
const afterNext1 = await pieces()
await page.locator('button[data-act="replayLast"]').click()
const atEnd = await pieces()

// 종료 → 실시간 복귀
await page.locator('button[data-act="replayExit"]').click()
const afterExit = await pieces()

await browser.close()
const ok =
  afterPlay === 2 &&
  panelHasReplay &&
  atStart === 0 &&
  afterNext1 === 1 &&
  atEnd === 2 &&
  afterExit === 2 &&
  errors.length === 0
console.log(
  `play=${afterPlay}, 복기패널=${panelHasReplay}, 시작=${atStart}, 1수=${afterNext1}, 끝=${atEnd}, 종료후=${afterExit}, errors=${errors.length}`,
)
if (errors.length) console.log(errors.join('\n'))
console.log(ok ? 'PASS: 복기 정상 동작' : 'FAIL')
process.exit(ok ? 0 : 1)
