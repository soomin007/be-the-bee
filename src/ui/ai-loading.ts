// AI 로딩 대기 화면(엘레베이터 거울) — AI 가 한 수를 계산하는 동안 보드 위에 벌 스피너+팁을 띄운다.
// 계산은 Web Worker 에서 돌아 메인 스레드가 안 멈추므로 애니메이션·팁 회전이 실제로 움직인다.
// 계산이 짧으면(빠른 난이도) 임계값 전에 끝나 아예 안 뜬다(깜빡임 방지). 스타일: style.css 의 .ai-thinking-*.
import { nextTip } from './tips'

const SHOW_THRESHOLD_MS = 800 // 이보다 오래 걸리는 AI 계산에만 로딩 오버레이(초반 빠른 수 깜빡임 방지)
const MIN_SHOW_MS = 550 // 오버레이가 한 번 뜨면 최소 이만큼 유지(잠깐 떴다 사라지는 깜빡임 방지)
const TIP_ROTATE_MS = 3400 // 엘레베이터 거울: 기다리는 동안 팁을 돌리는 간격

export interface AiLoading {
  /** 임계값이 지나도 계산 중이면 오버레이를 띄우도록 예약한다. 발화 시점에 shouldShow 가 false 면(취소된 요청) 안 띄운다. */
  scheduleShow(shouldShow: () => boolean): void
  /** 아직 안 뜬 표시 예약을 취소한다(빠른 수는 안 띄움). */
  cancelPendingShow(): void
  /** 오버레이가 떠 있으면 최소 표시 시간을 지키도록 적용 시각을 늦춰 돌려준다. */
  applyAtWithMinShow(applyAt: number): number
  /** 오버레이를 내리고 팁 회전·표시 예약을 멈춘다. */
  hide(): void
}

/** 오버레이 DOM 을 host(보드 래퍼)에 붙이고 제어 API 를 돌려준다. */
export function createAiLoading(host: HTMLElement): AiLoading {
  const layer = document.createElement('div')
  layer.className = 'ai-thinking-layer'
  layer.setAttribute('aria-hidden', 'true')
  layer.innerHTML = `
    <div class="ai-thinking-card">
      <div class="ai-thinking-bee" aria-hidden="true">🐝</div>
      <div class="ai-thinking-title">AI가 다음 수를 고르고 있어요</div>
      <div class="ai-thinking-tip"></div>
    </div>
  `
  host.appendChild(layer)
  const tipEl = layer.querySelector('.ai-thinking-tip') as HTMLElement

  let showTimer: number | null = null // 지연 표시 타이머
  let shownAt: number | null = null // 오버레이를 띄운 시각(최소 표시 시간 보장용), 안 떴으면 null
  let tipTimer: number | null = null // 팁 회전 타이머
  let lastTip = '' // 직전 팁(연속 중복 방지)

  function setTipText(): void {
    lastTip = nextTip(lastTip)
    tipEl.textContent = lastTip
    tipEl.classList.remove('tip-in')
    void tipEl.offsetWidth // 리플로우로 애니메이션 재시작
    tipEl.classList.add('tip-in')
  }
  function show(): void {
    setTipText()
    shownAt = Date.now()
    layer.classList.add('show')
    layer.setAttribute('aria-hidden', 'false')
    if (tipTimer !== null) clearInterval(tipTimer)
    tipTimer = window.setInterval(setTipText, TIP_ROTATE_MS)
  }
  function cancelPendingShow(): void {
    if (showTimer !== null) {
      clearTimeout(showTimer)
      showTimer = null
    }
  }
  return {
    scheduleShow(shouldShow: () => boolean): void {
      cancelPendingShow()
      showTimer = window.setTimeout(() => {
        showTimer = null
        if (shouldShow()) show()
      }, SHOW_THRESHOLD_MS)
    },
    cancelPendingShow,
    applyAtWithMinShow(applyAt: number): number {
      return shownAt === null ? applyAt : Math.max(applyAt, shownAt + MIN_SHOW_MS)
    },
    hide(): void {
      cancelPendingShow()
      shownAt = null
      layer.classList.remove('show')
      layer.setAttribute('aria-hidden', 'true')
      if (tipTimer !== null) {
        clearInterval(tipTimer)
        tipTimer = null
      }
    },
  }
}
