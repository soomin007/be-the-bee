// value-net 학습(Stage 1). probes/_gen-training.test.ts 가 만든 (피처, 결과 z) JSONL 로 작은 MLP
// (DIM→hidden relu→1 tanh)를 순수 JS backprop(Adam)으로 학습 → src/engine/value-net-weights.ts.
// forward 는 src/engine/value-net.ts 와 동일 식(불일치 차단). 수동: node scripts/train-valuenet.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const DATA = process.env.TRAIN_DATA ?? 'probes/.out/training.jsonl'
const CORR = process.env.CORR_DATA ?? 'probes/.out/corridor.jsonl' // 회랑 데이터(있으면 오버샘플로 train 에)
const OVERSAMPLE = Number(process.env.OVERSAMPLE ?? 5) // 회랑 데이터 반복 횟수(일반에 안 묻히게)
const OUT = 'src/engine/value-net-weights.ts'
const DIM = 21
const HIDDEN = Number(process.env.HIDDEN ?? 32)
const EPOCHS = Number(process.env.EPOCHS ?? 80)
const LR = Number(process.env.LR ?? 0.005)
const BATCH = 64

let seed = 12345
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } }
const gen = readFileSync(DATA, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
let corr = []
try { corr = readFileSync(CORR, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { /* 회랑 데이터 없으면 일반만 */ }
shuffle(gen)
const split = Math.floor(gen.length * 0.9)
const test = gen.slice(split) // 일반 held-out(강도 평가). 회랑 효과는 별도 프로브로.
const train = [...gen.slice(0, split), ...Array(OVERSAMPLE).fill(0).flatMap(() => corr)]
shuffle(train)
console.log(`일반 ${gen.length} + 회랑 ${corr.length}×${OVERSAMPLE} → train ${train.length} / test(일반) ${test.length}, DIM=${DIM} HIDDEN=${HIDDEN}`)

const he = (n) => (rand() * 2 - 1) * Math.sqrt(2 / n)
const W1 = Array.from({ length: DIM * HIDDEN }, () => he(DIM))
const b1 = Array(HIDDEN).fill(0)
const W2 = Array.from({ length: HIDDEN }, () => he(HIDDEN))
let b2 = 0

const mW1 = Array(DIM * HIDDEN).fill(0), vW1 = Array(DIM * HIDDEN).fill(0)
const mb1 = Array(HIDDEN).fill(0), vb1 = Array(HIDDEN).fill(0)
const mW2 = Array(HIDDEN).fill(0), vW2 = Array(HIDDEN).fill(0)
let mb2 = 0, vb2 = 0
const B1 = 0.9, B2 = 0.999, EPS = 1e-8
let t = 0

function forward(x) {
  const z1 = new Array(HIDDEN), h = new Array(HIDDEN)
  for (let j = 0; j < HIDDEN; j++) { let s = b1[j]; for (let i = 0; i < DIM; i++) s += x[i] * W1[i * HIDDEN + j]; z1[j] = s; h[j] = s > 0 ? s : 0 }
  let z2 = b2; for (let j = 0; j < HIDDEN; j++) z2 += h[j] * W2[j]
  return { h, z1, out: Math.tanh(z2) }
}
function adam(p, g, m, v) {
  for (let k = 0; k < p.length; k++) { m[k] = B1 * m[k] + (1 - B1) * g[k]; v[k] = B2 * v[k] + (1 - B2) * g[k] * g[k]; p[k] -= LR * (m[k] / (1 - B1 ** t)) / (Math.sqrt(v[k] / (1 - B2 ** t)) + EPS) }
}
function trainStep(batch) {
  const gW1 = Array(DIM * HIDDEN).fill(0), gb1 = Array(HIDDEN).fill(0), gW2 = Array(HIDDEN).fill(0); let gb2 = 0
  for (const { f, z } of batch) {
    const { h, z1, out } = forward(f)
    const dz2 = (2 * (out - z) * (1 - out * out)) / batch.length // MSE grad × tanh'
    for (let j = 0; j < HIDDEN; j++) { gW2[j] += dz2 * h[j]; const dz1 = z1[j] > 0 ? dz2 * W2[j] : 0; gb1[j] += dz1; for (let i = 0; i < DIM; i++) gW1[i * HIDDEN + j] += dz1 * f[i] }
    gb2 += dz2
  }
  t++
  adam(W1, gW1, mW1, vW1); adam(b1, gb1, mb1, vb1); adam(W2, gW2, mW2, vW2)
  mb2 = B1 * mb2 + (1 - B1) * gb2; vb2 = B2 * vb2 + (1 - B2) * gb2 * gb2; b2 -= LR * (mb2 / (1 - B1 ** t)) / (Math.sqrt(vb2 / (1 - B2 ** t)) + EPS)
}
function evalSet(set) {
  let mse = 0, correct = 0, nz = 0
  for (const { f, z } of set) { const { out } = forward(f); mse += (out - z) ** 2; if (z !== 0) { nz++; if (Math.sign(out) === Math.sign(z)) correct++ } }
  return { mse: mse / set.length, acc: nz ? correct / nz : 0 }
}

const meanZ = train.reduce((s, r) => s + r.z, 0) / train.length
const baseMse = test.reduce((s, r) => s + (meanZ - r.z) ** 2, 0) / test.length

for (let e = 0; e < EPOCHS; e++) {
  for (let i = train.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[train[i], train[j]] = [train[j], train[i]] }
  for (let b = 0; b < train.length; b += BATCH) trainStep(train.slice(b, b + BATCH))
  if (e % 10 === 0 || e === EPOCHS - 1) { const te = evalSet(test); console.log(`epoch ${e}: test mse ${te.mse.toFixed(4)} 부호정확도 ${te.acc.toFixed(3)}`) }
}
const fin = evalSet(test)
console.log(`\n[Gate 1] baseline(meanZ) test mse ${baseMse.toFixed(4)} | learned test mse ${fin.mse.toFixed(4)} 부호정확도 ${fin.acc.toFixed(3)}`)
console.log(fin.mse < baseMse && fin.acc > 0.5 ? '→ PASS (학습이 무지 베이스라인보다 우수 + 부호정확도>0.5)' : '→ FAIL (학습 가치 불성립)')

const r5 = (x) => +x.toFixed(5)
writeFileSync(OUT, `// 자동 생성: scripts/train-valuenet.mjs (손수 편집 금지). DIM=${DIM} HIDDEN=${HIDDEN}.
import type { ValueNetWeights } from './value-net'
export const defaultValueNetWeights: ValueNetWeights = {
  dim: ${DIM},
  hidden: ${HIDDEN},
  w1: ${JSON.stringify(W1.map(r5))},
  b1: ${JSON.stringify(b1.map(r5))},
  w2: ${JSON.stringify(W2.map(r5))},
  b2: ${r5(b2)},
}
`)
console.log(`saved ${OUT}`)
