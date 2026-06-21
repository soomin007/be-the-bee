// BGM 선택/볼륨/재생 동작 점검(실제 브라우저). dev 서버 필요.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:5173/'

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('select[data-ctl="bgmTrack"]')

const options = await page.locator('select[data-ctl="bgmTrack"] option').count()
const sliders = await page.locator('.sound-ctl input[type="range"]').count()
const bgmHttp = await page.evaluate(async () => {
  const r = await fetch('/bgm/board-game-lounge.mp3', { method: 'HEAD' })
  return r.status
})

await page.locator('button[data-act="toggleMusic"]').click()
await page.waitForTimeout(500)
const playLabel = ((await page.locator('button[data-act="toggleMusic"]').textContent()) ?? '').trim()

await browser.close()
const ok = options === 8 && sliders === 2 && bgmHttp === 200 && playLabel.includes('정지') && errors.length === 0
console.log(`options=${options}, sliders=${sliders}, bgmHttp=${bgmHttp}, playLabel="${playLabel}", errors=${errors.length}`)
if (errors.length) console.log('ERRORS:', errors.join(' | '))
console.log(ok ? 'PASS: BGM 선택·볼륨·재생 동작' : 'FAIL')
process.exit(ok ? 0 : 1)
