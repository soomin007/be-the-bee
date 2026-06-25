// 앱 사용법 온보딩 — 실제 화면 요소를 하나씩 "스포트라이트"로 짚어주는 가이드 투어.
// 게임 규칙 튜토리얼(tutorial.ts)과 별개다: 이쪽은 "이 프로그램을 어떻게 쓰는지"(수 두기·설정·온라인).
// 데스크탑(사이드 패널)과 모바일(톱니 시트·FAB)은 레이아웃이 달라 단계 목록을 따로 둔다.
// 마지막 장에서 게임 규칙 튜토리얼로 자연스럽게 이어갈 수 있다(openRules).

const SEEN_KEY = 'be-the-bee/onboarding-seen'

export function onboardingSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}
function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* 무시 */
  }
}

// game-ui 가 넘겨주는 환경 훅(온보딩은 레이아웃만 알고 게임 상태는 모른다).
export interface OnboardCtx {
  readonly root: HTMLElement
  readonly isMobile: () => boolean
  readonly mpEnabled: boolean // 온라인 대전 단계 노출 여부(Supabase 키 설정 시)
  readonly setMobileSettings: (open: boolean) => void // 모바일 설정 시트 열고닫기
  readonly setDesktopPanel: (open: boolean) => void // 데스크탑 설정 패널 펼치기
  readonly openRules: () => void // 게임 규칙 튜토리얼로 연결
}

interface Step {
  sel?: string | string[] // 강조할 요소 selector(없으면 중앙 카드). 배열이면 여러 요소를 한 번에 감싼다.
  title: string
  body: string
  before?: () => void // 단계 진입 직전 처리(모바일 시트 열기 등)
  pad?: number // 스포트라이트 여백(px)
  when?: () => boolean // false 면 이 단계를 건너뜀
}

function desktopSteps(ctx: OnboardCtx): Step[] {
  return [
    { title: '🐝 환영해요!', body: '이 앱을 어떻게 쓰는지 30초만 함께 볼게요.<br>화살표 키로도 넘길 수 있어요.' },
    {
      sel: '.board-wrap',
      title: '🍯 게임판',
      body: '여기에 타일과 말이 놓여요.<br>휠로 확대·축소, 드래그로 이동해요.',
      pad: 6,
    },
    {
      // 차례 라벨(ab-prompt)부터 ①·② 버튼까지만 감싼다(액션바 전체 폭의 빈 공간은 제외).
      sel: ['.action-bar .ab-prompt', '.action-bar [data-act="twoTiles"]', '.action-bar [data-act="tileAndPiece"]'],
      title: '👆 수 두는 법',
      body: '내 차례엔 여기서 행동을 골라요.<br>① 타일 2개 두기 · ② 타일 1개 + 말 1개.<br>고른 뒤 판을 클릭해 놓아요.',
    },
    {
      sel: '.board-status',
      title: '👀 상태 보기',
      body: '지금 누구 차례인지, 남은 타일과 말, 다음에 할 일 안내가 여기 떠요.',
    },
    {
      sel: '[data-act="menuMode"]',
      title: '⚙️ 모드·난이도',
      body: '사람끼리 · AI와 대결 · AI 관전 중에서 고르고, AI 난이도와 여왕벌·무한 모드도 여기서 바꿔요.',
    },
    {
      sel: ['[data-act="undo"]', '[data-act="new"]'],
      title: '↩️ 게임 관리',
      body: '무르기(U)·새 게임(N)·복기·공유·저장 버튼이 모여 있어요.',
    },
    {
      sel: '[data-act="onlineHost"]',
      title: '👥 온라인 대전',
      body: '방을 만들어 초대 링크를 보내면 멀리 있는 친구와도 함께 둘 수 있어요.',
      when: () => ctx.mpEnabled,
    },
  ]
}

function mobileSteps(ctx: OnboardCtx): Step[] {
  return [
    { title: '🐝 환영해요!', body: '이 앱을 어떻게 쓰는지 30초만 함께 볼게요.' },
    {
      sel: '.board-wrap',
      title: '🍯 게임판',
      body: '여기에 타일과 말이 놓여요.<br>두 손가락으로 확대, 한 손가락으로 이동해요.',
      pad: 4,
    },
    {
      sel: '.board-status',
      title: '👀 상태 보기',
      body: '맨 위 줄에 누구 차례인지, 누구와 두는지 떠요.',
    },
    {
      sel: '.action-bar',
      title: '👆 수 두는 법',
      body: '내 차례엔 오른쪽 아래 버튼으로 행동을 골라요.<br>① 타일 2개 · ② 타일 + 말.<br>고른 뒤 판을 탭해 놓아요.',
    },
    {
      sel: ['.m-undo', '.m-new'],
      title: '↩️ 빠른 버튼',
      body: '왼쪽 아래에서 무르기와 새 게임을 바로 할 수 있어요.',
    },
    {
      sel: '.m-gear',
      title: '⚙️ 설정 열기',
      body: '오른쪽 위 톱니를 누르면 설정이 열려요. 한번 볼까요?',
    },
    {
      sel: '.panel',
      title: '⚙️ 설정',
      body: '여기서 모드(사람끼리·AI·관전)와 난이도, 여왕벌/무한 모드, 테마·사운드, 그리고 온라인 대전을 바꿔요.',
      before: () => ctx.setMobileSettings(true),
      pad: 0,
    },
  ]
}

export function openOnboarding(ctx: OnboardCtx): void {
  const { root } = ctx
  const mobile = ctx.isMobile()
  if (mobile) ctx.setMobileSettings(false) // 모바일: 시트를 닫아 초기 단계(보드·HUD)가 안 가리게
  else ctx.setDesktopPanel(true) // 데스크탑: 패널이 보여야 패널 단계가 강조됨

  const steps = (mobile ? mobileSteps(ctx) : desktopSteps(ctx)).filter((s) => s.when?.() ?? true)
  // 공통 마무리 장(중앙 카드) — 여기서 게임 규칙으로 이어가거나 바로 시작.
  steps.push({
    title: '🎉 다 됐어요!',
    body: '이제 직접 해볼까요?<br>게임 규칙이 궁금하면 아래 “게임 규칙 보기”를 눌러요.',
    before: () => {
      if (mobile) ctx.setMobileSettings(false) // 마지막 장에선 시트를 닫아 보드가 보이게
    },
  })

  let idx = 0
  let repositionTimer = 0

  const layer = document.createElement('div')
  layer.className = 'coach-layer'
  layer.innerHTML = `<div class="coach-hole"></div><div class="coach-callout"></div>`
  root.appendChild(layer)
  const hole = layer.querySelector('.coach-hole') as HTMLElement
  const callout = layer.querySelector('.coach-callout') as HTMLElement

  function targetRect(step: Step): DOMRect | null {
    if (!step.sel) return null
    const sels = Array.isArray(step.sel) ? step.sel : [step.sel]
    let l = Infinity
    let t = Infinity
    let r = -Infinity
    let b = -Infinity
    for (const sel of sels) {
      const el = root.querySelector(sel) as HTMLElement | null
      if (!el) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const box = el.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) continue
      l = Math.min(l, box.left)
      t = Math.min(t, box.top)
      r = Math.max(r, box.right)
      b = Math.max(b, box.bottom)
    }
    if (l === Infinity) return null // 보이는 대상이 하나도 없으면 중앙 카드로
    return new DOMRect(l, t, r - l, b - t)
  }

  function place(): void {
    const step = steps[idx]!
    const rect = targetRect(step)
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cw = callout.offsetWidth
    const chh = callout.offsetHeight
    const gap = 14
    const margin = 10
    if (!rect) {
      layer.classList.add('center')
      hole.style.display = 'none'
      callout.style.left = `${Math.round((vw - cw) / 2)}px`
      callout.style.top = `${Math.round((vh - chh) / 2)}px`
      return
    }
    layer.classList.remove('center')
    const pad = step.pad ?? 8
    hole.style.display = 'block'
    hole.style.left = `${Math.round(rect.left - pad)}px`
    hole.style.top = `${Math.round(rect.top - pad)}px`
    hole.style.width = `${Math.round(rect.width + pad * 2)}px`
    hole.style.height = `${Math.round(rect.height + pad * 2)}px`
    // 세로: 아래에 자리가 있으면 아래, 없으면 위, 둘 다 안 되면(큰 대상) 화면 하단 고정.
    let top: number
    if (rect.bottom + gap + chh + margin <= vh) top = rect.bottom + gap
    else if (rect.top - gap - chh - margin >= 0) top = rect.top - gap - chh
    else top = vh - chh - margin
    // 가로: 대상 중심에 맞추되 화면 안으로 클램프.
    let left = rect.left + rect.width / 2 - cw / 2
    left = Math.max(margin, Math.min(left, vw - cw - margin))
    callout.style.left = `${Math.round(left)}px`
    callout.style.top = `${Math.round(top)}px`
  }

  function render(): void {
    const step = steps[idx]!
    step.before?.()
    const last = idx === steps.length - 1
    callout.innerHTML = `
      <button class="coach-skip" data-coach="skip" title="닫기">건너뛰기 ✕</button>
      <div class="coach-step">${idx + 1} / ${steps.length}</div>
      <h3 class="coach-title">${step.title}</h3>
      <div class="coach-body">${step.body}</div>
      <div class="coach-nav">
        <button data-coach="prev" ${idx === 0 ? 'disabled' : ''}>← 이전</button>
        ${last ? `<button class="coach-rules" data-coach="rules">📘 게임 규칙 보기</button>` : ''}
        <button class="coach-next" data-coach="next">${last ? '시작하기 🐝' : '다음 →'}</button>
      </div>`
    for (const el of Array.from(callout.querySelectorAll('[data-coach]'))) {
      el.addEventListener('click', () => handle(el.getAttribute('data-coach')))
    }
    // 레이아웃 직후 + 시트 슬라이드(트랜지션) 이후 한 번 더 위치 보정.
    requestAnimationFrame(place)
    window.clearTimeout(repositionTimer)
    repositionTimer = window.setTimeout(place, 300)
  }

  function handle(act: string | null): void {
    if (act === 'skip') return close()
    if (act === 'prev') {
      idx = Math.max(0, idx - 1)
      return render()
    }
    if (act === 'next') {
      if (idx === steps.length - 1) return close()
      idx += 1
      return render()
    }
    if (act === 'rules') {
      close()
      ctx.openRules()
    }
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowRight') {
      e.stopPropagation()
      e.preventDefault()
      handle('next')
    } else if (e.key === 'ArrowLeft') {
      e.stopPropagation()
      e.preventDefault()
      handle('prev')
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  const onResize = (): void => place()
  // 게임의 window keydown 보다 먼저 잡아 막는다(document capture).
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onResize, true)

  function close(): void {
    markSeen()
    window.clearTimeout(repositionTimer)
    document.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onResize, true)
    if (mobile) ctx.setMobileSettings(false) // 투어 중 연 시트를 닫아 둔다
    layer.remove()
  }

  render()
}

export function maybeShowOnboarding(ctx: OnboardCtx): void {
  if (!onboardingSeen()) openOnboarding(ctx)
}
