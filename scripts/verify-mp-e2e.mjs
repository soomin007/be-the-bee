// 온라인 대전 E2E(Phase 2): 두 브라우저로 방 만들기(진영 선택)→입장→매칭 팝업→양방향 수→
// 모드 변경 알림→나가기(상대 알림) 까지 확인.
// 전제: .env.local 에 Supabase 키 → `npm run build` → `npm run preview`(4173) 띄운 뒤 실행.
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
// 온라인 알림 팝업이 떠 있으면 텍스트를 읽고 확인을 눌러 닫는다.
async function grabPopup(page, timeout = 7000) {
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
async function playMove(page) {
  const choose = page.locator('button[data-act="tileAndPiece"]')
  if (await choose.count()) await choose.first().click()
  await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
  await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
}

const results = {}

// A: 방 만들기 → 진영 선택(내가 선공·노랑)
const A = await newPlayer()
await A.goto(URL, { waitUntil: 'networkidle' })
await A.waitForSelector('.panel')
await A.locator('button[data-act="onlineHost"]').click()
await A.locator('button[data-act="hostYellow"]').click() // 선공 선택
results.hostPopup = await grabPopup(A) // "방을 만들었어요..."
const code = await A.evaluate(() => location.hash.replace(/.*room=/, ''))
console.log('방 코드:', code, '| 방 만들기 팝업:', results.hostPopup?.slice(0, 30))

// B: 초대 링크로 입장 → 매칭 팝업
const B = await newPlayer()
await B.goto(URL + '#room=' + code, { waitUntil: 'networkidle' })
results.joinPopup = await grabPopup(B) // "방에 입장했어요! 당신은 갈색(후공)..."
results.matchPopupA = await grabPopup(A) // A 에 "상대가 들어왔어요..."
console.log('B 입장 팝업:', results.joinPopup?.slice(0, 40))
console.log('A 매칭 팝업:', results.matchPopupA?.slice(0, 40))

// 양방향 수: A(노랑) 선공 → B 반영
await A.waitForTimeout(400)
await playMove(A)
await A.waitForTimeout(2200)
results.bPieces = await pieces(B)
results.bTurn = (await statusText(B))?.trim()
console.log('A 둔 뒤 B 말 수:', results.bPieces, '| B:', results.bTurn)

// B 응수 → A 반영
await playMove(B)
await B.waitForTimeout(2200)
results.aPieces = await pieces(A)
console.log('B 둔 뒤 A 말 수:', results.aPieces)

// 모드 변경 알림: A 가 무한 모드 ON → B 에 팝업
await A.locator('button[data-act="toggleInfinite"]').click()
results.modePopupB = await grabPopup(B)
console.log('A 무한모드 → B 팝업:', results.modePopupB?.slice(0, 30))

// 나가기: B 가 나가기 → 확인창 → 나가기 → A 에 "상대가 나갔어요" 팝업
await B.locator('button[data-act="onlineLeave"]').click()
await B.locator('button[data-act="leaveYes"]').click()
results.leftPopupA = await grabPopup(A)
console.log('B 나감 → A 팝업:', results.leftPopupA?.slice(0, 30))

await browser.close()

const ok =
  results.joinPopup?.includes('갈색(후공)') &&
  results.matchPopupA?.includes('노랑(선공)') &&
  results.bPieces === 1 &&
  results.bTurn?.includes('내 차례') &&
  results.aPieces === 2 &&
  results.modePopupB?.includes('무한 모드') &&
  results.leftPopupA?.includes('나갔어요')
console.log(ok ? 'PASS ✅ 온라인 Phase 2 (진영선택·매칭·동기화·모드알림·나가기) 동작' : 'FAIL ❌ 위 결과 확인')
process.exit(ok ? 0 : 1)
