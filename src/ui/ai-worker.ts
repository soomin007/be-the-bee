/// <reference lib="webworker" />
// AI 계산(특히 전문가 MCTS, 수 초 소요)을 메인 스레드 밖에서 돌린다 → 계산 중에도 화면이 안 멈춰
// 로딩 오버레이/팁이 정상 동작한다. 엔진은 순수·JSON 직렬화 가능이라 상태/옵션을 그대로 주고받는다.
import { createAi } from '../engine/index'
import type { Ai, AiOptions, GameState, Player } from '../engine/index'

type InitMsg = { type: 'init'; yellow: AiOptions | null; brown: AiOptions | null }
type MoveMsg = { type: 'move'; id: number; side: Player; state: GameState }
type InMsg = InitMsg | MoveMsg

// 진영별 AI 를 워커 안에서 유지한다(시드 RNG 가 수 간 이어지도록 — 메인 스레드 옛 동작과 동일).
const ais: Record<Player, Ai | null> = { yellow: null, brown: null }
const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<InMsg>): void => {
  const msg = e.data
  if (msg.type === 'init') {
    ais.yellow = msg.yellow ? createAi(msg.yellow) : null
    ais.brown = msg.brown ? createAi(msg.brown) : null
    return
  }
  const ai = ais[msg.side]
  if (!ai) {
    ctx.postMessage({ id: msg.id, error: 'no-ai' })
    return
  }
  try {
    ctx.postMessage({ id: msg.id, move: ai.chooseMove(msg.state) })
  } catch (err) {
    ctx.postMessage({ id: msg.id, error: String(err) })
  }
}
