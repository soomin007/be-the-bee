// 온라인 대전 백엔드 점검: 두 클라이언트(A=방장, B=상대) 사이에 방 생성 + 실시간 동기화가
// 되는지 확인한다. .env.local 의 Supabase 키가 필요(없으면 스킵). dev 서버 불필요.
//   node scripts/verify-mp.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

function loadEnv() {
  try {
    const txt = readFileSync('.env.local', 'utf8')
    const out = {}
    for (const line of txt.split('\n')) {
      if (!line.includes('=') || line.trim().startsWith('#')) continue
      const i = line.indexOf('=')
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
    return out
  } catch {
    return {}
  }
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.log('SKIP: .env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 없음')
  process.exit(0)
}

const A = createClient(url, key) // 방장
const B = createClient(url, key) // 상대
// 실제 방 코드 형식(영문 대문자+숫자, roomCode() 와 동일)으로. 언더스코어가 든 id 는 Supabase
// 실시간 필터(id=eq.…)와 안 맞아 이벤트가 안 온다(진단으로 확인). 고정값이라 재실행 시 upsert 로 덮어씀.
const ID = 'MPTEST'

// 1) 방장: 방 생성(upsert)
const init = { id: ID, snapshot: 'BTB1:init', status: 'waiting', host_id: 'A', guest_id: null, host_side: 'yellow' }
{
  const { error } = await A.from('rooms').upsert(init).select().single()
  if (error) {
    console.log('FAIL 방 생성/RLS:', error.message)
    process.exit(1)
  }
}
console.log('1) 방 생성 OK')

// 2) 상대: 실시간 구독
let received = null
const ch = B.channel('mptest:' + ID).on(
  'postgres_changes',
  { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${ID}` },
  (p) => {
    received = p.new
  },
)
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('구독 타임아웃')), 8000)
  ch.subscribe((st) => {
    if (st === 'SUBSCRIBED') {
      clearTimeout(t)
      res()
    }
  })
})
console.log('2) 실시간 구독 OK')

// 3) 방장: 상대가 수를 둔 것처럼 스냅샷 갱신
await new Promise((r) => setTimeout(r, 400))
{
  const { error } = await A.from('rooms')
    .update({ snapshot: 'BTB1:move1', status: 'playing', updated_at: new Date().toISOString() })
    .eq('id', ID)
  if (error) {
    console.log('FAIL 갱신:', error.message)
    process.exit(1)
  }
}
console.log('3) 스냅샷 push OK')

// 4) 상대가 실시간으로 받았는지
await new Promise((r) => setTimeout(r, 2000))
await B.removeChannel(ch)
const ok = received && received.snapshot === 'BTB1:move1' && received.status === 'playing'
console.log('4) 상대 수신:', received ? `${received.snapshot} / ${received.status}` : '(없음)')
console.log(ok ? 'PASS ✅ 온라인 백엔드(방 + 실시간 동기화) 동작' : 'FAIL ❌ 실시간 수신 안 됨')
process.exit(ok ? 0 : 1)
