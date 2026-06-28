// 모바일 전용 화면 크롬 — game-ui 의 공유 보드/엔진과 분리(작업 겹침↓).
// game-ui.ts 는 mountGame 에서 initMobileShell({ root, onAction }) 를 한 번 호출하고,
//   - render() 끝에서 shell.afterRender() 를,
//   - 설정 섹션 헤더 클릭 시 shell.handleSectionClick(key) 를 부른다(모바일이면 드릴다운이 처리).
// 데스크탑(>720px)에서는 이 모듈이 만든 요소가 CSS(mobile.css)로 전부 숨겨지고 afterRender 는 무동작.
//
// 책임: 설정 시트 열고닫기(톱니/✕), 설정 아코디언 모바일 드릴다운(접힘 시작·하나씩),
//       좌하단 빠른 FAB(무르기·새 게임), 하단 안내 배너(상단 HUD 의 긴 안내를 아래로).

import { makeDraggable } from './draggable'

const MOBILE_QUERY = '(max-width: 720px)'

export interface MobileShellCtx {
  /** mountGame 의 루트(.game 을 포함). */
  readonly root: HTMLElement
  /** game-ui 의 onPanelAction. FAB 가 'undo'·'new' 등을 그대로 디스패치한다. */
  readonly onAction: (act: string) => void
}

export interface MobileShell {
  /** 지금 모바일 폭인가(matchMedia). */
  active(): boolean
  /** render() 끝에서 호출 — 모바일이면 아코디언 접힘·하단 안내 배너를 다시 맞춘다. */
  afterRender(): void
  /** 설정 섹션 헤더(sec:KEY) 클릭 처리. 모바일이면 true(드릴다운이 처리, 호출 측은 return). */
  handleSectionClick(key: string): boolean
  /** 설정 시트를 열거나 닫는다(온보딩 투어 등 외부에서 제어). */
  setSettings(open: boolean): void
}

export function initMobileShell(ctx: MobileShellCtx): MobileShell {
  const { root, onAction } = ctx
  const mq = window.matchMedia(MOBILE_QUERY)
  const gameEl = root.querySelector('.game') as HTMLElement

  let settingsOpen = false
  let openSection: string | null = null // 모바일 드릴다운: 펼쳐진 섹션 하나(없으면 전부 접힘)

  const btn = (cls: string, label: string, html: string): HTMLButtonElement => {
    const el = document.createElement('button')
    el.className = cls
    el.type = 'button'
    el.setAttribute('aria-label', label)
    el.title = label
    el.innerHTML = html
    return el
  }
  // 우상단: 설정 톱니/닫기. 좌하단: 무르기·새 게임 빠른 FAB.
  const gear = btn('m-fab m-gear', '설정', '⚙')
  const closeBtn = btn('m-fab m-close', '설정 닫기', '✕')
  const undoFab = btn('m-fab m-undo', '무르기', '<span class="m-ico">↩</span><span>무르기</span>')
  const newFab = btn('m-fab m-new', '새 게임', '<span class="m-ico">🔄</span><span>새 게임</span>')
  // 하단 안내 배너(상단 HUD 가 짧게 유지되도록 긴 안내문구를 여기로).
  const statusBanner = document.createElement('div')
  statusBanner.className = 'm-status'
  // 톱니·닫기·빠른 FAB 는 화면 고정 오버레이(.game). 안내 배너는 board-wrap 흐름에 넣어 HUD 바로
  // 아래에 자연스럽게 쌓이게 한다(고정 위치로 HUD 와 겹치던 문제 해결).
  for (const el of [gear, closeBtn, undoFab, newFab]) gameEl.appendChild(el)
  const boardWrap = root.querySelector('.board-wrap') as HTMLElement
  boardWrap.appendChild(statusBanner)

  function applySettingsOpen(): void {
    gameEl.classList.toggle('msettings-open', settingsOpen)
  }
  function toggleSettings(): void {
    settingsOpen = !settingsOpen
    applySettingsOpen()
  }
  // 톱니(설정) FAB: 꾹 눌러(롱프레스) 옮기고, 더블탭으로 원위치. 짧은 탭은 설정 열기. 위치는 기억.
  // 보드의 중요한 곳(말·벌집)을 가릴 때 비켜둘 수 있게 한다. 로직은 공통 유틸(draggable) 재사용.
  makeDraggable(gear, { storageKey: 'be-the-bee/gear-pos', onTap: toggleSettings })

  closeBtn.addEventListener('click', toggleSettings)
  undoFab.addEventListener('click', () => onAction('undo'))
  newFab.addEventListener('click', () => onAction('new'))

  // 패널 아코디언의 .acc 들을 openSection 기준으로 직접 토글(모바일 전용 — 데스크탑 sectionsOpen 불간섭).
  function applySections(): void {
    const panel = root.querySelector('.panel')
    if (!panel) return
    for (const acc of Array.from(panel.querySelectorAll('.acc'))) {
      const act = acc.querySelector('.acc-head')?.getAttribute('data-act') ?? ''
      const key = act.startsWith('sec:') ? act.slice(4) : ''
      acc.classList.toggle('open', key !== '' && key === openSection)
    }
  }

  // 상단 HUD 의 안내문구(.instruction)를 읽어 하단 배너에 옮긴다(상단은 CSS 로 안내를 숨김).
  function updateStatusBanner(): void {
    const instr = root.querySelector('.board-status .instruction')
    const text = instr?.textContent?.trim() ?? ''
    statusBanner.textContent = text
    statusBanner.classList.toggle('empty', text === '')
  }

  function afterRender(): void {
    if (!mq.matches) return
    applySections()
    updateStatusBanner()
  }

  function handleSectionClick(key: string): boolean {
    if (!mq.matches) return false
    openSection = openSection === key ? null : key // 같은 걸 다시 누르면 접기
    applySections()
    return true
  }

  // 데스크탑으로 전환되면 시트를 닫아 둔다(다시 모바일 와도 깔끔).
  mq.addEventListener('change', () => {
    if (!mq.matches) {
      settingsOpen = false
      applySettingsOpen()
    } else {
      afterRender()
    }
  })

  function setSettings(open: boolean): void {
    settingsOpen = open
    applySettingsOpen()
  }

  applySettingsOpen()
  return { active: () => mq.matches, afterRender, handleSectionClick, setSettings }
}
