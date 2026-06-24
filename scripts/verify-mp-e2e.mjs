// 온라인 대전 E2E: 두 브라우저(A=방장/노랑, B=상대/갈색)로 방 생성→입장→양방향 수 동기화 확인.
// 전제: .env.local 에 Supabase 키 → `npm run build` → `npm run preview`(4173) 띄운 뒤 실행.
//   node scripts/verify-mp-e2e.mjs
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:4173/'
const browser = await chromium.launch()

async function newPlayer() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } })
  const page = await ctx.newPage()
  await page.addInitScript(() => localStorage.setItem('be-the-bee/tutorial-seen', '1'))
  return page
}
const pieces = (page) => page.locator('svg.board circle.piece').count()
async function playMove(page) {
  const choose = page.locator('button[data-act="tileAndPiece"]')
  if (await choose.count()) await choose.first().click()
  await page.locator('svg.board polygon[opacity="0.22"]').first().click({ force: true })
  await page.locator('svg.board polygon[stroke="#16a34a"]').first().click({ force: true })
}

// A: 방 만들기
const A = await newPlayer()
await A.goto(URL, { waitUntil: 'networkidle' })
await A.waitForSelector('.panel')
await A.locator('button[data-act="onlineHost"]').click()
await A.waitForFunction(() => location.hash.includes('room='), { timeout: 12000 })
const code = await A.evaluate(() => location.hash.replace(/.*room=/, ''))
console.log('방 코드:', code)

// B: 초대 링크로 입장
const B = await newPlayer()
await B.goto(URL + '#room=' + code, { waitUntil: 'networkidle' })
await B.waitForSelector('.online-status', { timeout: 12000 })
await B.waitForTimeout(1500)
console.log('B 상태:', (await B.locator('.online-status').textContent())?.trim())
console.log('A 상태:', (await A.locator('.online-status').textContent())?.trim())

// A(노랑) 첫 수 → B 화면에 반영되나
await A.waitForTimeout(400)
await playMove(A)
await A.waitForTimeout(2200)
const bP1 = await pieces(B)
console.log('A 가 둔 뒤 → B 화면 말 수:', bP1, '| B 상태:', (await B.locator('.online-status').textContent())?.trim())

// B(갈색) 응수 → A 화면에 반영되나
await playMove(B)
await B.waitForTimeout(2200)
const aP2 = await pieces(A)
console.log('B 가 둔 뒤 → A 화면 말 수:', aP2, '| A 상태:', (await A.locator('.online-status').textContent())?.trim())

await browser.close()
const ok = bP1 === 1 && aP2 === 2
console.log(ok ? 'PASS ✅ 양방향 온라인 동기화 동작' : 'FAIL ❌ 동기화 안 됨')
process.exit(ok ? 0 : 1)
