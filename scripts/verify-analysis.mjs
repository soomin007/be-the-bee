// 기보 분석(복기 해설) + 공유 버튼 점검. 실제 공유 코드(vsAi 35수, 노랑 승)를 가져와
// 분석 모드로 진입하는지, 결정적 장면에 해설(✓/✗)이 뜨는지, 패널 공유 버튼이 동작하는지 본다.
import { chromium } from 'playwright'
import { prepPage } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:5173/'

// 사용자가 보낸 실제 기보(34수 missBlock → 35수 win).
const CODE =
  'BTB1:eyJ2IjoxLCJtdiI6InQgLTEgMCAwIDA7dCAxIC0xIC0xIDA7dCAtMSAxIDEgLTE7dCAxIDEgLTEgMTt0IC0yIDIgMSAwOzIgMSAtMiAxIDI7dCAxIC0zIDEgLTM7dCAtMSAyIC0xIDI7dCAtMSAzIC0xIDM7dCAtMSAtMSAtMSAtMTt0IC0xIC0yIC0xIC0yO3QgMCAyIDAgMjt0IDEgMyAtMiAyO3QgMiAwIDEgMTt0IDAgMyAyIDA7dCAzIDAgMyAwOzIgLTIgMyAtMyAzO3QgLTIgMSAtMiAxO3QgMCAxIDAgMTt0IDAgLTEgMCAtMTt0IC0zIDIgLTMgMjt0IDIgLTEgMSAyO3QgMiAtMyAyIC0zO3QgMiAyIDIgMjt0IDMgMiAzIDI7dCAyIDEgMiAxO3QgNCAtMSA0IC0xOzIgMiAtMiAtMiAtMTt0IDAgLTMgMCAtMzt0IC0xIC0zIC0xIC0zOzIgMyAtMyA0IC0zO3QgMSAtNCAxIC00O3QgNCAtMiAzIC0zO3QgLTIgMCAtMiAwO3QgNCAwIDQgLTMiLCJpbmYiOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODIxODc0MTk1NDV9'

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
await prepPage(page, {
  extra: () => localStorage.setItem('be-the-bee/settings', JSON.stringify({ coachLevel: 'strong' })), // 승리 힌트(리치) 켜기
})
await page.waitForSelector('svg.board')

// 1) 공유 코드 가져오기 → 분석(복기) 모드 진입
page.once('dialog', (d) => d.accept(CODE))
await page.locator('button[data-act="openSaves"]').click()
await page.waitForSelector('.saves-card')
await page.locator('button[data-act="importGame"]').click()
await page.waitForSelector('.replay-remote', { timeout: 4000 }) // 복기 UI = 하단 리모컨(2026-06-30)
const enteredReplay = (await page.locator('.replay-remote').count()) > 0

// 2) 마지막 수(35수) → win 해설(✓, good). 복기 해설은 보드 옆 board-notes 에 떠야 한다.
await page.locator('button[data-act="replayLast"]').click()
await page.waitForTimeout(80)
const winText = (await page.locator('.board-notes .coach-comment.good').first().textContent()) ?? ''
const winOk = winText.includes('승리') // "5목을 완성해 승리했어요."

// 3) "이 판 분석" 펼치기 → 워커 분석이 계산돼 분석 카드가 채워진다.
//    (예전 "34수 missBlock" 단언은 canBlockThreats 가드(2026-06-28)로 오진이 고쳐져 더는 안 뜬다.)
await page.locator('button[data-act="replayToggleAnalysis"]').click()
await page
  .waitForFunction(
    () => {
      const el = document.querySelector('.replay-analysis')
      return el !== null && !(el.textContent ?? '').includes('계산') && (el.textContent ?? '').length > 20
    },
    { timeout: 20000 },
  )
  .catch(() => {})
const analysisText = (await page.locator('.replay-analysis').textContent().catch(() => '')) ?? ''
const blunderOk = analysisText.includes('분석') && !analysisText.includes('계산하고 있어요')

// 4) 복기 종료 → 패널 "공유하기" 버튼이 BTB1 코드를 클립보드에 복사
await page.locator('button[data-act="replayExit"]').click()
await page.waitForTimeout(80)
const shareBtn = page.locator('.panel button[data-act="shareGame"]')
const shareBtnOk = (await shareBtn.count()) > 0
await shareBtn.first().click()
await page.waitForTimeout(120)
const copied = await page.evaluate(() => navigator.clipboard.readText())
const shareCopyOk = typeof copied === 'string' && copied.startsWith('BTB1:')

// 5) 한 수 무르기 → 노랑 차례·승리 자리(4,-3) 남음 → 인게임 메시지(board-notes)에 승리 힌트 표시.
//    가져온 기보는 사람끼리(hotseat) 분석이라 무르기에 상대 동의 모달이 뜬다 → 동의.
await page.locator('.panel button[data-act="undo"]').click()
await page.waitForTimeout(120)
const grant = page.locator('button[data-act="undoGrant"]')
if (await grant.count()) await grant.click()
await page.waitForTimeout(150)
const reachText = (await page.locator('.board-notes .reach').first().textContent().catch(() => '')) ?? ''
const reachInGameOk = reachText.includes('5목') // "✨ 여기 두면 5목 완성, 승리!"

// 6) 행동 버튼 위/아래 토글: 토글하면 행동 바가 보드 기준 반대편으로 이동한다.
//    (인게임 팁(board-notes)은 현 디자인에서 항상 하단 고정이라 더는 같은 쪽 단언을 하지 않는다.)
const sideOf = () =>
  page.evaluate(() => {
    const mid = (s) => {
      const e = document.querySelector(s)
      if (!e) return null
      const b = e.getBoundingClientRect()
      return (b.top + b.bottom) / 2
    }
    const sv = mid('svg.board')
    const ab = mid('.action-bar')
    if (sv == null || ab == null) return null
    return { abAbove: ab < sv } // svg 기준 위/아래
  })
const s1 = await sideOf()
// 화면·설정 섹션은 기본으로 펼쳐져 있으므로 바로 행동 버튼 위치 토글.
// 코칭(강하게) 레이어가 위를 덮어 액셔너빌리티 검사가 거부할 수 있어 force(known_issues 2026-06-27).
await page.locator('button[data-act="toggleActionPos"]').click({ force: true })
await page.waitForTimeout(150)
const s2 = await sideOf()
const sameSideOk = !!s1 && !!s2 && s1.abAbove !== s2.abAbove // 토글 = 반대편 이동

await browser.close()
console.log({ enteredReplay, winOk, blunderOk, shareBtnOk, shareCopyOk, reachInGameOk, sameSideOk, errors: errors.length })
const ok =
  enteredReplay && winOk && blunderOk && shareBtnOk && shareCopyOk && reachInGameOk && sameSideOk && errors.length === 0
console.log(ok ? 'PASS: 분석 해설 + 이 판 분석 카드 + 공유 버튼 + 승리 힌트 + 행동 바 위치 토글' : 'FAIL')
process.exit(ok ? 0 : 1)
