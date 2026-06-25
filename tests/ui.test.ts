// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mountGame } from '../src/ui/game-ui'

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

// 행동 선택 버튼(①/②) 클릭. 모든 턴이 행동 선택으로 시작한다(첫 턴은 ①이 비활성, ②만 가능).
function chooseAction(root: HTMLElement, act: 'twoTiles' | 'tileAndPiece'): void {
  const btn = Array.from(root.querySelectorAll('.action-bar button')).find((b) => b.getAttribute('data-act') === act)
  if (btn) click(btn)
}

describe('핫시트 UI (headless DOM)', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    localStorage.clear() // 저장된 설정이 테스트 간 새지 않게
    document.body.innerHTML = ''
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  it('에러 없이 마운트되고 보드·패널을 그린다', () => {
    mountGame(root)
    const svg = root.querySelector('svg.board')
    expect(svg).not.toBeNull()
    // 시드 타일 2개 이상이 폴리곤으로 그려진다
    expect(svg!.querySelectorAll('polygon').length).toBeGreaterThanOrEqual(2)
    // 차례 표시는 설정 패널이 아니라 보드 좌상단 HUD(.board-status)로 옮겼다.
    expect(root.querySelector('.board-status')!.textContent).toContain('노랑 차례')
  })

  it('선플레이어 첫 턴은 행동 ①(타일 2개)이 비활성, ② 선택 시 타일+말 안내가 뜬다', () => {
    mountGame(root)
    const findAct = (act: string): HTMLButtonElement | undefined =>
      Array.from(root.querySelectorAll('.action-bar button')).find((b) => b.getAttribute('data-act') === act) as
        | HTMLButtonElement
        | undefined
    // 첫 턴엔 두 버튼이 다 보이되 ①(타일 2개)은 비활성, ②(타일+말)만 가능.
    expect(findAct('twoTiles')!.disabled).toBe(true)
    expect(findAct('tileAndPiece')!.disabled).toBe(false)
    chooseAction(root, 'tileAndPiece')
    expect(root.querySelector('.instruction')!.textContent).toContain('타일+말')
  })

  it('프론티어 클릭 → 말 놓기로 첫 수를 두면 갈색 차례로 넘어간다', () => {
    mountGame(root)
    chooseAction(root, 'tileAndPiece') // 첫 턴 행동 선택(②)
    // 1) 타일 놓을 자리(프론티어): opacity 0.22 점선 폴리곤
    const frontier = Array.from(root.querySelectorAll('polygon')).filter(
      (p) => p.getAttribute('opacity') === '0.22',
    )
    expect(frontier.length).toBeGreaterThan(0)
    click(frontier[0]!)

    // 2) 말 놓을 수 있는 칸(초록 테두리 링)
    const targets = Array.from(root.querySelectorAll('polygon')).filter(
      (p) => p.getAttribute('stroke') === '#16a34a',
    )
    expect(targets.length).toBeGreaterThan(0)
    click(targets[0]!)

    // 첫 수 완료 → 턴 교대
    expect(root.querySelector('.board-status')!.textContent).toContain('갈색 차례')
    // 말 하나가 그려졌다
    expect(root.querySelectorAll('svg.board circle.piece').length).toBe(1)
  })

  it('새 게임 버튼은 초기 상태로 되돌린다', () => {
    mountGame(root)
    // 첫 수 진행
    chooseAction(root, 'tileAndPiece') // 첫 턴 행동 선택(②)
    const frontier = Array.from(root.querySelectorAll('polygon')).filter(
      (p) => p.getAttribute('opacity') === '0.22',
    )
    click(frontier[0]!)
    const targets = Array.from(root.querySelectorAll('polygon')).filter(
      (p) => p.getAttribute('stroke') === '#16a34a',
    )
    click(targets[0]!)
    expect(root.querySelectorAll('svg.board circle.piece').length).toBe(1)

    const newBtn = Array.from(root.querySelectorAll('button')).find((b) => b.getAttribute('data-act') === 'new')
    click(newBtn!)
    expect(root.querySelector('.board-status')!.textContent).toContain('노랑 차례')
    expect(root.querySelectorAll('svg.board circle.piece').length).toBe(0)
  })

  it('vs AI 모드: 사람 첫 수 후 AI(갈색)가 자동으로 둔다', () => {
    vi.useFakeTimers()
    try {
      mountGame(root)
      // 모드 메뉴 열고 vs AI 선택
      const menuBtn = Array.from(root.querySelectorAll('button')).find((b) => b.getAttribute('data-act') === 'menuMode')!
      click(menuBtn)
      const vsAiOpt = Array.from(root.querySelectorAll('button')).find((b) => b.getAttribute('data-act') === 'setMode:vsAi')!
      click(vsAiOpt)

      // 사람(노랑) 첫 수: 행동 선택(②) → 타일 → 말
      chooseAction(root, 'tileAndPiece')
      const frontier = Array.from(root.querySelectorAll('polygon')).filter((p) => p.getAttribute('opacity') === '0.22')
      click(frontier[0]!)
      const targets = Array.from(root.querySelectorAll('polygon')).filter((p) => p.getAttribute('stroke') === '#16a34a')
      click(targets[0]!)
      expect(root.querySelectorAll('svg.board circle.piece').length).toBe(1) // 노랑 말 1

      // AI 타이머 진행 → 갈색이 한 수 둔다
      vi.advanceTimersByTime(400)
      expect(root.querySelectorAll('svg.board circle.piece').length).toBeGreaterThanOrEqual(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('복기: 과거 국면을 되감아 보고, 종료하면 실시간으로 돌아온다', () => {
    mountGame(root)
    const pieceCount = (): number => root.querySelectorAll('svg.board circle.piece').length
    const findAct = (act: string): HTMLButtonElement | undefined =>
      Array.from(root.querySelectorAll('button')).find((b) => b.getAttribute('data-act') === act) as
        | HTMLButtonElement
        | undefined
    const playMove = (): void => {
      // 2수째부터는 ①/② 선택 단계가 먼저 — ②(타일+말) 선택
      const choose = findAct('tileAndPiece')
      if (choose) click(choose)
      const frontier = Array.from(root.querySelectorAll('polygon')).filter((p) => p.getAttribute('opacity') === '0.22')
      click(frontier[0]!)
      const targets = Array.from(root.querySelectorAll('polygon')).filter((p) => p.getAttribute('stroke') === '#16a34a')
      click(targets[0]!)
    }
    playMove() // 노랑
    playMove() // 갈색
    expect(pieceCount()).toBe(2)

    // 복기 진입 → 시작 국면(0수) — 말 0개
    click(findAct('replayEnter')!)
    expect(root.querySelector('.panel')!.textContent).toContain('복기')
    expect(pieceCount()).toBe(0)

    // 다음 수 → 말 1개, 다시 → 2개
    click(findAct('replayNext')!)
    expect(pieceCount()).toBe(1)
    click(findAct('replayNext')!)
    expect(pieceCount()).toBe(2)

    // 이전 수 → 1개
    click(findAct('replayPrev')!)
    expect(pieceCount()).toBe(1)

    // 종료 → 실시간 복귀(2개)
    click(findAct('replayExit')!)
    expect(root.querySelector('.panel')!.textContent).not.toContain('복기 종료')
    expect(pieceCount()).toBe(2)
  })
})
