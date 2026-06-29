// AI 로딩 대기 화면 + Web Worker 검증. vsAi 에서 AI 를 선공(노랑)으로 두면 로드 직후 AI 가
// 생각을 시작한다(사람 클릭 불필요). 확인:
//  ① 전용 Web Worker 가 생성된다(AI 계산이 메인 스레드 밖),
//  ② 로딩 오버레이(.ai-thinking-layer.show)가 뜨고 팁 텍스트가 보인다,
//  ③ 오버레이가 떠 있는 동안 메인 스레드가 안 멈춘다(page.evaluate 즉답),
//  ④ AI 가 응수(말 1개+)하고 오버레이가 사라진다, 에러 0.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5174/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 860 } })
const errors = []
const workers = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('worker', (w) => workers.push(w.url().split('/').pop()))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('be-the-bee/tutorial-seen', '1')
  // AI 가 노랑(선공) → 로드 직후 첫 수를 계산. 사람 클릭으로 수를 만들 필요가 없다.
  localStorage.setItem('be-the-bee/settings', JSON.stringify({ mode: 'vsAi', aiDifficulty: 'expert', aiSide: 'yellow' }))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('svg.board')

let overlaySeen = false
let tipText = ''
let maxLatency = 0
let firstPiece = false
for (let i = 0; i < 80; i++) {
  if (await page.locator('.ai-thinking-layer.show').count()) {
    overlaySeen = true
    if (!tipText) tipText = (await page.locator('.ai-thinking-tip').textContent()) ?? ''
    const t0 = Date.now()
    await page.evaluate(() => 1 + 1) // 메인스레드가 막혀 있으면 오래 걸린다
    maxLatency = Math.max(maxLatency, Date.now() - t0)
  }
  if ((await page.locator('svg.board circle.piece').count()) > 0) {
    firstPiece = true
    break
  }
  await page.waitForTimeout(80)
}
await page.waitForTimeout(400)
const overlayHidden = (await page.locator('.ai-thinking-layer.show').count()) === 0

await browser.close()
const out = {
  workerCreated: workers.some((w) => /ai-worker/.test(w)),
  overlaySeen,
  tip: tipText.slice(0, 22),
  maxLatencyMs: maxLatency,
  aiMoved: firstPiece,
  overlayHidden,
  errors: errors.length,
}
console.log(out)
const ok =
  out.workerCreated && overlaySeen && tipText.length > 0 && maxLatency < 400 && firstPiece && overlayHidden && errors.length === 0
console.log(ok ? 'PASS: Web Worker + 로딩 오버레이 + 팁 + 무프리즈 + 응수' : 'FAIL')
process.exit(ok ? 0 : 1)
