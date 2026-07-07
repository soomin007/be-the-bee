// 온라인 대전 E2E: 방→입장→매칭→선공/후공 협상→대국→재접속(새로고침 재개)→이탈 감지.
// 전제: .env.local 키 → `npm run build` → `npm run preview`(4173) 띄운 뒤 실행.
//   node scripts/verify-mp-e2e.mjs [url]
import { chromium } from 'playwright'
import { dismissWizard } from './lib/boot.mjs'
const URL = process.argv[2] ?? 'http://localhost:4173/'
const browser = await chromium.launch()

// 첫 접속 오버레이(온보딩·튜토리얼·테마 팁) seen 플래그 — boot.mjs prepPage 와 동일 목록.
// 여기선 컨텍스트가 둘(A/B)이고 B 는 #room 해시로 진입해 reload 가 곤란하므로 addInitScript 로 심는다.
const SEEN_FLAGS = ['be-the-bee/tutorial-seen', 'be-the-bee/onboarding-seen', 'be-the-bee/theme-told']

async function newCtx() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } })
  const page = await ctx.newPage()
  await page.addInitScript((flags) => {
    for (const k of flags) localStorage.setItem(k, '1')
  }, SEEN_FLAGS)
  return { ctx, page }
}
const pieces = (page) => page.locator('svg.board circle.piece').count()
const statusText = (page) => page.locator('.online-status').textContent()
async function grabPopup(page, timeout = 9000) {
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
async function clickModal(page, act, timeout = 9000) {
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
const A = await newCtx()
const B = await newCtx()

// 방 만들기 + 입장 + 매칭. 자동저장이 없으면 로드 직후 새 게임 마법사가 떠 클릭을 가로채므로 닫는다.
await A.page.goto(URL, { waitUntil: 'networkidle' })
await A.page.waitForSelector('.panel')
await dismissWizard(A.page)
await A.page.locator('button[data-act="onlineHost"]').click()
await grabPopup(A.page)
const code = await A.page.evaluate(() => location.hash.replace(/.*room=/, ''))
console.log('방 코드:', code)
await B.page.goto(URL + '#room=' + code, { waitUntil: 'networkidle' })
await dismissWizard(B.page)
await grabPopup(B.page)
await grabPopup(A.page)

// 협상: A 선공 제안 → B 수락
await clickModal(A.page, 'proposeFirst')
await clickModal(B.page, 'acceptSide')
r.agreeA = await grabPopup(A.page)
r.agreeB = await grabPopup(B.page)
console.log('합의 A:', r.agreeA?.slice(0, 30), '| B:', r.agreeB?.slice(0, 30))

// 대국: A→B, B→A
await A.page.waitForTimeout(400)
await playMove(A.page)
await A.page.waitForTimeout(2200)
await playMove(B.page)
await B.page.waitForTimeout(2200)
r.aPieces = await pieces(A.page)
console.log('양방향 수 후 A 말 수:', r.aPieces)

// 재접속: B 새로고침 → 협상 없이 재개(같은 진영, 보드 유지)
await B.page.reload({ waitUntil: 'networkidle' })
r.reconnPopup = await grabPopup(B.page)
await B.page.waitForTimeout(1500)
r.bReconStatus = (await statusText(B.page))?.trim()
r.bReconPieces = await pieces(B.page)
r.noNegotiate = (await B.page.locator('button[data-act="proposeFirst"]').count()) === 0
console.log('재접속 B:', r.reconnPopup?.slice(0, 24), '| 상태:', r.bReconStatus, '| 말:', r.bReconPieces, '| 협상모달없음:', r.noNegotiate)

// 이탈 감지: A 탭(컨텍스트) 닫음 → B 의 HUD 가 presence 로 '상대 연결 끊김' 표시(팝업 아님)
await A.ctx.close()
let disconnSeen = false
for (let i = 0; i < 12; i++) {
  await B.page.waitForTimeout(1000)
  if (((await statusText(B.page)) ?? '').includes('연결 끊김')) {
    disconnSeen = true
    break
  }
}
r.disconnSeen = disconnSeen
console.log('A 닫음 → B HUD 끊김 표시:', disconnSeen)

await browser.close()
const ok =
  r.agreeA?.includes('노랑(선공)') &&
  r.agreeB?.includes('갈색(후공)') &&
  r.aPieces === 2 &&
  r.reconnPopup?.includes('다시 연결') &&
  r.bReconStatus?.includes('방') &&
  r.bReconPieces === 2 &&
  r.noNegotiate &&
  r.disconnSeen
console.log(ok ? 'PASS ✅ 협상·대국·재접속·이탈감지 동작' : 'FAIL ❌ 위 결과 확인')
process.exit(ok ? 0 : 1)
