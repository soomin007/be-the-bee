// 벌 마스코트 단독 미리보기(앱 무관 — 인라인 CSS). dev 서버 불필요.
import { chromium } from 'playwright'
const BEE = `<svg class="modal-bee" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs><clipPath id="bb"><ellipse cx="50" cy="62" rx="30" ry="26"/></clipPath></defs>
  <path d="M44 36 Q39 20 32 15" stroke="#5a3a14" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M56 36 Q61 20 68 15" stroke="#5a3a14" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="14" r="3.2" fill="#5a3a14"/><circle cx="68" cy="14" r="3.2" fill="#5a3a14"/>
  <ellipse class="wing" cx="28" cy="44" rx="19" ry="13" fill="#fff" opacity="0.85" stroke="#d9c89a" stroke-width="1.5"/>
  <ellipse class="wing" cx="72" cy="44" rx="19" ry="13" fill="#fff" opacity="0.85" stroke="#d9c89a" stroke-width="1.5"/>
  <ellipse cx="50" cy="62" rx="30" ry="26" fill="#f4c430" stroke="#5a3a14" stroke-width="2.6"/>
  <g clip-path="url(#bb)"><rect x="18" y="64" width="64" height="8" fill="#3a2600"/><rect x="18" y="78" width="64" height="8" fill="#3a2600"/></g>
  <circle cx="42" cy="55" r="3.4" fill="#3a2600"/><circle cx="58" cy="55" r="3.4" fill="#3a2600"/>
  <path d="M43 62 Q50 68 57 62" stroke="#3a2600" stroke-width="2.2" fill="none" stroke-linecap="round"/>
</svg>`
const html = `<!doctype html><html><head><style>
  body{margin:0;display:grid;place-items:center;height:100vh;background:rgba(0,0,0,0.45);font-family:system-ui}
  .modal-card{background:#fffdf7;border:2px solid #eab308;border-radius:16px;padding:1.6rem 2rem;text-align:center;box-shadow:0 12px 44px rgba(0,0,0,.3)}
  .modal-bee{width:76px;height:76px;margin:0 auto .4rem}
  .modal-title{font-size:1.6rem;font-weight:800;margin-bottom:.4rem}
  .modal-sub{color:#555;margin-bottom:1.2rem}
  .modal-actions button{margin:0 .25rem;padding:.5rem .9rem;border:1px solid #c9b88f;border-radius:8px;background:#fff}
</style></head><body>
  <div class="modal-card">${BEE}
    <div class="modal-title">🏆 노랑 승리!</div>
    <div class="modal-sub">같은 색 말 5개를 일렬로 연결했습니다.</div>
    <div class="modal-actions"><button>다시 하기</button><button>복기 보기</button><button>닫기</button></div>
  </div></body></html>`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 520, height: 420 } })
await page.setContent(html)
await page.screenshot({ path: 'docs/design/shots/theme-modal.png' })
await browser.close()
console.log('saved docs/design/shots/theme-modal.png')
