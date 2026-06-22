// 공유 코드(BTB1:...) 디코딩·분석 도구. scripts/code.txt 에 코드를 넣고 `node scripts/decode-game.mjs`.
// 신버전(compact: 수 목록만)과 구버전(전체 스냅샷) 둘 다 읽는다.
//   - compact: 수 목록을 사람이 읽게 출력(결과는 앱에서 불러와 확인).
//   - 전체 스냅샷: 결과·승리 라인까지 분석.
import { readFileSync } from 'node:fs'

const raw = readFileSync('scripts/code.txt', 'utf8').trim()
const body = raw.startsWith('BTB1:') ? raw.slice(5) : raw
const obj = JSON.parse(Buffer.from(body, 'base64').toString('utf8'))

const fmtMove = (m, i) => {
  const who = i % 2 === 0 ? '노랑' : '갈색'
  if (m.type === 'twoTiles') return `${who} ①타일 (${m.first.q},${m.first.r})+(${m.second.q},${m.second.r})`
  if (m.type === 'tileAndPiece')
    return `${who} ②타일(${m.tile.q},${m.tile.r}) +말(${m.piece.at.q},${m.piece.at.r})${m.piece.kind === 'queen' ? '♛' : ''}`
  return `${who} 말(${m.piece.at.q},${m.piece.at.r})${m.piece.kind === 'queen' ? '♛' : ''}`
}

console.log(`코드 길이: ${raw.length} 자`)

if (typeof obj.mv === 'string') {
  // ── compact ──────────────────────────────────────────────
  const toks = obj.mv.length ? obj.mv.split(';') : []
  const moves = toks.map((t) => {
    const p = t.trim().split(/\s+/)
    const n = (i) => Number(p[i])
    const k = (i) => (p[i] === 'Q' ? 'queen' : 'normal')
    if (p[0] === '2') return { type: 'twoTiles', first: { q: n(1), r: n(2) }, second: { q: n(3), r: n(4) } }
    if (p[0] === 't') return { type: 'tileAndPiece', tile: { q: n(1), r: n(2) }, piece: { at: { q: n(3), r: n(4) }, kind: k(5) } }
    return { type: 'pieceOnly', piece: { at: { q: n(1), r: n(2) }, kind: k(3) } }
  })
  console.log(`형식: compact · 모드 ${obj.mode ?? '?'} · 무한 ${obj.inf === 1 ? 'O' : 'X'} · ${moves.length}수`)
  console.log('\n수 기록(결과는 앱에서 불러와 확인):')
  moves.forEach((m, i) => console.log(`${String(i + 1).padStart(2)}. ${fmtMove(m, i)}`))
} else if (obj.state) {
  // ── 전체 스냅샷(구버전) ──────────────────────────────────
  const s = obj.state
  const winner = s.result?.winner
  console.log(`형식: 전체 · 모드 ${obj.mode} · ${s.moveNumber}수 · ${s.phase} · 결과 ${JSON.stringify(s.result)}`)
  console.log(`남은 자원: ${JSON.stringify(s.supplies)}`)
  const dirs = [
    [1, 0],
    [0, 1],
    [1, -1],
  ]
  const has = (q, r) => {
    const c = s.board[`${q},${r}`]
    return !!(c && c.piece && c.piece.owner === winner)
  }
  let line = null
  for (const key of Object.keys(s.board)) {
    const c = s.board[key]
    if (!c.piece || c.piece.owner !== winner) continue
    const [q, r] = key.split(',').map(Number)
    for (const [dq, dr] of dirs) {
      if (has(q - dq, r - dr)) continue
      const cells = []
      let qq = q
      let rr = r
      while (has(qq, rr)) {
        cells.push(`${qq},${rr}`)
        qq += dq
        rr += dr
      }
      if (cells.length >= 5) {
        line = cells
        break
      }
    }
    if (line) break
  }
  console.log(`승리 라인(${winner}): ${line ? line.join(' → ') : '없음'}`)
  console.log('\n수 기록:')
  ;(obj.moveLog ?? []).forEach((m, i) => console.log(`${String(i + 1).padStart(2)}. ${fmtMove(m, i)}`))
} else {
  console.log('알 수 없는 코드 형식')
}
