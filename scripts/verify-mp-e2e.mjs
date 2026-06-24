// 온라인 대전 E2E: 방 만들기→입장→매칭→선공/후공 협상(제안→예)→양방향 수→모드 알림→나가기.
// 전제: .env.local 키 → `npm run build` → `npm run preview`(4173) 띄운 뒤 실행.
//   node scripts/verify-mp-e2e.mjs [url]
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:4173/'
const browser = await chromium.launch()

async function newPlayer() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } })
  const page = await ctx.newPage()
  await page.addInitScript(() => localStorage.setItem('be-the-bee/tutorial-seen', '1'))
  return page
}
const pieces = (page) => page.locator('svg.board circle.piece').count()
const statusText = (page) => page.locator('.online-status').textContent()
// onlineMsg 알림 팝업(확인 버튼)이 뜨면 텍스트 읽고 닫는다. 협상 모달은 확인 버튼이 없어 안 건드림.
async function grabPopup(page, timeout = 8000) {
  try {
    await page.locator('button[data-act="onlineMsgOk"]').waitFor({ timeout })
    const txt = (await page.locator('.modal-card .modal-sub').textContent())?.trim()
    await page.locator('button[data-act="onlineMsgOk"]').click()
    await page.waitForTimeout(150)
    return txt
  } catch {
    return null
  }
}
async function clickModal(page, act, timeout = 8000) {
  const btn = page.locator(`button[data-act="${act}"]`)
  await btn.waitFor({ timeout })
  await btn.click()
  await page.waitForTimeout(200)
}
async function playMove(page) {
  const choose = page.locator('button[data-act="tileAndPiece"]')
  if (await choose.count()) await choose.first().click()
  await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
  await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
}

const r = {}

// A: 방 만들기(진영 선택 없음)
const A = await newPlayer()
await A.goto(URL, { waitUntil: 'networkidle' })
await A.waitForSelector('.panel')
await A.locator('button[data-act="onlineHost"]').click()
await grabPopup(A) // "방을 만들었어요..."
const code = await A.evaluate(() => location.hash.replace(/.*room=/, ''))
console.log('방 코드:', code)

// B: 입장 → 양쪽 매칭 팝업
const B = await newPlayer()
await B.goto(URL + '#room=' + code, { waitUntil: 'networkidle' })
r.joinPopup = await grabPopup(B)
r.matchPopupA = await grabPopup(A)
console.log('B 입장:', r.joinPopup?.slice(0, 30), '| A 매칭:', r.matchPopupA?.slice(0, 30))

// 협상: A 가 "내가 선공" 제안 → B 에 예/아니오 → B 가 예
await clickModal(A, 'proposeFirst')
await clickModal(B, 'acceptSide') // B 의 협상 모달에 제안이 도착해 acceptSide 버튼이 떠야 함
r.agreeA = await grabPopup(A) // "선공·후공이 정해졌어요. 당신은 노랑(선공)..."
r.agreeB = await grabPopup(B) // "...당신은 갈색(후공)..."
console.log('합의 A:', r.agreeA?.slice(0, 34))
console.log('합의 B:', r.agreeB?.slice(0, 34))

// 대국: A(노랑) 선공 → B 반영
await A.waitForTimeout(400)
r.aTurnStart = (await statusText(A))?.trim()
await playMove(A)
await A.waitForTimeout(2200)
r.bPieces = await pieces(B)
console.log('A 선공 후 — A:', r.aTurnStart, '| B 말 수:', r.bPieces, '|', (await statusText(B))?.trim())

// B 응수 → A 반영
await playMove(B)
await B.waitForTimeout(2200)
r.aPieces = await pieces(A)
console.log('B 응수 후 A 말 수:', r.aPieces)

// 모드 변경 알림: A 무한 모드 → B 팝업
await A.locator('button[data-act="toggleInfinite"]').click()
r.modePopupB = await grabPopup(B)
console.log('A 무한모드 → B:', r.modePopupB?.slice(0, 24))

// 나가기: B → 확인창 → 나가기 → A 알림
await B.locator('button[data-act="onlineLeave"]').click()
await clickModal(B, 'leaveYes')
r.leftPopupA = await grabPopup(A)
console.log('B 나감 → A:', r.leftPopupA?.slice(0, 24))

await browser.close()
const ok =
  r.matchPopupA?.includes('선공') &&
  r.agreeA?.includes('노랑(선공)') &&
  r.agreeB?.includes('갈색(후공)') &&
  r.aTurnStart?.includes('내 차례') &&
  r.bPieces === 1 &&
  r.aPieces === 2 &&
  r.modePopupB?.includes('무한 모드') &&
  r.leftPopupA?.includes('나갔어요')
console.log(ok ? 'PASS ✅ 온라인 협상 흐름(매칭→합의→대국→모드알림→나가기) 동작' : 'FAIL ❌ 위 결과 확인')
process.exit(ok ? 0 : 1)
