// 플로팅 요소(설정 톱니 FAB · 음악 미니 플레이어)를 "꾹 눌러(롱프레스) 이동, 더블탭으로 원위치"
// 시킨다. position:fixed(톱니)·absolute(미니 플레이어) 둘 다 left/top 인라인으로 옮기고, 옮긴
// 위치를 localStorage 에 기억한다. 짧은 탭은 onTap(예: 설정 토글), 내부 버튼/슬라이더는 보존한다.
//
// 좌표계: fixed 는 뷰포트, 그 외는 offsetParent(가까운 positioned 조상)를 기준으로 left/top 을 둔다.
// 그래서 둘 다 같은 코드로 옮기고 같은 방식으로 화면 경계 안에 가둘 수 있다.

export interface DraggableOptions {
  /** 옮긴 위치를 기억할 localStorage 키. */
  readonly storageKey: string
  /** 이동이 아닌 '짧은 탭'일 때 동작(없으면 무시 — 내부 버튼이 처리한다). */
  readonly onTap?: () => void
  /** 이동 모드로 들어가기까지 눌러야 하는 시간(ms). 기본 350. */
  readonly longPressMs?: number
  /** 탭과 드래그를 가르는 이동 거리(px). 기본 6. */
  readonly moveThresh?: number
  /** 더블탭으로 인정하는 두 탭 사이 간격(ms). 기본 280. */
  readonly doubleTapMs?: number
  /** 화면/부모 경계에서 띄울 여백(px). 기본 6. */
  readonly edgeMargin?: number
  /** 이 셀렉터에 맞는 내부 버튼은 '짧은 탭=onTap, 더블탭=원위치'로 다룬다(원래 click 은 막음).
   *  예: 미니 플레이어의 펼침/접힘을 onTap 으로 통합해 더블탭 원위치를 일관되게 한다. */
  readonly tapThroughSelector?: string
}

export interface DraggableHandle {
  /** 저장 위치를 지우고 CSS 기본 자리로 되돌린다. */
  resetPosition(): void
  /** 리스너를 모두 해제한다. */
  destroy(): void
}

// 짧은 탭으로 동작해야 하는 내부 요소(이동/원위치 로직이 가로채면 안 됨).
const INTERACTIVE = 'button, a, input, select, textarea, [role="button"], [data-act], [data-seek], [data-vol]'

export function makeDraggable(el: HTMLElement, opts: DraggableOptions): DraggableHandle {
  const longPressMs = opts.longPressMs ?? 350
  const moveThresh = opts.moveThresh ?? 6
  const doubleTapMs = opts.doubleTapMs ?? 280
  const edge = opts.edgeMargin ?? 6

  let pos: { x: number; y: number } | null = (() => {
    try {
      const p = JSON.parse(localStorage.getItem(opts.storageKey) ?? 'null')
      return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null
    } catch {
      return null
    }
  })()

  // 배치 기준 컨테이너(fixed=뷰포트, 그 외=offsetParent). 인라인 left/top 이 이 기준으로 해석된다.
  function containerRect(): { left: number; top: number; width: number; height: number } {
    if (getComputedStyle(el).position === 'fixed') {
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    }
    const op = (el.offsetParent as HTMLElement | null) ?? document.documentElement
    const r = op.getBoundingClientRect()
    return { left: r.left, top: r.top, width: op.clientWidth, height: op.clientHeight }
  }
  function clamp(x: number, y: number): { x: number; y: number } {
    const c = containerRect()
    const w = el.offsetWidth || 0
    const h = el.offsetHeight || 0
    return {
      x: Math.min(Math.max(x, edge), Math.max(edge, c.width - w - edge)),
      y: Math.min(Math.max(y, edge), Math.max(edge, c.height - h - edge)),
    }
  }
  function applyPos(): void {
    if (!pos) {
      el.style.left = el.style.top = el.style.right = el.style.bottom = ''
      return
    }
    const p = clamp(pos.x, pos.y)
    el.style.left = `${p.x}px`
    el.style.top = `${p.y}px`
    el.style.right = 'auto'
    el.style.bottom = 'auto'
  }
  function resetPosition(): void {
    pos = null
    try {
      localStorage.removeItem(opts.storageKey)
    } catch {
      /* 무시 */
    }
    applyPos()
  }

  // 드래그 후 발생하는 합성 click 한 번을 막는다(이동하다 버튼 위에서 떼도 버튼이 안 눌리게).
  function suppressNextClick(): void {
    const block = (e: MouseEvent): void => {
      e.stopImmediatePropagation()
      e.preventDefault()
      document.removeEventListener('click', block, true)
    }
    document.addEventListener('click', block, true)
    window.setTimeout(() => document.removeEventListener('click', block, true), 400)
  }

  function isInteractive(target: Element | null): boolean {
    // host 탭(onTap)으로 다뤄야 하는 영역(예: 미니 플레이어 펼침/접힘)은 인터랙티브로 보지 않는다.
    if (opts.tapThroughSelector && target?.closest(opts.tapThroughSelector)) return false
    const hit = target?.closest(INTERACTIVE)
    return !!hit && hit !== el && el.contains(hit)
  }

  let down: { x: number; y: number; left: number; top: number } | null = null
  let moved = 0
  let armed = false // 롱프레스 성립 → 이동 모드
  let lpTimer = 0
  let skipTap = false // 시작점이 내부 버튼 → 짧은 탭은 그쪽이 처리
  let onSlider = false // 슬라이더(seek/vol) 위 → 이 유틸은 비관여(슬라이더 조작 우선)
  let downTarget: Element | null = null // 눌린 지점(탭 종류 판정용)
  let pendingTap = 0

  // fromButton: 시작점이 내부 버튼이면 단일 탭은 그 버튼이 즉시 처리하고, 더블탭만 원위치로 쓴다.
  // (미니 플레이어의 접힘 알약처럼 통째 버튼인 경우에도 더블탭 원위치가 되게 한다.)
  function handleTap(fromButton: boolean): void {
    if (pendingTap) {
      window.clearTimeout(pendingTap)
      pendingTap = 0
      resetPosition() // 두 번째 탭 = 더블탭 → 원위치
      if (fromButton) suppressNextClick() // 두 번째 탭의 버튼 click 은 무시(원위치만)
      return
    }
    pendingTap = window.setTimeout(() => {
      pendingTap = 0
      if (!fromButton) opts.onTap?.() // 빈 영역 단일 탭만 onTap(버튼은 자기 click 이 즉시 처리)
    }, doubleTapMs)
  }

  const onDown = (ev: PointerEvent): void => {
    onSlider = !!(ev.target as Element | null)?.closest('[data-seek],[data-vol]')
    if (onSlider) return
    downTarget = ev.target as Element | null
    skipTap = isInteractive(ev.target as Element | null)
    const r = el.getBoundingClientRect()
    const c = containerRect()
    down = { x: ev.clientX, y: ev.clientY, left: r.left - c.left, top: r.top - c.top }
    moved = 0
    armed = false
    window.clearTimeout(lpTimer)
    lpTimer = window.setTimeout(() => {
      armed = true
      el.classList.add('dragging')
      try {
        el.setPointerCapture(ev.pointerId)
      } catch {
        /* 캡처 실패 무시 */
      }
      navigator.vibrate?.(12) // 이동 모드 진입 햅틱(지원 기기만)
    }, longPressMs)
  }
  const onMove = (ev: PointerEvent): void => {
    if (!down) return
    moved = Math.max(moved, Math.hypot(ev.clientX - down.x, ev.clientY - down.y))
    if (!armed) {
      if (moved > moveThresh) window.clearTimeout(lpTimer) // 롱프레스 전에 움직이면 이동 의도 아님
      return
    }
    pos = clamp(down.left + (ev.clientX - down.x), down.top + (ev.clientY - down.y))
    applyPos()
  }
  const onUp = (ev: PointerEvent): void => {
    if (onSlider) {
      onSlider = false
      return
    }
    if (!down) return
    window.clearTimeout(lpTimer)
    try {
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId)
    } catch {
      /* 무시 */
    }
    const wasDrag = armed
    down = null
    armed = false
    if (wasDrag) {
      el.classList.remove('dragging')
      try {
        if (pos) localStorage.setItem(opts.storageKey, JSON.stringify(pos))
      } catch {
        /* 영속 실패는 무시 — 이번 세션 이동은 유효 */
      }
      suppressNextClick()
      return
    }
    if (moved > moveThresh) return // 살짝 움직였지만 롱프레스 안 됨 → 탭 아님
    // tapThrough 영역(펼침/접힘 버튼)은 원래 click 을 막고 onTap/원위치로 대체한다.
    if (opts.tapThroughSelector && downTarget?.closest(opts.tapThroughSelector)) suppressNextClick()
    handleTap(skipTap) // skipTap(버튼 위)이면 단일은 버튼이 처리, 더블탭만 원위치
  }
  const onCancel = (): void => {
    window.clearTimeout(lpTimer)
    if (armed) el.classList.remove('dragging')
    down = null
    armed = false
    onSlider = false
  }
  const onKey = (ev: KeyboardEvent): void => {
    if (!opts.onTap) return
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      opts.onTap()
    }
  }
  const onResize = (): void => {
    if (pos) applyPos()
  }

  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onCancel)
  if (opts.onTap) el.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)

  // 요소 크기가 바뀌면(예: 미니 플레이어를 알약→카드로 펼치면) 새 크기 기준으로 다시 화면 안에 가둔다.
  // 작은 알약일 때 우하단 끝에 뒀다가 큰 카드로 펼치면 오른쪽·아래로 삐져나가던 문제 방지.
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (pos) applyPos() }) : null
  ro?.observe(el)
  applyPos()

  return {
    resetPosition,
    destroy(): void {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
      window.clearTimeout(lpTimer)
      window.clearTimeout(pendingTap)
    },
  }
}
