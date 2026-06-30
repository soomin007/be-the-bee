// 학습 가치함수: 작은 MLP(피처 → hidden relu → 1 tanh). 순수 TS forward(엔진 제약 — DOM/fetch/외부
// 라이브러리 0). 가중치는 학습(scripts/train-valuenet.mjs)이 생성해 value-net-weights.ts 에 typed
// const 로 인라인한다. 추론과 학습이 이 forward 를 공유해 불일치를 차단한다.
import type { GameState } from './types'

export interface ValueNetWeights {
  readonly dim: number // 입력 피처 차원(ai.ts FEATURE_DIM 과 일치해야 함)
  readonly hidden: number
  readonly w1: readonly number[] // [dim*hidden] row-major: w1[i*hidden + j]
  readonly b1: readonly number[] // [hidden]
  readonly w2: readonly number[] // [hidden]
  readonly b2: number
}

// 노랑 관점 [-1,1] 의 leaf 평가기(state → 값). MCTS leaf 평가를 이걸로 교체할 수 있다.
export type LeafEvaluator = (state: GameState) => number

// 순수 forward: features(노랑 관점 정규화 벡터) → [-1,1]. hidden=relu, out=tanh.
export function valueNetForward(features: readonly number[], nn: ValueNetWeights): number {
  const h: number[] = new Array(nn.hidden)
  for (let j = 0; j < nn.hidden; j++) {
    let s = nn.b1[j]!
    for (let i = 0; i < nn.dim; i++) s += features[i]! * nn.w1[i * nn.hidden + j]!
    h[j] = s > 0 ? s : 0 // relu
  }
  let out = nn.b2
  for (let j = 0; j < nn.hidden; j++) out += h[j]! * nn.w2[j]!
  return Math.tanh(out)
}
